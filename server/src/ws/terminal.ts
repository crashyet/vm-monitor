import { WebSocket } from 'ws';
import { IncomingMessage } from 'node:http';
import url from 'node:url';
import jwt from 'jsonwebtoken';
import { db } from '../config/db.js';
import { env } from '../config/env.js';
import { decrypt } from '../services/crypto.js';
import { spawnSSHShell, SSHNodeConfig } from '../services/ssh.js';
import { spawnLocalHostShell, LocalShellProcess } from '../services/localHost.js';

interface PersistentSession {
  key: string;
  nodeId: string;
  type: 'local' | 'ssh';
  localShell?: LocalShellProcess;
  sshClient?: any;
  sshStream?: any;
  proxyProcess?: any;
  historyBuffer: Buffer[];
  historyBytes: number;
  activeWs: WebSocket | null;
  idleTimer?: NodeJS.Timeout;
  lastCols: number;
  lastRows: number;
}

// In-memory persistent session pool: sessionKey -> PersistentSession
const sessionPool = new Map<string, PersistentSession>();
const MAX_HISTORY_BYTES = 128 * 1024; // 128 KB buffer per persistent session
const IDLE_SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes keepalive in background

function appendHistory(session: PersistentSession, data: Buffer) {
  session.historyBuffer.push(data);
  session.historyBytes += data.length;

  while (session.historyBytes > MAX_HISTORY_BYTES && session.historyBuffer.length > 0) {
    const dropped = session.historyBuffer.shift();
    if (dropped) session.historyBytes -= dropped.length;
  }
}

function terminateSession(session: PersistentSession) {
  if (session.idleTimer) {
    clearTimeout(session.idleTimer);
  }

  if (session.type === 'local' && session.localShell) {
    session.localShell.kill();
  } else if (session.type === 'ssh') {
    try {
      if (session.sshStream) session.sshStream.end();
      if (session.sshClient) {
        session.sshClient.end();
        session.sshClient.destroy();
      }
    } catch (_) {}
    if (session.proxyProcess) {
      try {
        session.proxyProcess.kill();
      } catch (_) {}
    }
  }

  sessionPool.delete(session.key);
}

export function handleTerminalWebSocket(ws: WebSocket, req: IncomingMessage) {
  const parsedUrl = url.parse(req.url || '', true);
  const { nodeId, token, cols: qCols, rows: qRows } = parsedUrl.query;

  let currentCols = parseInt((qCols as string) || '80', 10);
  let currentRows = parseInt((qRows as string) || '24', 10);

  // 1. Verify JWT Authentication Token
  if (!token || typeof token !== 'string') {
    ws.send(`\r\n\x1b[31m[NexusSSH] Error: Missing authentication token.\x1b[0m\r\n`);
    ws.close(1008, 'Unauthorized');
    return;
  }

  let decodedUser: any = null;
  try {
    decodedUser = jwt.verify(token, env.JWT_SECRET);
  } catch (err) {
    ws.send(`\r\n\x1b[31m[NexusSSH] Error: Invalid or expired session token.\x1b[0m\r\n`);
    ws.close(1008, 'Unauthorized');
    return;
  }

  if (!nodeId || typeof nodeId !== 'string') {
    ws.send(`\r\n\x1b[31m[NexusSSH] Error: Missing target nodeId parameter.\x1b[0m\r\n`);
    ws.close(1002, 'Bad Request');
    return;
  }

  const userId = decodedUser?.id || 'admin';
  const sessionKey = `${userId}:${nodeId}`;

  // Check if a persistent session is already alive for this node/host
  let existingSession = sessionPool.get(sessionKey);

  if (existingSession) {
    // Re-attach to running persistent session!
    if (existingSession.idleTimer) {
      clearTimeout(existingSession.idleTimer);
      existingSession.idleTimer = undefined;
    }

    // Detach any previous dangling websocket if any
    if (existingSession.activeWs && existingSession.activeWs !== ws) {
      try {
        existingSession.activeWs.close(1000, 'Re-attached from another client');
      } catch (_) {}
    }
    existingSession.activeWs = ws;

    ws.send(`\x1b[32m[NexusSSH] ⚡ Re-attached to active background session (${existingSession.type.toUpperCase()})\x1b[0m\r\n`);

    // Replay terminal history buffer so screen state is restored
    for (const chunk of existingSession.historyBuffer) {
      ws.send(chunk);
    }

    // Apply new resize dimensions
    if (existingSession.type === 'local' && existingSession.localShell) {
      existingSession.localShell.resize(currentCols, currentRows);
    } else if (existingSession.type === 'ssh' && existingSession.sshStream) {
      existingSession.sshStream.setWindow(currentRows, currentCols, 0, 0);
    }

    // Setup WebSocket message & close handlers for existing session
    wireSessionToWebSocket(existingSession, ws);
    return;
  }

  // No existing session: Spawn a new one
  if (nodeId === '__host__') {
    // -------------------------------------------------------------
    // FEATURE 1: HOST CONSOLE (Direct shell on the Home Server Host)
    // -------------------------------------------------------------
    ws.send(`\x1b[36m[NexusSSH] Spawning local host shell on ${process.env.USER || 'host'}@${process.env.HOSTNAME || 'localhost'}...\x1b[0m\r\n`);

    const localShell = spawnLocalHostShell(currentCols, currentRows);

    const session: PersistentSession = {
      key: sessionKey,
      nodeId: '__host__',
      type: 'local',
      localShell,
      historyBuffer: [],
      historyBytes: 0,
      activeWs: ws,
      lastCols: currentCols,
      lastRows: currentRows,
    };
    sessionPool.set(sessionKey, session);

    localShell.onData((data: Buffer) => {
      appendHistory(session, data);
      if (session.activeWs && session.activeWs.readyState === WebSocket.OPEN) {
        session.activeWs.send(data);
      }
    });

    localShell.onClose(() => {
      if (session.activeWs && session.activeWs.readyState === WebSocket.OPEN) {
        session.activeWs.send(`\r\n\x1b[33m[Host shell session ended]\x1b[0m\r\n`);
        session.activeWs.close();
      }
      terminateSession(session);
    });

    wireSessionToWebSocket(session, ws);
    return;
  }

  // -------------------------------------------------------------
  // REMOTE SSH VM CONSOLE WITH PERSISTENCE
  // -------------------------------------------------------------
  const stmt = db.prepare('SELECT id, name, host, port, username, auth_type, encrypted_credential, iv_tag FROM nodes WHERE id = ?');
  const node = stmt.get(nodeId) as any;

  if (!node) {
    ws.send(`\r\n\x1b[31m[NexusSSH] Error: Node not found in database.\x1b[0m\r\n`);
    ws.close(1002, 'Node not found');
    return;
  }

  let credential = '';
  try {
    credential = decrypt(node.encrypted_credential, node.iv_tag);
  } catch (err: any) {
    ws.send(`\r\n\x1b[31m[NexusSSH] Decryption error: ${err.message}\x1b[0m\r\n`);
    ws.close(1011, 'Decryption failure');
    return;
  }

  const sshConfig: SSHNodeConfig = {
    host: node.host,
    port: node.port,
    username: node.username,
    authType: node.auth_type,
    credential,
  };

  ws.send(`\x1b[33mConnecting to ${node.username}@${node.host}:${node.port}...\x1b[0m\r\n`);

  let isWsClosed = false;
  const earlyInputQueue: (Buffer | string)[] = [];

  const earlyMsgHandler = (message: Buffer | string) => {
    earlyInputQueue.push(message);
  };
  const earlyCloseHandler = () => {
    isWsClosed = true;
  };

  ws.on('message', earlyMsgHandler);
  ws.on('close', earlyCloseHandler);

  spawnSSHShell(sshConfig, currentCols, currentRows)
    .then(({ client, stream, proxyProcess }) => {
      ws.off('message', earlyMsgHandler);
      ws.off('close', earlyCloseHandler);

      const session: PersistentSession = {
        key: sessionKey,
        nodeId,
        type: 'ssh',
        sshClient: client,
        sshStream: stream,
        proxyProcess,
        historyBuffer: [],
        historyBytes: 0,
        activeWs: isWsClosed ? null : ws,
        lastCols: currentCols,
        lastRows: currentRows,
      };
      sessionPool.set(sessionKey, session);

      // If user closed WebSocket during connect, arm idle timer
      if (isWsClosed) {
        session.idleTimer = setTimeout(() => terminateSession(session), IDLE_SESSION_TIMEOUT_MS);
        return;
      }

      // Flush early buffered inputs
      while (earlyInputQueue.length > 0) {
        const item = earlyInputQueue.shift();
        if (item) {
          const str = typeof item === 'string' ? item : item.toString('utf8');
          if (str.startsWith('{')) {
            try {
              const p = JSON.parse(str);
              if (p.type === 'resize') {
                stream.setWindow(p.rows, p.cols, 0, 0);
                continue;
              }
            } catch (_) {}
          }
          stream.write(item);
        }
      }

      stream.on('data', (data: Buffer) => {
        appendHistory(session, data);
        if (session.activeWs && session.activeWs.readyState === WebSocket.OPEN) {
          session.activeWs.send(data);
        }
      });

      stream.on('close', () => {
        if (session.activeWs && session.activeWs.readyState === WebSocket.OPEN) {
          session.activeWs.send(`\r\n\x1b[33m[Connection closed by remote host]\x1b[0m\r\n`);
          session.activeWs.close();
        }
        terminateSession(session);
      });

      wireSessionToWebSocket(session, ws);
    })
    .catch((err: Error) => {
      ws.off('message', earlyMsgHandler);
      ws.off('close', earlyCloseHandler);
      const errMsg = err.message || (err as any).code || 'Connection lost / host unreachable';
      console.error(`[TERMINAL WS] Failed to connect to ${node.host}:`, errMsg);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(`\r\n\x1b[31m[NexusSSH] Connection failed: ${errMsg}\x1b[0m\r\n`);
        ws.close(1011, errMsg);
      }
    });
}

function wireSessionToWebSocket(session: PersistentSession, ws: WebSocket) {
  ws.on('message', (message: Buffer | string) => {
    try {
      const msgStr = typeof message === 'string' ? message : message.toString('utf8');
      if (msgStr.startsWith('{')) {
        const parsed = JSON.parse(msgStr);
        if (parsed.type === 'resize' && parsed.cols && parsed.rows) {
          session.lastCols = parsed.cols;
          session.lastRows = parsed.rows;
          if (session.type === 'local' && session.localShell) {
            session.localShell.resize(parsed.cols, parsed.rows);
          } else if (session.type === 'ssh' && session.sshStream) {
            session.sshStream.setWindow(parsed.rows, parsed.cols, 0, 0);
          }
          return;
        }

        if (parsed.type === 'reset_session') {
          // Explicitly terminate session requested by user
          ws.send(`\r\n\x1b[33m[Resetting session...]\x1b[0m\r\n`);
          terminateSession(session);
          ws.close(1000, 'Session Reset');
          return;
        }
      }
    } catch (_) {}

    // Forward input to shell
    if (session.type === 'local' && session.localShell) {
      session.localShell.write(message);
    } else if (session.type === 'ssh' && session.sshStream) {
      session.sshStream.write(message);
    }
  });

  ws.on('close', () => {
    if (session.activeWs === ws) {
      session.activeWs = null;
      // FEATURE 5: DO NOT KILL THE SESSION!
      // Keep it alive in background for 30 minutes!
      if (!session.idleTimer) {
        session.idleTimer = setTimeout(() => {
          terminateSession(session);
        }, IDLE_SESSION_TIMEOUT_MS);
      }
    }
  });
}
