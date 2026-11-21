import React from 'react';
import { Server, Activity, Plus, Terminal, LogOut, ShieldCheck, RefreshCw, Zap } from 'lucide-react';
import { UserItem } from '../types/index.ts';

interface NavbarProps {
  user: UserItem | null;
  onLogout: () => void;
  onAddNode: () => void;
  onOpenSnippets: () => void;
  onOpenHostShell: () => void;
  onRefresh: () => void;
  totalNodes: number;
  onlineNodes: number;
  isRefreshing: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  user,
  onLogout,
  onAddNode,
  onOpenSnippets,
  onOpenHostShell,
  onRefresh,
  totalNodes,
  onlineNodes,
  isRefreshing,
}) => {
  return (
    <header className="h-14 border-b border-[#232730] bg-[#14171d] px-4 flex items-center justify-between select-none">
      {/* Brand Logo & Name */}
      <div className="flex items-center space-x-3">
        <div className="w-8 h-8 rounded bg-gradient-to-tr from-[#e66000] to-[#ff8c33] flex items-center justify-center shadow-lg shadow-orange-950/40">
          <Server className="w-4 h-4 text-white" />
        </div>
        <div>
          <div className="flex items-center space-x-2">
            <span className="font-bold text-base tracking-tight text-white">Nexus<span className="text-[#ff7a1a]">SSH</span></span>
            <span className="text-[10px] uppercase font-semibold bg-[#20252e] text-[#8e98a8] px-1.5 py-0.5 rounded border border-[#2b313d]">
              v1.0 MVP
            </span>
          </div>
          <p className="text-[11px] text-[#6d7788] hidden sm:block">Agentless SSH VM Control Panel</p>
        </div>
      </div>

      {/* Cluster Overview Stats */}
      <div className="hidden md:flex items-center space-x-6 text-xs">
        <div className="flex items-center space-x-2 bg-[#191d24] px-3 py-1.5 rounded-md border border-[#252b36]">
          <Activity className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-[#8e98a8]">Cluster Status:</span>
          <span className="font-semibold text-emerald-400">{onlineNodes}</span>
          <span className="text-[#596375]">/</span>
          <span className="text-[#e2e8f0] font-medium">{totalNodes} Online</span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center space-x-2">
        <button
          onClick={onRefresh}
          title="Refresh All Nodes"
          className="p-2 text-[#8e98a8] hover:text-white hover:bg-[#1f242d] rounded transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-[#ff7a1a]' : ''}`} />
        </button>

        <button
          onClick={onOpenHostShell}
          title="Open Home Server Terminal"
          className="flex items-center space-x-1.5 text-xs font-semibold px-3 py-1.5 bg-[#14232c] hover:bg-[#1a2f3a] text-cyan-300 hover:text-white rounded border border-cyan-800/50 shadow-sm transition-colors"
        >
          <Zap className="w-3.5 h-3.5 text-cyan-400" />
          <span>Host Shell</span>
        </button>

        <button
          onClick={onOpenSnippets}
          className="flex items-center space-x-1.5 text-xs font-medium px-3 py-1.5 bg-[#1b2029] hover:bg-[#232935] text-[#b8c2d1] hover:text-white rounded border border-[#2a313e] transition-colors"
        >
          <Terminal className="w-3.5 h-3.5 text-[#ff8c33]" />
          <span className="hidden sm:inline">Snippets & Macros</span>
        </button>

        <button
          onClick={onAddNode}
          className="flex items-center space-x-1.5 text-xs font-semibold px-3 py-1.5 bg-[#e66000] hover:bg-[#ff700a] text-white rounded shadow-sm shadow-orange-950 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add VM</span>
        </button>

        {user && (
          <div className="flex items-center pl-2 ml-2 border-l border-[#242934] space-x-2">
            <div className="hidden sm:flex flex-col text-right">
              <span className="text-xs font-medium text-slate-200">{user.username}</span>
              <span className="text-[10px] text-emerald-400 flex items-center justify-end space-x-0.5">
                <ShieldCheck className="w-2.5 h-2.5 inline" />
                <span>Admin</span>
              </span>
            </div>
            <button
              onClick={onLogout}
              title="Logout"
              className="p-1.5 text-[#7c8799] hover:text-rose-400 hover:bg-[#20252e] rounded transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
