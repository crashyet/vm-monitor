import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/db.js';
import { encrypt, decrypt } from '../services/crypto.js';
import { testSSHConnection, SSHNodeConfig } from '../services/ssh.js';
import { authMiddleware, AuthenticatedRequest } from './auth.js';
import { runMonitoringCycle, getNodeCachedMetrics } from '../services/monitor.js';

export const nodesRouter = Router();

// Protect all nodes routes with authMiddleware
nodesRouter.use(authMiddleware);

// GET /api/nodes - List all nodes with cached live status
nodesRouter.get('/', (req: AuthenticatedRequest, res: Response) => {
  const stmt = db.prepare(`
    SELECT id, name, group_name, host, port, username, auth_type, created_at, updated_at 
    FROM nodes 
    ORDER BY group_name ASC, name ASC
  `);
  const nodes = stmt.all() as any[];

  // Attach real-time metrics/status if available
  const result = nodes.map((node) => {
    const cached = getNodeCachedMetrics(node.id);
    return {
      ...node,
      metrics: cached || {
        nodeId: node.id,
        status: 'offline',
        cpuUsagePercent: 0,
        ram: { totalBytes: 0, usedBytes: 0, usagePercent: 0 },
        disk: { totalBytes: 0, usedBytes: 0, usagePercent: 0, mountPoint: '/' },
        loadAvg: [0, 0, 0],
        uptimeSeconds: 0,
        lastChecked: 0,
      },
    };
  });

  res.json(result);
});

// POST /api/nodes/test - Test connection before creating/updating node
nodesRouter.post('/test', async (req: AuthenticatedRequest, res: Response) => {
  const { host, port, username, authType, credential } = req.body;

  if (!host || !username || !credential) {
    res.status(400).json({ error: 'Missing required connection parameters (host, username, credential)' });
    return;
  }

  const config: SSHNodeConfig = {
    host,
    port: parseInt(port || '22', 10),
    username,
    authType: authType === 'password' ? 'password' : 'key',
    credential,
  };

  const testResult = await testSSHConnection(config, 7000);
  res.json(testResult);
});

// POST /api/nodes/:id/test - Test connection of an existing saved node
nodesRouter.post('/:id/test', async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const stmt = db.prepare('SELECT id, host, port, username, auth_type, encrypted_credential, iv_tag FROM nodes WHERE id = ?');
  const node = stmt.get(id) as any;

  if (!node) {
    res.status(404).json({ error: 'Node not found' });
    return;
  }

  try {
    const decryptedCredential = decrypt(node.encrypted_credential, node.iv_tag);
    const config: SSHNodeConfig = {
      host: node.host,
      port: node.port,
      username: node.username,
      authType: node.auth_type,
      credential: decryptedCredential,
    };

    const testResult = await testSSHConnection(config, 7000);
    res.json(testResult);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to test connection: ' + err.message });
  }
});

// POST /api/nodes - Add a new VM node
nodesRouter.post('/', async (req: AuthenticatedRequest, res: Response) => {
  const { name, groupName, host, port, username, authType, credential } = req.body;

  if (!name || !host || !username || !credential) {
    res.status(400).json({ error: 'Name, Host, Username, and Credential (password or private key) are required' });
    return;
  }

  const id = uuidv4();
  const nodePort = parseInt(port || '22', 10);
  const type = authType === 'password' ? 'password' : 'key';
  const group = (groupName || 'Default').trim();

  // Encrypt credential with AES-256-GCM
  const { ciphertext, ivTag } = encrypt(credential);

  const insertStmt = db.prepare(`
    INSERT INTO nodes (id, name, group_name, host, port, username, auth_type, encrypted_credential, iv_tag)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertStmt.run(id, name.trim(), group, host.trim(), nodePort, username.trim(), type, ciphertext, ivTag);

  // Trigger immediate poll so metric becomes online quickly
  runMonitoringCycle();

  res.status(201).json({
    id,
    name: name.trim(),
    group_name: group,
    host: host.trim(),
    port: nodePort,
    username: username.trim(),
    auth_type: type,
  });
});

// PUT /api/nodes/:id - Update an existing VM node
nodesRouter.put('/:id', (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { name, groupName, host, port, username, authType, credential } = req.body;

  const existingStmt = db.prepare('SELECT id, encrypted_credential, iv_tag FROM nodes WHERE id = ?');
  const existing = existingStmt.get(id) as any;

  if (!existing) {
    res.status(404).json({ error: 'Node not found' });
    return;
  }

  let ciphertext = existing.encrypted_credential;
  let ivTag = existing.iv_tag;

  // Re-encrypt if new credential is provided
  if (credential && credential.trim().length > 0) {
    const enc = encrypt(credential);
    ciphertext = enc.ciphertext;
    ivTag = enc.ivTag;
  }

  const nodePort = parseInt(port || '22', 10);
  const type = authType === 'password' ? 'password' : 'key';
  const group = (groupName || 'Default').trim();

  const updateStmt = db.prepare(`
    UPDATE nodes 
    SET name = ?, group_name = ?, host = ?, port = ?, username = ?, auth_type = ?, 
        encrypted_credential = ?, iv_tag = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

  updateStmt.run(name.trim(), group, host.trim(), nodePort, username.trim(), type, ciphertext, ivTag, id);

  runMonitoringCycle();

  res.json({ message: 'Node updated successfully' });
});

// DELETE /api/nodes/:id - Delete a node
nodesRouter.delete('/:id', (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const stmt = db.prepare('DELETE FROM nodes WHERE id = ?');
  stmt.run(id);
  res.json({ message: 'Node removed successfully' });
});
