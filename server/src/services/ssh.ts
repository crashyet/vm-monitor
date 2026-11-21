import { Client, ConnectConfig, ClientChannel } from 'ssh2';
import { spawn, execSync } from 'node:child_process';
import { Duplex } from 'node:stream';

export interface SSHNodeConfig {
  host: string;
  port: number;
  username: string;
  authType: 'password' | 'key';
  credential: string; // decrypted password or private key
  passphrase?: string;
}

export interface NodeMetrics {
  nodeId: string;
  status: 'online' | 'offline' | 'unreachable';
  cpuUsagePercent: number;
  ram: {
    totalBytes: number;
    usedBytes: number;
    usagePercent: number;
  };
  disk: {
    totalBytes: number;
    usedBytes: number;
    usagePercent: number;
    mountPoint: string;
  };
  loadAvg: [number, number, number]; // 1m, 5m, 15m
  uptimeSeconds: number;
  lastChecked: number;
  latencyMs?: number;
  error?: string;
}

/**
 * Creates a Duplex stream from a spawned child process (e.g. cloudflared or tailscale).
 * Captures stderr so failures have informative error messages.
 */
function createProcessStream(cmd: string): { stream: Duplex; childProcess: any } {
  const envPath = `${process.env.PATH || ''}:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${process.env.HOME || ''}/.local/bin`;
  const cp = spawn(cmd, { shell: true, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, PATH: envPath } });
  const stream = Duplex.from({ readable: cp.stdout, writable: cp.stdin });
  let stderrBuf = '';

  cp.stderr?.on('data', (d) => {
    stderrBuf += d.toString();
  });

  cp.on('error', (err) => {
    stream.destroy(new Error(`Proxy process error (${cmd}): ${err.message}`));
  });

  cp.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      const detail = stderrBuf.trim() || `exit code ${code}`;
      stream.destroy(new Error(`Proxy command failed: ${detail}`));
    }
  });

  stream.on('error', () => {});
  return { stream, childProcess: cp };
}

/**
 * Checks if ~/.ssh/config specifies a ProxyCommand (e.g. cloudflared access ssh),
 * or auto-detects Cloudflare Tunnel domains, or Tailscale IPs (100.x.x.x),
 * and spawns it as a Duplex stream.
 */
function resolveProxyStream(host: string, port: number): { stream?: Duplex; childProcess?: any } {
  const envPath = `${process.env.PATH || ''}:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${process.env.HOME || ''}/.local/bin`;
  
  // 1. Try standard ssh -G lookup
  try {
    const output = execSync(`ssh -G "${host}" 2>/dev/null`, {
      encoding: 'utf8',
      timeout: 2500,
      env: { ...process.env, PATH: envPath },
    });
    const match = output.match(/^proxycommand\s+(.+)$/im);
    if (match && match[1] && match[1].trim() !== 'none') {
      const rawCmd = match[1].trim();
      const cmd = rawCmd.replace(/%h/g, host).replace(/%p/g, String(port));
      return createProcessStream(cmd);
    }
  } catch (_) {}

  // 1b. If running under systemd/root, also check if /home/adhit/.ssh/config exists
  try {
    const output = execSync(`ssh -F /home/adhit/.ssh/config -G "${host}" 2>/dev/null`, {
      encoding: 'utf8',
      timeout: 2500,
      env: { ...process.env, PATH: envPath },
    });
    const match = output.match(/^proxycommand\s+(.+)$/im);
    if (match && match[1] && match[1].trim() !== 'none') {
      const rawCmd = match[1].trim();
      const cmd = rawCmd.replace(/%h/g, host).replace(/%p/g, String(port));
      return createProcessStream(cmd);
    }
  } catch (_) {}

  // 2. Auto-detect Cloudflare Tunnel domains (e.g. *.crashyet.tech, ssh-*, *.trycloudflare.com)
  const isIp = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(host) || host.includes(':');
  const isLocal = host === 'localhost' || host === '127.0.0.1';

  if (!isIp && !isLocal) {
    const isCloudflareTunnel =
      host.includes('crashyet.tech') ||
      host.startsWith('ssh-') ||
      host.includes('trycloudflare.com') ||
      host.includes('cfargot.net') ||
      host.includes('cloudflare');

    if (isCloudflareTunnel) {
      // Auto-route through cloudflared access ssh
      return createProcessStream(`cloudflared access ssh --hostname ${host}`);
    }
  }

  // 3. If host is a Tailscale IP (100.64.0.0/10), use tailscale nc
  if (host.startsWith('100.')) {
    return createProcessStream(`tailscale nc ${host} ${port}`);
  }

  return {};
}

export function buildConnectConfig(config: SSHNodeConfig, timeoutMs = 10000): {
  sshConfig: ConnectConfig;
  proxyProcess?: any;
} {
  const sshConfig: ConnectConfig = {
    username: config.username,
    readyTimeout: timeoutMs,
    keepaliveInterval: 10000,
    keepaliveCountMax: 3,
    tryKeyboard: true, // Handle PAM / keyboard-interactive passwords
    algorithms: {
      serverHostKey: [
        'ssh-ed25519',
        'ecdsa-sha2-nistp256',
        'ecdsa-sha2-nistp384',
        'ecdsa-sha2-nistp521',
        'rsa-sha2-512',
        'rsa-sha2-256',
        'ssh-rsa',
      ],
    },
  };

  // Check for proxy command in SSH config (e.g. cloudflared)
  const proxy = resolveProxyStream(config.host, config.port || 22);
  if (proxy.stream) {
    sshConfig.sock = proxy.stream;
  } else {
    sshConfig.host = config.host;
    sshConfig.port = config.port || 22;
  }

  if (config.authType === 'password') {
    sshConfig.password = config.credential;
  } else {
    sshConfig.privateKey = config.credential;
    if (config.passphrase) {
      sshConfig.passphrase = config.passphrase;
    }
  }

  return { sshConfig, proxyProcess: proxy.childProcess };
}

/**
 * Tests connection to a remote SSH host.
 */
export async function testSSHConnection(
  config: SSHNodeConfig,
  timeoutMs = 10000
): Promise<{ success: boolean; latencyMs?: number; osInfo?: string; error?: string }> {
  const startTime = Date.now();
  return new Promise((resolve) => {
    const conn = new Client();
    let isResolved = false;
    let { sshConfig, proxyProcess } = buildConnectConfig(config, timeoutMs);

    const cleanup = () => {
      try {
        conn.end();
        conn.destroy();
      } catch (_) {}
      if (proxyProcess) {
        try {
          proxyProcess.kill();
        } catch (_) {}
      }
    };

    const timer = setTimeout(() => {
      if (!isResolved) {
        isResolved = true;
        cleanup();
        resolve({ success: false, error: `Connection timed out after ${timeoutMs}ms. Check host, port, or firewall.` });
      }
    }, timeoutMs);

    // Support PAM / keyboard-interactive
    conn.on('keyboard-interactive', (_name, _inst, _lang, prompts, finish) => {
      if (config.authType === 'password') {
        finish([config.credential]);
      } else {
        finish([]);
      }
    });

    conn
      .on('ready', () => {
        const latencyMs = Date.now() - startTime;
        // Run a lightweight command to fetch OS name
        conn.exec('uname -srm 2>/dev/null || uname -a', (err, stream) => {
          if (err) {
            clearTimeout(timer);
            isResolved = true;
            cleanup();
            return resolve({ success: true, latencyMs, osInfo: 'Linux' });
          }
          let output = '';
          stream.on('data', (data: Buffer) => {
            output += data.toString();
          });
          stream.on('close', () => {
            clearTimeout(timer);
            isResolved = true;
            cleanup();
            resolve({
              success: true,
              latencyMs,
              osInfo: output.trim() || 'Linux Standard',
            });
          });
        });
      })
      .on('error', (err) => {
        clearTimeout(timer);
        if (!isResolved) {
          isResolved = true;
          cleanup();
          let msg = err.message || 'SSH connection error';
          if (!msg || msg.trim() === '') {
            msg = 'Connection error (socket closed or host unreachable)';
          }
          if (msg.includes('All configured authentication methods failed')) {
            msg = 'Authentication failed. Please verify SSH username and password or private key.';
          }
          resolve({ success: false, error: msg });
        }
      })
      .connect(sshConfig);
  });
}

/**
 * Executes a one-off command over SSH and returns output.
 */
export async function executeSSHCommand(
  config: SSHNodeConfig,
  command: string,
  timeoutMs = 15000
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let isDone = false;
    const { sshConfig, proxyProcess } = buildConnectConfig(config, timeoutMs);

    const cleanup = () => {
      try {
        conn.end();
        conn.destroy();
      } catch (_) {}
      if (proxyProcess) {
        try {
          proxyProcess.kill();
        } catch (_) {}
      }
    };

    const timer = setTimeout(() => {
      if (!isDone) {
        isDone = true;
        cleanup();
        reject(new Error(`Command timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    conn.on('keyboard-interactive', (_name, _inst, _lang, prompts, finish) => {
      if (config.authType === 'password') {
        finish([config.credential]);
      } else {
        finish([]);
      }
    });

    conn
      .on('ready', () => {
        conn.exec(command, (err, stream) => {
          if (err) {
            clearTimeout(timer);
            isDone = true;
            cleanup();
            return reject(err);
          }

          let stdout = '';
          let stderr = '';

          stream.on('data', (data: Buffer) => {
            stdout += data.toString();
          });
          stream.stderr.on('data', (data: Buffer) => {
            stderr += data.toString();
          });
          stream.on('close', (code: number) => {
            clearTimeout(timer);
            isDone = true;
            cleanup();
            resolve({ stdout, stderr, exitCode: code ?? 0 });
          });
        });
      })
      .on('error', (err) => {
        clearTimeout(timer);
        if (!isDone) {
          isDone = true;
          cleanup();
          reject(err);
        }
      })
      .connect(sshConfig);
  });
}

/**
 * Spawns an interactive PTY shell over SSH.
 */
export function spawnSSHShell(
  config: SSHNodeConfig,
  cols = 80,
  rows = 24
): Promise<{ client: Client; stream: ClientChannel; proxyProcess?: any }> {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    // 35s timeout for high-latency tunnels / remote relays
    const { sshConfig, proxyProcess } = buildConnectConfig(config, 35000);

    conn.on('keyboard-interactive', (_name, _inst, _lang, prompts, finish) => {
      if (config.authType === 'password') {
        finish([config.credential]);
      } else {
        finish([]);
      }
    });

    conn
      .on('ready', () => {
        conn.shell(
          {
            term: 'xterm-256color',
            cols,
            rows,
          },
          (err, stream) => {
            if (err) {
              conn.end();
              if (proxyProcess) proxyProcess.kill();
              return reject(err);
            }
            resolve({ client: conn, stream, proxyProcess });
          }
        );
      })
      .on('error', (err) => {
        if (proxyProcess) proxyProcess.kill();
        const msg = err.message || (err as any).level || 'Connection failed or socket reset';
        reject(new Error(msg));
      })
      .connect(sshConfig);
  });
}
