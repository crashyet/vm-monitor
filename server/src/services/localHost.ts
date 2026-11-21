import fs from 'node:fs';
import { spawn, execSync, ChildProcess } from 'node:child_process';
import os from 'node:os';
import { NodeMetrics } from './ssh.js';

let prevCpuIdle = 0;
let prevCpuTotal = 0;

export function getLocalHostMetrics(): NodeMetrics {
  let cpuUsagePercent = 0;
  let memTotal = 0;
  let memUsed = 0;
  let memPercent = 0;
  let diskTotal = 0;
  let diskUsed = 0;
  let diskPercent = 0;
  let loadAvg: [number, number, number] = [0, 0, 0];
  let uptimeSeconds = 0;

  try {
    // 1. CPU Usage from /proc/stat
    const statData = fs.readFileSync('/proc/stat', 'utf8');
    const firstLine = statData.split('\n')[0];
    if (firstLine.startsWith('cpu')) {
      const parts = firstLine.split(/\s+/).slice(1).map(Number);
      const idle = (parts[3] || 0) + (parts[4] || 0);
      const total = parts.reduce((a, b) => a + b, 0);

      if (prevCpuTotal > 0 && total > prevCpuTotal) {
        const deltaTotal = total - prevCpuTotal;
        const deltaIdle = idle - prevCpuIdle;
        cpuUsagePercent = Math.max(0, Math.min(100, Math.round(((deltaTotal - deltaIdle) / deltaTotal) * 100)));
      }
      prevCpuIdle = idle;
      prevCpuTotal = total;
    }
  } catch (_) {}

  try {
    // 2. RAM from /proc/meminfo
    const memData = fs.readFileSync('/proc/meminfo', 'utf8');
    const lines = memData.split('\n');
    let totalKb = 0;
    let availKb = 0;
    let freeKb = 0;
    let buffersKb = 0;
    let cachedKb = 0;

    for (const l of lines) {
      const [k, v] = l.split(':').map((s) => s.trim());
      const val = parseInt(v || '0', 10);
      if (k === 'MemTotal') totalKb = val;
      if (k === 'MemAvailable') availKb = val;
      if (k === 'MemFree') freeKb = val;
      if (k === 'Buffers') buffersKb = val;
      if (k === 'Cached') cachedKb = val;
    }

    memTotal = totalKb * 1024;
    if (availKb > 0) {
      memUsed = Math.max(0, memTotal - availKb * 1024);
    } else {
      memUsed = Math.max(0, memTotal - (freeKb + buffersKb + cachedKb) * 1024);
    }
    memPercent = memTotal > 0 ? Math.round((memUsed / memTotal) * 100) : 0;
  } catch (_) {}

  try {
    // 3. Disk from df -P -B1 /
    const dfOut = execSync('df -P -B1 / 2>/dev/null', { encoding: 'utf8' });
    const line = dfOut.trim().split('\n')[1];
    if (line) {
      const tokens = line.split(/\s+/);
      diskTotal = parseInt(tokens[1], 10) || 0;
      diskUsed = parseInt(tokens[2], 10) || 0;
      diskPercent = diskTotal > 0 ? Math.round((diskUsed / diskTotal) * 100) : 0;
    }
  } catch (_) {}

  try {
    // 4. Load average & uptime
    const l = os.loadavg();
    loadAvg = [parseFloat(l[0].toFixed(2)), parseFloat(l[1].toFixed(2)), parseFloat(l[2].toFixed(2))];
    uptimeSeconds = Math.round(os.uptime());
  } catch (_) {}

  return {
    nodeId: '__host__',
    status: 'online',
    cpuUsagePercent,
    ram: {
      totalBytes: memTotal,
      usedBytes: memUsed,
      usagePercent: memPercent,
    },
    disk: {
      totalBytes: diskTotal,
      usedBytes: diskUsed,
      usagePercent: diskPercent,
      mountPoint: '/',
    },
    loadAvg,
    uptimeSeconds,
    lastChecked: Date.now(),
    latencyMs: 0,
  };
}

export interface LocalShellProcess {
  process: ChildProcess;
  write: (data: Buffer | string) => void;
  resize: (cols: number, rows: number) => void;
  onData: (cb: (data: Buffer) => void) => void;
  onClose: (cb: () => void) => void;
  kill: () => void;
}

/**
 * Spawns an interactive bash shell with true Linux PTY via the standard 'script' utility.
 */
export function spawnLocalHostShell(cols = 80, rows = 24): LocalShellProcess {
  // Use Linux built-in 'script' to allocate pseudo-terminal without external C++ bindings
  const shell = process.env.SHELL || '/bin/bash';
  const child = spawn('script', ['-q', '-f', '-c', shell, '/dev/null'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      COLUMNS: String(cols),
      LINES: String(rows),
    },
  });

  return {
    process: child,
    write: (data) => {
      if (child.stdin && !child.stdin.destroyed) {
        child.stdin.write(data);
      }
    },
    resize: (newCols, newRows) => {
      // In script PTY, stty can be called or child process notified
      try {
        if (child.stdin && !child.stdin.destroyed) {
          child.stdin.write(`stty rows ${newRows} cols ${newCols} 2>/dev/null\n`);
        }
      } catch (_) {}
    },
    onData: (cb) => {
      if (child.stdout) child.stdout.on('data', cb);
      if (child.stderr) child.stderr.on('data', cb);
    },
    onClose: (cb) => {
      child.on('close', cb);
    },
    kill: () => {
      try {
        child.kill('SIGTERM');
      } catch (_) {}
    },
  };
}
