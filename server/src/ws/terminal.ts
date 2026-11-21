import { WebSocket } from 'ws';
import { IncomingMessage } from 'node:http';
import url from 'node:url';
import jwt from 'jsonwebtoken';
import { ClientChannel } from 'ssh2';
import { db } from '../config/db.js';
import { env } from '../config/env.js';
import { decrypt } from '../services/crypto.js';
import { spawnSSHShell, SSHNodeConfig } from '../services/ssh.js';

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

  try {
    jwt.verify(token, env.JWT_SECRET);
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

  // 2. Fetch Node & Decrypt Credentials
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

  // State flags & input queue before shell is established
  let isWsClosed = false;
  let activeStream: ClientChannel | null = null;
  let activeClient: any = null;
  let activeProxyProcess: any = null;
  const inputBuffer: (Buffer | string)[] = [];

  const cleanup = () => {
    try {
      if (activeStream) activeStream.end();
      if (activeClient) {
        activeClient.end();
        activeClient.destroy();
      }
    } catch (_) {}
    if (activeProxyProcess) {
      try {
        activeProxyProcess.kill();
      } catch (_) {}
    }
  };

  // Register listeners immediately so no user keystroke or resize is dropped
  ws.on('message', (message: Buffer | string) => {
    try {
      const msgStr = typeof message === 'string' ? message : message.toString('utf8');
      if (msgStr.startsWith('{')) {
        const parsed = JSON.parse(msgStr);
        if (parsed.type === 'resize' && parsed.cols && parsed.rows) {
          currentCols = parsed.cols;
          currentRows = parsed.rows;
          if (activeStream) {
            activeStream.setWindow(currentRows, currentCols, 0, 0);
          }
          return;
        }
      }
    } catch (_) {
      // Not JSON, treat as raw input
    }

    if (activeStream) {
      activeStream.write(message);
    } else {
      inputBuffer.push(message);
    }
  });

  ws.on('close', () => {
    isWsClosed = true;
    cleanup();
  });

  ws.on('error', (err) => {
    isWsClosed = true;
    cleanup();
  });

  // 3. Spawn SSH Shell with PTY
  spawnSSHShell(sshConfig, currentCols, currentRows)
    .then(({ client, stream, proxyProcess }) => {
      if (isWsClosed) {
        // WebSocket was closed while connecting
        try {
          stream.end();
          client.end();
        } catch (_) {}
        if (proxyProcess) proxyProcess.kill();
        return;
      }

      activeClient = client;
      activeStream = stream;
      activeProxyProcess = proxyProcess;

      // Apply initial resize if window changed during connection
      stream.setWindow(currentRows, currentCols, 0, 0);

      // Flush any queued keystrokes
      while (inputBuffer.length > 0) {
        const buffered = inputBuffer.shift();
        if (buffered) stream.write(buffered);
      }

      // SSH stream -> Browser WebSocket
      stream.on('data', (data: Buffer) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(data);
        }
      });

      stream.on('close', () => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(`\r\n\x1b[33m[Connection closed by remote host]\x1b[0m\r\n`);
          ws.close();
        }
        cleanup();
      });
    })
    .catch((err: Error) => {
      console.error(`[TERMINAL WS] Failed to connect to ${node.host}:`, err.message);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(`\r\n\x1b[31m[NexusSSH] Connection failed: ${err.message}\x1b[0m\r\n`);
        ws.close(1011, err.message);
      }
      cleanup();
    });
}
