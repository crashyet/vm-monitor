import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/db.js';
import { decrypt } from '../services/crypto.js';
import { executeSSHCommand, SSHNodeConfig } from '../services/ssh.js';
import { authMiddleware, AuthenticatedRequest } from './auth.js';

export const snippetsRouter = Router();
snippetsRouter.use(authMiddleware);

// GET /api/snippets - List all snippets
snippetsRouter.get('/', (req: AuthenticatedRequest, res: Response) => {
  const stmt = db.prepare('SELECT id, title, command, description, created_at FROM snippets ORDER BY created_at DESC');
  res.json(stmt.all());
});

// POST /api/snippets - Create a new snippet
snippetsRouter.post('/', (req: AuthenticatedRequest, res: Response) => {
  const { title, command, description } = req.body;
  if (!title || !command) {
    res.status(400).json({ error: 'Title and command are required' });
    return;
  }

  const id = uuidv4();
  const insert = db.prepare('INSERT INTO snippets (id, title, command, description) VALUES (?, ?, ?, ?)');
  insert.run(id, title.trim(), command.trim(), description ? description.trim() : '');

  res.status(201).json({ id, title, command, description });
});

// PUT /api/snippets/:id - Update a snippet
snippetsRouter.put('/:id', (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { title, command, description } = req.body;

  const update = db.prepare('UPDATE snippets SET title = ?, command = ?, description = ? WHERE id = ?');
  update.run(title.trim(), command.trim(), description || '', id);

  res.json({ message: 'Snippet updated' });
});

// DELETE /api/snippets/:id - Delete a snippet
snippetsRouter.delete('/:id', (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const del = db.prepare('DELETE FROM snippets WHERE id = ?');
  del.run(id);
  res.json({ message: 'Snippet deleted' });
});

// POST /api/snippets/:id/execute/:nodeId - Run a snippet on a target node
snippetsRouter.post('/:id/execute/:nodeId', async (req: AuthenticatedRequest, res: Response) => {
  const { id, nodeId } = req.params;

  const snippetStmt = db.prepare('SELECT id, title, command FROM snippets WHERE id = ?');
  const snippet = snippetStmt.get(id) as any;
  if (!snippet) {
    res.status(404).json({ error: 'Snippet not found' });
    return;
  }

  const nodeStmt = db.prepare('SELECT id, host, port, username, auth_type, encrypted_credential, iv_tag FROM nodes WHERE id = ?');
  const node = nodeStmt.get(nodeId) as any;
  if (!node) {
    res.status(404).json({ error: 'Target node not found' });
    return;
  }

  try {
    const credential = decrypt(node.encrypted_credential, node.iv_tag);
    const config: SSHNodeConfig = {
      host: node.host,
      port: node.port,
      username: node.username,
      authType: node.auth_type,
      credential,
    };

    const startTime = Date.now();
    const result = await executeSSHCommand(config, snippet.command, 30000);
    const executionMs = Date.now() - startTime;

    res.json({
      success: result.exitCode === 0,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      executionMs,
      command: snippet.command,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Snippet execution failed: ' + err.message });
  }
});
