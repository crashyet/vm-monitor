import React, { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { Maximize2, Minimize2, X, RefreshCw, Terminal as TerminalIcon, RotateCcw, Zap } from 'lucide-react';
import { NodeItem } from '../types/index.ts';

interface TerminalModalProps {
  node: NodeItem;
  onClose: () => void;
}

export const TerminalModal: React.FC<TerminalModalProps> = ({ node, onClose }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermInstance = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting');

  const handleResetSession = () => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'reset_session' }));
    }
    setTimeout(() => {
      connectTerminal();
    }, 300);
  };

  const connectTerminal = () => {
    if (!terminalRef.current) return;

    // Teardown previous instances if any
    if (socketRef.current) {
      socketRef.current.close();
    }
    if (xtermInstance.current) {
      xtermInstance.current.dispose();
    }

    setConnectionStatus('connecting');

    // 1. Initialize XTerm.js with sleek Proxmox Dark Theme
    const term = new XTerm({
      cursorBlink: true,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
      fontSize: 13,
      lineHeight: 1.2,
      theme: {
        background: '#0d1015',
        foreground: '#e6edf3',
        cursor: '#ff8c33',
        cursorAccent: '#0d1015',
        selectionBackground: '#e6600044',
        black: '#1f242c',
        red: '#ff5c57',
        green: '#5af78e',
        yellow: '#f3f99d',
        blue: '#57c7ff',
        magenta: '#ff6ac1',
        cyan: '#9aedfe',
        white: '#f1f1f0',
        brightBlack: '#686868',
        brightRed: '#ff5c57',
        brightGreen: '#5af78e',
        brightYellow: '#f3f99d',
        brightBlue: '#57c7ff',
        brightMagenta: '#ff6ac1',
        brightCyan: '#9aedfe',
        brightWhite: '#eff0eb',
      },
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());

    term.open(terminalRef.current);
    fitAddon.fit();
    term.focus();

    xtermInstance.current = term;
    fitAddonRef.current = fitAddon;

    // 2. Open WebSocket to backend SSH terminal endpoint
    const token = localStorage.getItem('nexus_token') || '';
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/terminal?nodeId=${node.id}&token=${encodeURIComponent(token)}&cols=${term.cols}&rows=${term.rows}`;

    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';
    socketRef.current = ws;

    ws.onopen = () => {
      setConnectionStatus('connected');
      // Send initial terminal dimensions
      ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
      term.focus();
    };

    ws.onmessage = async (event) => {
      if (typeof event.data === 'string') {
        term.write(event.data);
      } else if (event.data instanceof ArrayBuffer) {
        term.write(new Uint8Array(event.data));
      } else if (event.data instanceof Blob) {
        const buf = await event.data.arrayBuffer();
        term.write(new Uint8Array(buf));
      }
    };

    ws.onclose = () => {
      setConnectionStatus('disconnected');
    };

    ws.onerror = () => {
      setConnectionStatus('error');
    };

    // Forward terminal keystrokes to WebSocket
    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });

    // Handle terminal resize events
    term.onResize(({ cols, rows }) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols, rows }));
      }
    });
  };

  useEffect(() => {
    connectTerminal();

    const handleWindowResize = () => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit();
      }
    };

    window.addEventListener('resize', handleWindowResize);

    return () => {
      window.removeEventListener('resize', handleWindowResize);
      if (socketRef.current) {
        socketRef.current.close();
      }
      if (xtermInstance.current) {
        xtermInstance.current.dispose();
      }
    };
  }, [node.id]);

  useEffect(() => {
    // Re-fit when fullscreen toggles
    setTimeout(() => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit();
      }
    }, 100);
  }, [isFullscreen]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div
        className={`bg-[#0d1015] border border-[#2b313d] rounded-lg shadow-2xl flex flex-col overflow-hidden transition-all duration-200 ${
          isFullscreen ? 'w-full h-full rounded-none border-none' : 'w-[92vw] max-w-5xl h-[80vh]'
        }`}
      >
        {/* Terminal Header */}
        <div className="h-10 bg-[#161a22] border-b border-[#232833] px-3 flex items-center justify-between select-none">
          <div className="flex items-center space-x-2 text-xs">
            <TerminalIcon className="w-3.5 h-3.5 text-[#ff7a1a]" />
            <span className="font-semibold text-white">{node.name}</span>
            <span className="text-[#657183] font-mono text-[11px]">
              ({node.username}@{node.host}:{node.port})
            </span>

            {/* Status Pill */}
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                connectionStatus === 'connected'
                  ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/50'
                  : connectionStatus === 'connecting'
                  ? 'bg-amber-950/80 text-amber-400 border border-amber-800/50'
                  : 'bg-rose-950/80 text-rose-400 border border-rose-800/50'
              }`}
            >
              {connectionStatus.toUpperCase()}
            </span>

            {/* Persistent Keepalive Badge */}
            <span
              title="Session stays alive in background for 30 mins even if tab closes"
              className="hidden sm:inline-flex items-center space-x-1 text-[10px] px-2 py-0.5 rounded-full bg-[#1b2230] text-[#7eb3ff] border border-[#2c3a52]"
            >
              <Zap className="w-2.5 h-2.5 text-amber-400" />
              <span>Persistent</span>
            </span>
          </div>

          <div className="flex items-center space-x-1 text-[#838f9e]">
            <button
              onClick={handleResetSession}
              title="Reset Terminal Session (Kill process and start fresh shell)"
              className="p-1 text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 rounded flex items-center space-x-1 text-[11px] px-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Reset</span>
            </button>
            <button
              onClick={connectTerminal}
              title="Reconnect Session"
              className="p-1 hover:text-white hover:bg-[#232833] rounded"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
              className="p-1 hover:text-white hover:bg-[#232833] rounded"
            >
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={onClose}
              title="Close Terminal"
              className="p-1 hover:text-rose-400 hover:bg-[#232833] rounded"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* XTerm Container */}
        <div className="flex-1 p-2 bg-[#0d1015] overflow-hidden" ref={terminalRef} />
      </div>
    </div>
  );
};
