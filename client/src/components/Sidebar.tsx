import React from 'react';
import { Server, Layers, Globe, Filter } from 'lucide-react';
import { NodeItem } from '../types/index.ts';

interface SidebarProps {
  nodes: NodeItem[];
  selectedGroup: string;
  onSelectGroup: (group: string) => void;
  statusFilter: 'all' | 'online' | 'offline';
  onSelectStatusFilter: (status: 'all' | 'online' | 'offline') => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  nodes,
  selectedGroup,
  onSelectGroup,
  statusFilter,
  onSelectStatusFilter,
  searchQuery,
  onSearchChange,
  selectedNodeId,
  onSelectNode,
}) => {
  // Extract unique group names
  const groups = Array.from(new Set(nodes.map((n) => n.group_name || 'Default'))).sort();

  return (
    <aside className="w-64 border-r border-[#20242c] bg-[#12151b] flex flex-col h-[calc(100vh-3.5rem)] select-none">
      {/* Search Input */}
      <div className="p-3 border-b border-[#1f232b]">
        <input
          type="text"
          placeholder="Search VM or IP..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full text-xs bg-[#191d24] border border-[#262c37] text-white rounded px-3 py-1.5 placeholder-[#5a6578] focus:outline-none focus:border-[#ff7a1a]"
        />
      </div>

      {/* Filter tabs */}
      <div className="px-3 pt-3">
        <div className="text-[11px] font-semibold uppercase text-[#5a6578] tracking-wider mb-1.5 flex items-center space-x-1">
          <Filter className="w-3 h-3" />
          <span>Filter Status</span>
        </div>
        <div className="grid grid-cols-3 gap-1 bg-[#181c23] p-1 rounded border border-[#232833] text-xs">
          <button
            onClick={() => onSelectStatusFilter('all')}
            className={`py-1 rounded text-center font-medium transition-colors ${
              statusFilter === 'all' ? 'bg-[#2b323f] text-white shadow-sm' : 'text-[#7d889b] hover:text-white'
            }`}
          >
            All ({nodes.length})
          </button>
          <button
            onClick={() => onSelectStatusFilter('online')}
            className={`py-1 rounded text-center font-medium transition-colors ${
              statusFilter === 'online' ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/40' : 'text-[#7d889b] hover:text-emerald-400'
            }`}
          >
            Live ({nodes.filter((n) => n.metrics?.status === 'online').length})
          </button>
          <button
            onClick={() => onSelectStatusFilter('offline')}
            className={`py-1 rounded text-center font-medium transition-colors ${
              statusFilter === 'offline' ? 'bg-rose-950 text-rose-300 border border-rose-800/40' : 'text-[#7d889b] hover:text-rose-400'
            }`}
          >
            Off ({nodes.filter((n) => n.metrics?.status !== 'online').length})
          </button>
        </div>
      </div>

      {/* Groups Filter */}
      <div className="px-3 pt-4 flex-1 overflow-y-auto">
        <div className="text-[11px] font-semibold uppercase text-[#5a6578] tracking-wider mb-2 flex items-center space-x-1">
          <Layers className="w-3 h-3" />
          <span>Node Groups</span>
        </div>
        <div className="space-y-0.5">
          <button
            onClick={() => {
              onSelectGroup('ALL');
              onSelectNode(null);
            }}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 text-xs rounded transition-colors ${
              selectedGroup === 'ALL' && selectedNodeId === null
                ? 'bg-[#e66000]/15 text-[#ff8c33] font-semibold border-l-2 border-[#e66000]'
                : 'text-[#9aa5b6] hover:bg-[#1a1e27] hover:text-white'
            }`}
          >
            <div className="flex items-center space-x-2">
              <Globe className="w-3.5 h-3.5" />
              <span>All Infrastructure</span>
            </div>
            <span className="text-[11px] px-1.5 py-0.2 bg-[#1b2029] rounded text-[#6a7587]">{nodes.length}</span>
          </button>

          {groups.map((grp) => {
            const count = nodes.filter((n) => (n.group_name || 'Default') === grp).length;
            const isSelected = selectedGroup === grp;
            return (
              <button
                key={grp}
                onClick={() => {
                  onSelectGroup(grp);
                  onSelectNode(null);
                }}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 text-xs rounded transition-colors ${
                  isSelected
                    ? 'bg-[#e66000]/15 text-[#ff8c33] font-semibold border-l-2 border-[#e66000]'
                    : 'text-[#9aa5b6] hover:bg-[#1a1e27] hover:text-white'
                }`}
              >
                <div className="flex items-center space-x-2 truncate">
                  <Server className="w-3.5 h-3.5 text-[#5e6b7f]" />
                  <span className="truncate">{grp}</span>
                </div>
                <span className="text-[11px] px-1.5 py-0.2 bg-[#1b2029] rounded text-[#6a7587]">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Footer Info */}
      <div className="p-3 border-t border-[#1e222a] text-[11px] text-[#556073]">
        <div className="flex items-center justify-between">
          <span>Polling interval:</span>
          <span className="text-emerald-400 font-mono">4s</span>
        </div>
        <div className="flex items-center justify-between mt-1">
          <span>Encryption:</span>
          <span className="text-slate-300 font-mono">AES-256-GCM</span>
        </div>
      </div>
    </aside>
  );
};
