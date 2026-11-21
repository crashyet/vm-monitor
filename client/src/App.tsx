import React, { useEffect, useState, useRef } from 'react';
import { api } from './services/api.ts';
import { NodeItem, NodeMetrics, UserItem } from './types/index.ts';
import { Navbar } from './components/Navbar.tsx';
import { Sidebar } from './components/Sidebar.tsx';
import { NodeCard } from './components/NodeCard.tsx';
import { NodeModal } from './components/NodeModal.tsx';
import { TerminalModal } from './components/TerminalModal.tsx';
import { PowerModal } from './components/PowerModal.tsx';
import { SnippetsModal } from './components/SnippetsModal.tsx';
import { AuthScreen } from './components/AuthScreen.tsx';
import { Server, Plus, Loader2 } from 'lucide-react';

export const App: React.FC = () => {
  // Auth state
  const [user, setUser] = useState<UserItem | null>(null);
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Nodes state
  const [nodes, setNodes] = useState<NodeItem[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Filters state
  const [selectedGroup, setSelectedGroup] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Modals state
  const [showNodeModal, setShowNodeModal] = useState(false);
  const [editingNode, setEditingNode] = useState<NodeItem | null>(null);

  const [activeTerminalNode, setActiveTerminalNode] = useState<NodeItem | null>(null);
  const [powerTarget, setPowerTarget] = useState<{ node: NodeItem; action: 'reboot' | 'shutdown' } | null>(null);

  const [showSnippetsModal, setShowSnippetsModal] = useState(false);
  const [snippetTargetNode, setSnippetTargetNode] = useState<NodeItem | null>(null);

  // WebSocket for real-time metrics
  const metricsWsRef = useRef<WebSocket | null>(null);

  // Check auth and initial setup
  const initAuth = async () => {
    setAuthLoading(true);
    try {
      const status = await api.checkSetupStatus();
      if (status.needsSetup) {
        setNeedsSetup(true);
        setUser(null);
      } else {
        setNeedsSetup(false);
        const token = localStorage.getItem('nexus_token');
        if (token) {
          try {
            const me = await api.getMe();
            setUser(me.user);
          } catch {
            localStorage.removeItem('nexus_token');
            setUser(null);
          }
        }
      }
    } catch (err) {
      console.error('Failed to init auth', err);
    } finally {
      setAuthLoading(false);
    }
  };

  const loadNodes = async () => {
    try {
      setIsRefreshing(true);
      const data = await api.getNodes();
      setNodes(data);
    } catch (err) {
      console.error('Failed to load nodes', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    initAuth();
  }, []);

  // When user is authenticated, load nodes and connect to live metrics WebSocket
  useEffect(() => {
    if (!user) return;

    loadNodes();

    // Setup WebSocket connection to /ws/metrics
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/metrics`;

    const ws = new WebSocket(wsUrl);
    metricsWsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'metrics_batch' && Array.isArray(msg.data)) {
          const metricsMap = new Map<string, NodeMetrics>();
          for (const m of msg.data) {
            metricsMap.set(m.nodeId, m);
          }

          setNodes((prevNodes) =>
            prevNodes.map((n) => {
              const liveMetric = metricsMap.get(n.id);
              if (liveMetric) {
                return { ...n, metrics: liveMetric };
              }
              return n;
            })
          );
        }
      } catch (err) {
        console.error('Error parsing metrics WS message', err);
      }
    };

    ws.onerror = (err) => {
      console.warn('Metrics WS connection error', err);
    };

    return () => {
      if (metricsWsRef.current) {
        metricsWsRef.current.close();
      }
    };
  }, [user]);

  const handleLogout = () => {
    localStorage.removeItem('nexus_token');
    setUser(null);
  };

  const handleDeleteNode = async (node: NodeItem) => {
    if (confirm(`Are you sure you want to delete node "${node.name}" (${node.host})?`)) {
      try {
        await api.deleteNode(node.id);
        setNodes((prev) => prev.filter((n) => n.id !== node.id));
      } catch (err: any) {
        alert(err.message || 'Failed to delete node');
      }
    }
  };

  const handleTestConnection = async (node: NodeItem) => {
    try {
      const res = await api.testSavedNode(node.id);
      if (res.success) {
        alert(`Success! Connected in ${res.latencyMs}ms.\nHost OS: ${res.osInfo}`);
      } else {
        alert(`Connection Failed:\n${res.error}`);
      }
    } catch (err: any) {
      alert(`Test error: ${err.message}`);
    }
  };

  // Filtered nodes calculation
  const filteredNodes = nodes.filter((node) => {
    // Group filter
    if (selectedGroup !== 'ALL' && (node.group_name || 'Default') !== selectedGroup) {
      return false;
    }
    // Status filter
    if (statusFilter === 'online' && node.metrics?.status !== 'online') {
      return false;
    }
    if (statusFilter === 'offline' && node.metrics?.status === 'online') {
      return false;
    }
    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = node.name.toLowerCase().includes(q);
      const matchHost = node.host.toLowerCase().includes(q);
      const matchGroup = (node.group_name || '').toLowerCase().includes(q);
      if (!matchName && !matchHost && !matchGroup) {
        return false;
      }
    }
    // Node selection
    if (selectedNodeId && node.id !== selectedNodeId) {
      return false;
    }
    return true;
  });

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0d0f14] flex items-center justify-center text-white">
        <Loader2 className="w-8 h-8 animate-spin text-[#ff7a1a]" />
      </div>
    );
  }

  // Show login/setup screen if not authenticated
  if (!user) {
    return (
      <AuthScreen
        needsSetup={Boolean(needsSetup)}
        onAuthenticated={(_, newUser) => {
          setUser(newUser);
          setNeedsSetup(false);
        }}
      />
    );
  }

  const onlineNodesCount = nodes.filter((n) => n.metrics?.status === 'online').length;

  return (
    <div className="min-h-screen bg-[#0d1015] text-[#e6e9ee] flex flex-col font-['Inter',sans-serif]">
      {/* Top Navbar */}
      <Navbar
        user={user}
        onLogout={handleLogout}
        onAddNode={() => {
          setEditingNode(null);
          setShowNodeModal(true);
        }}
        onOpenSnippets={() => {
          setSnippetTargetNode(null);
          setShowSnippetsModal(true);
        }}
        onRefresh={loadNodes}
        totalNodes={nodes.length}
        onlineNodes={onlineNodesCount}
        isRefreshing={isRefreshing}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <Sidebar
          nodes={nodes}
          selectedGroup={selectedGroup}
          onSelectGroup={setSelectedGroup}
          statusFilter={statusFilter}
          onSelectStatusFilter={setStatusFilter}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          selectedNodeId={selectedNodeId}
          onSelectNode={setSelectedNodeId}
        />

        {/* Dashboard Grid Content */}
        <main className="flex-1 p-6 overflow-y-auto bg-[#0d1015]">
          {/* Section Title & Quick Info */}
          <div className="flex items-center justify-between mb-5">
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight flex items-center space-x-2">
                <span>Infrastructure Inventory</span>
                <span className="text-xs font-normal text-[#6f7c90]">
                  ({filteredNodes.length} of {nodes.length} nodes)
                </span>
              </h1>
              <p className="text-xs text-[#717d91] mt-0.5">
                Real-time agentless metrics and interactive SSH shell console
              </p>
            </div>

            <button
              onClick={() => {
                setEditingNode(null);
                setShowNodeModal(true);
              }}
              className="flex items-center space-x-1.5 text-xs font-semibold px-3 py-1.5 bg-[#e66000] hover:bg-[#ff700a] text-white rounded transition-colors shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Node</span>
            </button>
          </div>

          {/* Nodes Grid */}
          {filteredNodes.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredNodes.map((node) => (
                <NodeCard
                  key={node.id}
                  node={node}
                  onOpenTerminal={(n) => setActiveTerminalNode(n)}
                  onOpenPower={(n, action) => setPowerTarget({ node: n, action })}
                  onOpenEdit={(n) => {
                    setEditingNode(n);
                    setShowNodeModal(true);
                  }}
                  onDelete={handleDeleteNode}
                  onOpenQuickSnippet={(n) => {
                    setSnippetTargetNode(n);
                    setShowSnippetsModal(true);
                  }}
                  onTestConnection={handleTestConnection}
                />
              ))}
            </div>
          ) : (
            <div className="h-96 border border-dashed border-[#262c37] rounded-xl flex flex-col items-center justify-center text-center p-8 bg-[#12151b]/40">
              <div className="w-12 h-12 rounded-full bg-[#1e232d] flex items-center justify-center text-[#ff7a1a] mb-3">
                <Server className="w-6 h-6" />
              </div>
              <h3 className="font-semibold text-sm text-white">No Virtual Machines Found</h3>
              <p className="text-xs text-[#6a7689] max-w-sm mt-1 mb-4">
                {searchQuery || selectedGroup !== 'ALL' || statusFilter !== 'all'
                  ? 'No nodes match the selected filters. Try resetting the filters or search query.'
                  : 'Get started by adding your first remote VM host via SSH without installing any agent.'}
              </p>
              <button
                onClick={() => {
                  setEditingNode(null);
                  setShowNodeModal(true);
                }}
                className="px-4 py-2 bg-[#e66000] hover:bg-[#ff700a] text-white text-xs font-semibold rounded shadow-md transition-colors flex items-center space-x-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Add Your First VM</span>
              </button>
            </div>
          )}
        </main>
      </div>

      {/* Terminal Modal */}
      {activeTerminalNode && (
        <TerminalModal
          node={activeTerminalNode}
          onClose={() => setActiveTerminalNode(null)}
        />
      )}

      {/* Node Add / Edit Modal */}
      {showNodeModal && (
        <NodeModal
          initialNode={editingNode}
          onClose={() => setShowNodeModal(false)}
          onSaved={() => {
            setShowNodeModal(false);
            loadNodes();
          }}
        />
      )}

      {/* Power Action Confirmation Modal */}
      {powerTarget && (
        <PowerModal
          node={powerTarget.node}
          action={powerTarget.action}
          onClose={() => setPowerTarget(null)}
          onExecuted={() => {
            loadNodes();
          }}
        />
      )}

      {/* Snippets / Macros Modal */}
      {showSnippetsModal && (
        <SnippetsModal
          nodes={nodes}
          preselectedNode={snippetTargetNode}
          onClose={() => setShowSnippetsModal(false)}
        />
      )}
    </div>
  );
};
export default App;
