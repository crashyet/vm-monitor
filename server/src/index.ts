import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import url from 'node:url';
import express from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';

import { env } from './config/env.js';
import { initDb } from './config/db.js';
import { startMonitoringService } from './services/monitor.js';

import { authRouter } from './routes/auth.js';
import { nodesRouter } from './routes/nodes.js';
import { powerRouter } from './routes/power.js';
import { snippetsRouter } from './routes/snippets.js';

import { handleTerminalWebSocket } from './ws/terminal.js';
import { handleMetricsWebSocket } from './ws/metrics.js';

// 1. Initialize SQLite Database
initDb();

// 2. Setup Express App
const app = express();
app.use(cors());
app.use(express.json());

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/nodes', nodesRouter);
app.use('/api/nodes', powerRouter);
app.use('/api/snippets', snippetsRouter);

// Serve static frontend build if present
const publicDir = path.resolve(process.cwd(), 'public');
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/ws')) {
      return next();
    }
    res.sendFile(path.join(publicDir, 'index.html'));
  });
}

// 3. Create HTTP Server & WebSocket Server
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

// Handle WebSocket upgrade routing
server.on('upgrade', (request, socket, head) => {
  const pathname = url.parse(request.url || '').pathname;

  if (pathname === '/ws/terminal') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      handleTerminalWebSocket(ws, request);
    });
  } else if (pathname === '/ws/metrics') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      handleMetricsWebSocket(ws, request);
    });
  } else {
    socket.destroy();
  }
});

// 4. Start Server and Background Monitoring Worker
server.listen(env.PORT, '0.0.0.0', () => {
  console.log(`\n======================================================`);
  console.log(`🚀 NexusSSH Server running on http://0.0.0.0:${env.PORT}`);
  console.log(`📡 WebSocket endpoints: /ws/terminal, /ws/metrics`);
  console.log(`======================================================\n`);

  // Start background monitoring worker (polling every 4 seconds)
  startMonitoringService(4000);
});
