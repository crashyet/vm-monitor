import React, { useState, useEffect } from 'react';
import { Terminal, X, Play, Plus, Trash2, CheckCircle, AlertCircle, Clock, Loader2 } from 'lucide-react';
import { NodeItem, SnippetItem } from '../types/index.ts';
import { api } from '../services/api.ts';

interface SnippetsModalProps {
  nodes: NodeItem[];
  preselectedNode?: NodeItem | null;
  onClose: () => void;
}

export const SnippetsModal: React.FC<SnippetsModalProps> = ({ nodes, preselectedNode, onClose }) => {
  const [snippets, setSnippets] = useState<SnippetItem[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string>(preselectedNode?.id || (nodes[0]?.id || ''));
  const [activeSnippet, setActiveSnippet] = useState<SnippetItem | null>(null);

  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<{
    success: boolean;
    exitCode: number;
    stdout: string;
    stderr: string;
    executionMs: number;
    command: string;
  } | null>(null);

  // New snippet form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCommand, setNewCommand] = useState('');
  const [newDesc, setNewDesc] = useState('');

  const loadSnippets = async () => {
    try {
      const data = await api.getSnippets();
      setSnippets(data);
      if (data.length > 0 && !activeSnippet) {
        setActiveSnippet(data[0]);
      }
    } catch (err) {
      console.error('Failed to load snippets', err);
    }
  };

  useEffect(() => {
    loadSnippets();
  }, []);

  const handleExecute = async (snippet: SnippetItem) => {
    if (!selectedNodeId) return;
    setIsExecuting(true);
    setExecutionResult(null);

    try {
      const result = await api.executeSnippet(snippet.id, selectedNodeId);
      setExecutionResult(result);
    } catch (err: any) {
      setExecutionResult({
        success: false,
        exitCode: 1,
        stdout: '',
        stderr: err.message || 'Execution failed',
        executionMs: 0,
        command: snippet.command,
      });
    } finally {
      setIsExecuting(false);
    }
  };

  const handleCreateSnippet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle || !newCommand) return;
    try {
      await api.createSnippet({
        title: newTitle,
        command: newCommand,
        description: newDesc,
      });
      setNewTitle('');
      setNewCommand('');
      setNewDesc('');
      setShowAddForm(false);
      loadSnippets();
    } catch (err) {
      console.error('Failed to add snippet', err);
    }
  };

  const handleDeleteSnippet = async (id: string) => {
    try {
      await api.deleteSnippet(id);
      loadSnippets();
    } catch (err) {
      console.error('Failed to delete snippet', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="bg-[#141820] border border-[#2b3342] rounded-lg shadow-2xl w-full max-w-4xl h-[82vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[#232a37] flex items-center justify-between bg-[#191e28]">
          <div className="flex items-center space-x-2">
            <Terminal className="w-4 h-4 text-[#ff7a1a]" />
            <h2 className="font-semibold text-sm text-white">Quick Snippets & Commands</h2>
          </div>
          <button onClick={onClose} className="text-[#7d8b9e] hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Target Node Selector Bar */}
        <div className="px-5 py-2.5 bg-[#171b24] border-b border-[#222835] flex items-center justify-between text-xs">
          <div className="flex items-center space-x-2">
            <span className="text-[#8997ac] font-medium">Target VM:</span>
            <select
              value={selectedNodeId}
              onChange={(e) => setSelectedNodeId(e.target.value)}
              className="bg-[#202530] border border-[#2e3748] text-white rounded px-3 py-1 font-medium focus:outline-none focus:border-[#ff7a1a]"
            >
              {nodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name} ({n.host}) - {n.metrics?.status === 'online' ? '🟢 Online' : '🔴 Offline'}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center space-x-1 px-2.5 py-1 rounded bg-[#202632] hover:bg-[#293242] text-[#ff8c33] border border-[#2f394c] font-medium transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{showAddForm ? 'Cancel Add' : 'New Snippet'}</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 flex overflow-hidden">
          {/* Snippet List (Left) */}
          <div className="w-1/3 border-r border-[#222835] bg-[#12151b] overflow-y-auto p-3 space-y-2">
            {showAddForm && (
              <form onSubmit={handleCreateSnippet} className="p-3 bg-[#1a1f29] border border-[#2e3748] rounded space-y-2 text-xs mb-3">
                <div className="font-semibold text-white">Create New Snippet</div>
                <input
                  type="text"
                  required
                  placeholder="Snippet Title"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full bg-[#12151b] border border-[#28303e] text-white rounded px-2.5 py-1"
                />
                <textarea
                  required
                  rows={2}
                  placeholder="Bash Command (e.g. systemctl status nginx)"
                  value={newCommand}
                  onChange={(e) => setNewCommand(e.target.value)}
                  className="w-full bg-[#12151b] border border-[#28303e] text-white rounded px-2.5 py-1 font-mono text-[11px]"
                />
                <input
                  type="text"
                  placeholder="Description (optional)"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  className="w-full bg-[#12151b] border border-[#28303e] text-white rounded px-2.5 py-1 text-[11px]"
                />
                <button
                  type="submit"
                  className="w-full py-1 bg-[#e66000] hover:bg-[#ff700a] text-white rounded font-medium"
                >
                  Save Snippet
                </button>
              </form>
            )}

            {snippets.map((snip) => {
              const isSelected = activeSnippet?.id === snip.id;
              return (
                <div
                  key={snip.id}
                  onClick={() => setActiveSnippet(snip)}
                  className={`p-2.5 rounded border cursor-pointer transition-all flex items-start justify-between ${
                    isSelected
                      ? 'bg-[#e66000]/15 border-[#e66000] text-white'
                      : 'bg-[#181c24] border-[#242a36] text-[#93a0b3] hover:bg-[#1e232e]'
                  }`}
                >
                  <div className="flex-1 pr-2">
                    <h4 className="font-semibold text-xs text-white">{snip.title}</h4>
                    {snip.description && <p className="text-[11px] text-[#717d90] mt-0.5 line-clamp-1">{snip.description}</p>}
                    <code className="text-[10px] text-[#ff8c33] font-mono mt-1 block truncate bg-[#101318] px-1.5 py-0.5 rounded">
                      {snip.command}
                    </code>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteSnippet(snip.id);
                    }}
                    className="p-1 text-[#657183] hover:text-rose-400"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Details & Output Terminal (Right) */}
          <div className="flex-1 flex flex-col bg-[#0f1217] overflow-hidden">
            {activeSnippet ? (
              <>
                <div className="p-4 border-b border-[#202530] bg-[#161a22] flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-sm text-white">{activeSnippet.title}</h3>
                    <p className="text-xs text-[#808d9f] mt-0.5">{activeSnippet.description || 'No description provided'}</p>
                  </div>
                  <button
                    onClick={() => handleExecute(activeSnippet)}
                    disabled={isExecuting || !selectedNodeId}
                    className="flex items-center space-x-1.5 px-4 py-1.5 bg-[#e66000] hover:bg-[#ff700a] text-white font-semibold text-xs rounded shadow-sm transition-colors disabled:opacity-50"
                  >
                    {isExecuting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                    <span>{isExecuting ? 'Executing...' : 'Run on VM'}</span>
                  </button>
                </div>

                {/* Command Preview */}
                <div className="px-4 py-2 bg-[#12161d] border-b border-[#202530] flex items-center space-x-2 text-xs">
                  <span className="text-[#657183]">Command:</span>
                  <code className="font-mono text-[#57c7ff] bg-[#191e28] px-2 py-0.5 rounded flex-1 truncate">
                    {activeSnippet.command}
                  </code>
                </div>

                {/* Execution Output Console */}
                <div className="flex-1 p-4 bg-[#0a0c10] overflow-y-auto font-mono text-xs">
                  {executionResult ? (
                    <div className="space-y-3">
                      <div className="flex items-center space-x-4 text-[11px] pb-2 border-b border-[#1e232e]">
                        <div className="flex items-center space-x-1">
                          {executionResult.success ? (
                            <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                          )}
                          <span className={executionResult.success ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                            Exit Code: {executionResult.exitCode}
                          </span>
                        </div>
                        <div className="flex items-center space-x-1 text-[#788598]">
                          <Clock className="w-3.5 h-3.5" />
                          <span>Duration: {executionResult.executionMs}ms</span>
                        </div>
                      </div>

                      {executionResult.stdout && (
                        <div>
                          <div className="text-[10px] uppercase text-[#627083] font-sans font-bold mb-1">STDOUT:</div>
                          <pre className="text-emerald-300 bg-[#0e1218] p-3 rounded border border-[#1d232e] whitespace-pre-wrap overflow-x-auto">
                            {executionResult.stdout}
                          </pre>
                        </div>
                      )}

                      {executionResult.stderr && (
                        <div>
                          <div className="text-[10px] uppercase text-[#627083] font-sans font-bold mb-1">STDERR:</div>
                          <pre className="text-rose-300 bg-[#160d10] p-3 rounded border border-rose-950 whitespace-pre-wrap overflow-x-auto">
                            {executionResult.stderr}
                          </pre>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="h-full flex items-center justify-center text-[#556173]">
                      Click "Run on VM" to execute this snippet on the selected node.
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-[#556173]">
                Select a snippet to view details and execute.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
