import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../config/db.js';
import { env } from '../config/env.js';

export const authRouter = Router();

export interface AuthUser {
  id: string;
  username: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

export function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: Missing or invalid token format' });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as AuthUser;
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
  }
}

// Check initial setup status: whether at least one user exists
authRouter.get('/status', (req, res) => {
  const stmt = db.prepare('SELECT count(*) as count FROM users');
  const result = stmt.get() as { count: number };
  res.json({ needsSetup: result.count === 0 });
});

// Initial Admin Setup (only allowed if users count === 0)
authRouter.post('/setup', (req, res) => {
  const countStmt = db.prepare('SELECT count(*) as count FROM users');
  const result = countStmt.get() as { count: number };
  if (result.count > 0) {
    res.status(400).json({ error: 'Setup already completed. Please log in.' });
    return;
  }

  const { username, password } = req.body;
  if (!username || !password || password.length < 6) {
    res.status(400).json({ error: 'Username and password (min 6 characters) required.' });
    return;
  }

  const id = uuidv4();
  const passwordHash = bcrypt.hashSync(password, 10);

  const insert = db.prepare('INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)');
  insert.run(id, username.trim(), passwordHash);

  const token = jwt.sign({ id, username: username.trim() }, env.JWT_SECRET, { expiresIn: '7d' });
  res.json({
    message: 'Admin account created successfully',
    token,
    user: { id, username: username.trim() },
  });
});

// Login
authRouter.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    res.status(400).json({ error: 'Username and password required' });
    return;
  }

  const stmt = db.prepare('SELECT id, username, password_hash FROM users WHERE username = ?');
  const user = stmt.get(username.trim()) as { id: string; username: string; password_hash: string } | undefined;

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    res.status(401).json({ error: 'Invalid username or password' });
    return;
  }

  const token = jwt.sign({ id: user.id, username: user.username }, env.JWT_SECRET, { expiresIn: '7d' });
  res.json({
    message: 'Login successful',
    token,
    user: { id: user.id, username: user.username },
  });
});

// Current User Profile
authRouter.get('/me', authMiddleware, (req: AuthenticatedRequest, res) => {
  res.json({ user: req.user });
});
