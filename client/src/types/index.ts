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
  loadAvg: [number, number, number];
  uptimeSeconds: number;
  lastChecked: number;
  latencyMs?: number;
  error?: string;
}

export interface NodeItem {
  id: string;
  name: string;
  group_name: string;
  host: string;
  port: number;
  username: string;
  auth_type: 'password' | 'key';
  created_at: string;
  updated_at: string;
  is_host?: boolean;
  metrics?: NodeMetrics;
}

export interface SnippetItem {
  id: string;
  title: string;
  command: string;
  description?: string;
  created_at: string;
}

export interface UserItem {
  id: string;
  username: string;
}
