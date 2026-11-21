import { WebSocket } from 'ws';
import { IncomingMessage } from 'node:http';
import { getAllCachedMetrics, subscribeMetrics } from '../services/monitor.js';

export function handleMetricsWebSocket(ws: WebSocket, req: IncomingMessage) {
  // Immediately send initial cached state
  const initial = getAllCachedMetrics();
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'metrics_batch', data: initial }));
  }

  // Subscribe to live monitoring cycles
  const unsubscribe = subscribeMetrics((metrics) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'metrics_batch', data: metrics }));
    }
  });

  ws.on('close', () => {
    unsubscribe();
  });

  ws.on('error', (err) => {
    console.error('[METRICS WS] WebSocket error:', err);
    unsubscribe();
  });
}
