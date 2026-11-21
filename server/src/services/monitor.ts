import { db } from '../config/db.js';
import { decrypt } from './crypto.js';
import { executeSSHCommand, NodeMetrics, SSHNodeConfig } from './ssh.js';

interface RawNodeRecord {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  auth_type: 'password' | 'key';
  encrypted_credential: string;
  iv_tag: string;
}

// In-memory latest metrics cache: nodeId -> NodeMetrics
const metricsCache: Map<string, NodeMetrics> = new Map();

// Event listeners for metric updates (used by WebSocket broadcaster)
type MetricsListener = (metrics: NodeMetrics[]) => void;
const listeners: Set<MetricsListener> = new Set();

export function subscribeMetrics(listener: MetricsListener) {
  listeners.add(listener);
  // Send initial cache immediately
  listener(getAllCachedMetrics());
  return () => {
    listeners.delete(listener);
  };
}

export function getAllCachedMetrics(): NodeMetrics[] {
  return Array.from(metricsCache.values());
}

export function getNodeCachedMetrics(nodeId: string): NodeMetrics | undefined {
  return metricsCache.get(nodeId);
}

// Lightweight bash script executed on target VM to gather all metrics in a single roundtrip
const METRIC_COLLECT_SCRIPT = `
# CPU stats
cat /proc/stat | grep '^cpu ' | head -n 1
echo "---MEM---"
cat /proc/meminfo | grep -E '^(MemTotal|MemFree|MemAvailable|Buffers|Cached):'
echo "---DISK---"
df -P -B1 / | tail -n 1
echo "---UPTIME---"
cat /proc/uptime 2>/dev/null || uptime
echo "---LOAD---"
cat /proc/loadavg 2>/dev/null || echo "0.0 0.0 0.0"
`;

// Previous CPU readings to calculate CPU percentage delta
interface CpuReading {
  idle: number;
  total: number;
  timestamp: number;
}
const prevCpuMap: Map<string, CpuReading> = new Map();

function parseMetricsOutput(nodeId: string, output: string, latencyMs: number): NodeMetrics {
  const parts = output.split('\n');
  let currentSection = 'CPU';

  let cpuLine = '';
  const memLines: string[] = [];
  let diskLine = '';
  let uptimeLine = '';
  let loadLine = '';

  for (const rawLine of parts) {
    const line = rawLine.trim();
    if (line === '---MEM---') {
      currentSection = 'MEM';
      continue;
    }
    if (line === '---DISK---') {
      currentSection = 'DISK';
      continue;
    }
    if (line === '---UPTIME---') {
      currentSection = 'UPTIME';
      continue;
    }
    if (line === '---LOAD---') {
      currentSection = 'LOAD';
      continue;
    }

    if (currentSection === 'CPU' && line.startsWith('cpu')) {
      cpuLine = line;
    } else if (currentSection === 'MEM') {
      memLines.push(line);
    } else if (currentSection === 'DISK') {
      if (!diskLine && line) diskLine = line;
    } else if (currentSection === 'UPTIME') {
      if (!uptimeLine && line) uptimeLine = line;
    } else if (currentSection === 'LOAD') {
      if (!loadLine && line) loadLine = line;
    }
  }

  // 1. Calculate CPU usage
  let cpuUsagePercent = 0;
  if (cpuLine) {
    const tokens = cpuLine.split(/\s+/).slice(1).map(Number);
    // [user, nice, system, idle, iowait, irq, softirq, steal, guest, guest_nice]
    const idle = (tokens[3] || 0) + (tokens[4] || 0); // idle + iowait
    const total = tokens.reduce((acc, val) => acc + val, 0);

    const prev = prevCpuMap.get(nodeId);
    if (prev && total > prev.total) {
      const totalDelta = total - prev.total;
      const idleDelta = idle - prev.idle;
      cpuUsagePercent = Math.max(0, Math.min(100, Math.round(((totalDelta - idleDelta) / totalDelta) * 100)));
    }
    prevCpuMap.set(nodeId, { idle, total, timestamp: Date.now() });
  }

  // 2. Parse Memory (in bytes)
  let memTotal = 0;
  let memAvailable = 0;
  let memFree = 0;
  let buffers = 0;
  let cached = 0;

  for (const m of memLines) {
    const [key, valStr] = m.split(':').map((s) => s.trim());
    const valKb = parseInt(valStr || '0', 10);
    if (key === 'MemTotal') memTotal = valKb * 1024;
    if (key === 'MemAvailable') memAvailable = valKb * 1024;
    if (key === 'MemFree') memFree = valKb * 1024;
    if (key === 'Buffers') buffers = valKb * 1024;
    if (key === 'Cached') cached = valKb * 1024;
  }

  let memUsed = 0;
  if (memAvailable > 0) {
    memUsed = Math.max(0, memTotal - memAvailable);
  } else {
    memUsed = Math.max(0, memTotal - (memFree + buffers + cached));
  }
  const ramPercent = memTotal > 0 ? Math.round((memUsed / memTotal) * 100) : 0;

  // 3. Parse Disk (from df -P -B1 /)
  // Format: Filesystem 1B-blocks Used Available Capacity Mounted on
  let diskTotal = 0;
  let diskUsed = 0;
  let diskPercent = 0;
  let mountPoint = '/';

  if (diskLine) {
    const dfTokens = diskLine.split(/\s+/);
    if (dfTokens.length >= 6) {
      diskTotal = parseInt(dfTokens[1], 10) || 0;
      diskUsed = parseInt(dfTokens[2], 10) || 0;
      const capStr = dfTokens[4].replace('%', '');
      diskPercent = parseInt(capStr, 10) || (diskTotal > 0 ? Math.round((diskUsed / diskTotal) * 100) : 0);
      mountPoint = dfTokens[5] || '/';
    }
  }

  // 4. Parse Load average
  let loadAvg: [number, number, number] = [0, 0, 0];
  if (loadLine) {
    const loadTokens = loadLine.split(/\s+/).map((s) => parseFloat(s));
    if (loadTokens.length >= 3 && !isNaN(loadTokens[0])) {
      loadAvg = [loadTokens[0], loadTokens[1], loadTokens[2]];
    }
  }

  // 5. Parse Uptime (seconds)
  let uptimeSeconds = 0;
  if (uptimeLine) {
    const uptimeTokens = uptimeLine.split(/\s+/);
    if (uptimeTokens.length > 0 && !isNaN(parseFloat(uptimeTokens[0]))) {
      uptimeSeconds = Math.round(parseFloat(uptimeTokens[0]));
    }
  }

  return {
    nodeId,
    status: 'online',
    cpuUsagePercent,
    ram: {
      totalBytes: memTotal,
      usedBytes: memUsed,
      usagePercent: ramPercent,
    },
    disk: {
      totalBytes: diskTotal,
      usedBytes: diskUsed,
      usagePercent: diskPercent,
      mountPoint,
    },
    loadAvg,
    uptimeSeconds,
    lastChecked: Date.now(),
    latencyMs,
  };
}

/**
 * Polls a single node asynchronously with strict timeout.
 */
async function pollNode(node: RawNodeRecord): Promise<NodeMetrics> {
  const startTime = Date.now();
  try {
    const decryptedCredential = decrypt(node.encrypted_credential, node.iv_tag);
    const sshConfig: SSHNodeConfig = {
      host: node.host,
      port: node.port,
      username: node.username,
      authType: node.auth_type,
      credential: decryptedCredential,
    };

    // Generous 12s timeout for remote nodes / tunnels / VPNs
    const result = await executeSSHCommand(sshConfig, METRIC_COLLECT_SCRIPT, 12000);
    const latencyMs = Date.now() - startTime;
    return parseMetricsOutput(node.id, result.stdout, latencyMs);
  } catch (err: any) {
    const isTimeout = err.message?.includes('timed out');
    return {
      nodeId: node.id,
      status: isTimeout ? 'unreachable' : 'offline',
      cpuUsagePercent: 0,
      ram: { totalBytes: 0, usedBytes: 0, usagePercent: 0 },
      disk: { totalBytes: 0, usedBytes: 0, usagePercent: 0, mountPoint: '/' },
      loadAvg: [0, 0, 0],
      uptimeSeconds: 0,
      lastChecked: Date.now(),
      error: err.message || 'SSH connection failed',
    };
  }
}

let isPollingRunning = false;

/**
 * Executes one monitoring cycle across all active nodes in parallel.
 */
export async function runMonitoringCycle() {
  if (isPollingRunning) return;
  isPollingRunning = true;

  try {
    const nodesStmt = db.prepare('SELECT id, name, host, port, username, auth_type, encrypted_credential, iv_tag FROM nodes');
    const nodes = nodesStmt.all() as unknown as RawNodeRecord[];

    if (nodes.length === 0) {
      isPollingRunning = false;
      return;
    }

    // Execute non-blocking parallel polling for each node
    const results = await Promise.all(nodes.map((node) => pollNode(node)));

    for (const metric of results) {
      metricsCache.set(metric.nodeId, metric);
    }

    // Broadcast updated metrics to all active WebSocket clients
    const allMetrics = Array.from(metricsCache.values());
    for (const listener of listeners) {
      try {
        listener(allMetrics);
      } catch (err) {
        console.error('[MONITOR] Error calling listener:', err);
      }
    }
  } catch (err) {
    console.error('[MONITOR] Error during monitoring cycle:', err);
  } finally {
    isPollingRunning = false;
  }
}

let monitorIntervalTimer: NodeJS.Timeout | null = null;

export function startMonitoringService(intervalMs = 6000) {
  if (monitorIntervalTimer) return;
  console.log(`[MONITOR] Starting background monitoring worker (interval: ${intervalMs}ms)...`);
  // Run first cycle immediately
  runMonitoringCycle();
  monitorIntervalTimer = setInterval(runMonitoringCycle, intervalMs);
}

export function stopMonitoringService() {
  if (monitorIntervalTimer) {
    clearInterval(monitorIntervalTimer);
    monitorIntervalTimer = null;
  }
}
