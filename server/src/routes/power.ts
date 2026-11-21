import { Router, Response } from 'express';
import { db } from '../config/db.js';
import { decrypt } from '../services/crypto.js';
import { executeSSHCommand, SSHNodeConfig } from '../services/ssh.js';
import { authMiddleware, AuthenticatedRequest } from './auth.js';

export const powerRouter = Router();
powerRouter.use(authMiddleware);

function getSSHConfigForNode(nodeId: string): SSHNodeConfig {
  const stmt = db.prepare('SELECT id, host, port, username, auth_type, encrypted_credential, iv_tag FROM nodes WHERE id = ?');
  const node = stmt.get(nodeId) as any;
  if (!node) {
    throw new Error('Node not found');
  }

  const credential = decrypt(node.encrypted_credential, node.iv_tag);
  return {
    host: node.host,
    port: node.port,
    username: node.username,
    authType: node.auth_type,
    credential,
  };
}

// POST /api/nodes/:id/power/reboot
powerRouter.post('/:id/power/reboot', async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  try {
    const config = getSSHConfigForNode(id);
    // Execute safe reboot with sudo fallback
    const cmd = 'sudo reboot || reboot || sudo shutdown -r now';
    // When reboot triggers, the SSH connection might be abruptly dropped, which is normal
    executeSSHCommand(config, cmd, 8000).catch(() => {});
    res.json({ message: 'Reboot command initiated successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to initiate reboot: ' + err.message });
  }
});

// POST /api/nodes/:id/power/shutdown
powerRouter.post('/:id/power/shutdown', async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  try {
    const config = getSSHConfigForNode(id);
    const cmd = 'sudo poweroff || poweroff || sudo shutdown -h now';
    executeSSHCommand(config, cmd, 8000).catch(() => {});
    res.json({ message: 'Shutdown command initiated successfully.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to initiate shutdown: ' + err.message });
  }
});
