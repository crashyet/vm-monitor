import React from 'react';
import { Terminal, Power, MoreVertical, Edit2, Trash2, Cpu, HardDrive, Clock, Activity, Zap, Play } from 'lucide-react';
import { NodeItem } from '../types/index.ts';

interface NodeCardProps {
  node: NodeItem;
  onOpenTerminal: (node: NodeItem) => void;
  onOpenPower: (node: NodeItem, action: 'reboot' | 'shutdown') => void;
  onOpenEdit: (node: NodeItem) => void;
  onDelete: (node: NodeItem) => void;
  onOpenQuickSnippet: (node: NodeItem) => void;
  onTestConnection: (node: NodeItem) => void;
  isTesting?: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatUptime(seconds: number): string {
  if (seconds <= 0) return '-';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export const NodeCard: React.FC<NodeCardProps> = ({
  node,
  onOpenTerminal,
  onOpenPower,
  onOpenEdit,
  onDelete,
  onOpenQuickSnippet,
  onTestConnection,
}) => {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const metrics = node.metrics;
  const isOnline = metrics?.status === 'online';

  const cpuPercent = metrics?.cpuUsagePercent ?? 0;
  const ramPercent = metrics?.ram?.usagePercent ?? 0;
  const diskPercent = metrics?.disk?.usagePercent ?? 0;

  // Color classes for progress
  const getProgressColor = (percent: number) => {
    if (percent >= 85) return 'bg-rose-500';
    if (percent >= 70) return 'bg-amber-500';
    return 'bg-[#e66000]';
  };

  return (
    <div className="bg-[#171a22] border border-[#242934] rounded-lg shadow-sm hover:border-[#353d4e] transition-all flex flex-col justify-between overflow-hidden">
      {/* Card Header */}
      <div className="p-4 border-b border-[#202530] bg-[#1a1e27]/50">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-2.5">
            {/* Status Pulse Indicator */}
            <span className="relative flex h-3 w-3">
              {isOnline ? (
                <>
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                </>
              ) : (
                <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
              )}
            </span>

            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-semibold text-sm text-white tracking-tight">{node.name}</h3>
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[#242a36] text-[#8e98a8] border border-[#2e3646]">
                  {node.group_name || 'Default'}
                </span>
              </div>
              <p className="text-xs text-[#717d91] font-mono mt-0.5">
                {node.username}@{node.host}:{node.port}
              </p>
            </div>
          </div>

          {/* Action Menu Toggle */}
          <div className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-1 text-[#788599] hover:text-white hover:bg-[#252b37] rounded transition-colors"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {menuOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 mt-1 w-44 bg-[#1e232d] border border-[#2f3747] rounded shadow-xl py-1 z-30 text-xs text-[#cfd6e2]">
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onTestConnection(node);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-[#282f3d] flex items-center space-x-2"
                  >
                    <Activity className="w-3.5 h-3.5 text-blue-400" />
                    <span>Test Connection</span>
                  </button>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onOpenQuickSnippet(node);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-[#282f3d] flex items-center space-x-2"
                  >
                    <Play className="w-3.5 h-3.5 text-amber-400" />
                    <span>Run Snippet</span>
                  </button>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onOpenEdit(node);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-[#282f3d] flex items-center space-x-2"
                  >
                    <Edit2 className="w-3.5 h-3.5 text-[#ff8c33]" />
                    <span>Edit Configuration</span>
                  </button>
                  <div className="my-1 border-t border-[#2a3240]" />
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onDelete(node);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-rose-950/60 text-rose-400 flex items-center space-x-2"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Node</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Metrics Body */}
      <div className="p-4 space-y-3.5 flex-1 text-xs">
        {/* Latency & Uptime Strip */}
        <div className="flex items-center justify-between text-[11px] text-[#717d91] bg-[#13161c] px-2.5 py-1 rounded border border-[#202530]">
          <div className="flex items-center space-x-1">
            <Zap className="w-3 h-3 text-amber-400" />
            <span>Latency:</span>
            <span className="font-mono text-white">
              {metrics?.latencyMs !== undefined ? `${metrics.latencyMs}ms` : '-'}
            </span>
          </div>
          <div className="flex items-center space-x-1">
            <Clock className="w-3 h-3 text-cyan-400" />
            <span>Uptime:</span>
            <span className="font-mono text-white">{formatUptime(metrics?.uptimeSeconds || 0)}</span>
          </div>
        </div>

        {/* CPU Metric */}
        <div>
          <div className="flex justify-between items-center mb-1 text-[#8b97ab]">
            <span className="flex items-center space-x-1">
              <Cpu className="w-3.5 h-3.5 text-[#ff7a1a]" />
              <span>CPU Usage</span>
            </span>
            <span className="font-mono text-white font-semibold">{isOnline ? `${cpuPercent}%` : '-'}</span>
          </div>
          <div className="w-full bg-[#202530] h-2 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${getProgressColor(cpuPercent)}`}
              style={{ width: isOnline ? `${cpuPercent}%` : '0%' }}
            />
          </div>
        </div>

        {/* RAM Metric */}
        <div>
          <div className="flex justify-between items-center mb-1 text-[#8b97ab]">
            <span className="flex items-center space-x-1">
              <Activity className="w-3.5 h-3.5 text-emerald-400" />
              <span>RAM</span>
            </span>
            <span className="font-mono text-white">
              {isOnline
                ? `${formatBytes(metrics?.ram?.usedBytes || 0)} / ${formatBytes(metrics?.ram?.totalBytes || 0)} (${ramPercent}%)`
                : '-'}
            </span>
          </div>
          <div className="w-full bg-[#202530] h-2 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${getProgressColor(ramPercent)}`}
              style={{ width: isOnline ? `${ramPercent}%` : '0%' }}
            />
          </div>
        </div>

        {/* Disk Metric */}
        <div>
          <div className="flex justify-between items-center mb-1 text-[#8b97ab]">
            <span className="flex items-center space-x-1">
              <HardDrive className="w-3.5 h-3.5 text-blue-400" />
              <span>Disk ({metrics?.disk?.mountPoint || '/'})</span>
            </span>
            <span className="font-mono text-white">
              {isOnline
                ? `${formatBytes(metrics?.disk?.usedBytes || 0)} / ${formatBytes(metrics?.disk?.totalBytes || 0)} (${diskPercent}%)`
                : '-'}
            </span>
          </div>
          <div className="w-full bg-[#202530] h-2 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${getProgressColor(diskPercent)}`}
              style={{ width: isOnline ? `${diskPercent}%` : '0%' }}
            />
          </div>
        </div>

        {/* Load Average */}
        <div className="text-[11px] text-[#717d91] flex items-center justify-between pt-1">
          <span>Load Avg (1m, 5m, 15m):</span>
          <span className="font-mono text-slate-300">
            {isOnline ? metrics?.loadAvg?.map((n) => n.toFixed(2)).join(', ') : '-'}
          </span>
        </div>

        {/* Error notice if unreachable */}
        {metrics?.status !== 'online' && metrics?.error && (
          <div className="p-2 bg-rose-950/40 border border-rose-900/50 rounded text-rose-300 text-[11px] truncate">
            {metrics.error}
          </div>
        )}
      </div>

      {/* Card Footer: Quick Actions */}
      <div className="p-3 bg-[#14171d] border-t border-[#202530] flex items-center justify-between gap-2">
        <button
          onClick={() => onOpenTerminal(node)}
          className="flex-1 flex items-center justify-center space-x-1.5 py-1.5 px-3 bg-[#202632] hover:bg-[#28303f] text-[#ff8c33] font-medium text-xs rounded border border-[#2e3748] transition-colors shadow-sm"
        >
          <Terminal className="w-3.5 h-3.5" />
          <span>Console</span>
        </button>

        <div className="flex items-center space-x-1">
          <button
            onClick={() => onOpenPower(node, 'reboot')}
            title="Reboot VM"
            className="p-1.5 text-amber-400 hover:bg-amber-950/40 hover:text-amber-300 rounded border border-[#272d3a] transition-colors"
          >
            <Power className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onOpenPower(node, 'shutdown')}
            title="Shutdown VM"
            className="p-1.5 text-rose-400 hover:bg-rose-950/40 hover:text-rose-300 rounded border border-[#272d3a] transition-colors"
          >
            <Power className="w-3.5 h-3.5 rotate-90" />
          </button>
        </div>
      </div>
    </div>
  );
};
