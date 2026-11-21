import React, { useState } from 'react';
import { AlertTriangle, Power, X, Loader2 } from 'lucide-react';
import { NodeItem } from '../types/index.ts';
import { api } from '../services/api.ts';

interface PowerModalProps {
  node: NodeItem;
  action: 'reboot' | 'shutdown';
  onClose: () => void;
  onExecuted: () => void;
}

export const PowerModal: React.FC<PowerModalProps> = ({ node, action, onClose, onExecuted }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isReboot = action === 'reboot';

  const handleConfirm = async () => {
    setLoading(true);
    setError('');
    try {
      if (isReboot) {
        await api.rebootNode(node.id);
      } else {
        await api.shutdownNode(node.id);
      }
      onExecuted();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Action failed.');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="bg-[#141820] border border-[#2b3342] rounded-lg shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#232a37] flex items-center justify-between bg-[#191e28]">
          <div className="flex items-center space-x-2">
            <Power className={`w-4 h-4 ${isReboot ? 'text-amber-400' : 'text-rose-400'}`} />
            <h2 className="font-semibold text-sm text-white">
              Confirm VM {isReboot ? 'Reboot' : 'Shutdown'}
            </h2>
          </div>
          <button onClick={onClose} className="text-[#7d8b9e] hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 text-xs">
          {error && (
            <div className="p-3 bg-rose-950/40 border border-rose-900/60 rounded text-rose-300">
              {error}
            </div>
          )}

          <div className="flex items-start space-x-3 p-3 bg-amber-950/25 border border-amber-800/40 rounded-lg text-amber-200">
            <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-white">
                Are you sure you want to {isReboot ? 'reboot' : 'power off'} this node?
              </p>
              <p className="mt-1 text-[#b5bfce]">
                Target: <span className="font-mono text-white font-bold">{node.name}</span> ({node.host})
              </p>
              <p className="mt-1 text-[11px] text-amber-300/80">
                {isReboot
                  ? 'All running processes will be terminated and restarted. Connectivity will drop temporarily.'
                  : 'The virtual machine will halt and cannot be powered back on via SSH without physical or hypervisor access.'}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end space-x-2 pt-2 border-t border-[#232a37]">
            <button
              onClick={onClose}
              disabled={loading}
              className="px-4 py-1.5 rounded text-[#828f9f] hover:text-white"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={loading}
              className={`px-4 py-1.5 rounded font-semibold text-white flex items-center space-x-1.5 transition-colors shadow-sm ${
                isReboot ? 'bg-amber-600 hover:bg-amber-500' : 'bg-rose-600 hover:bg-rose-500'
              }`}
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{loading ? 'Executing...' : `Confirm ${isReboot ? 'Reboot' : 'Shutdown'}`}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
