import fs from 'node:fs';
import path from 'node:path';
// @ts-ignore - node:sqlite is standard in Node 22+ / 24+
import { DatabaseSync } from 'node:sqlite';
import { env } from './env.js';

// Ensure data directory exists
if (!fs.existsSync(env.DATA_DIR)) {
  fs.mkdirSync(env.DATA_DIR, { recursive: true });
}

export const db = new DatabaseSync(env.DB_PATH);

// Initialize database tables
export function initDb() {
  // Pragmas for performance and integrity
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');

  // 1. Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 2. Nodes (VMs) table
  db.exec(`
    CREATE TABLE IF NOT EXISTS nodes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      group_name TEXT DEFAULT 'Default',
      host TEXT NOT NULL,
      port INTEGER NOT NULL DEFAULT 22,
      username TEXT NOT NULL,
      auth_type TEXT NOT NULL CHECK(auth_type IN ('password', 'key')),
      encrypted_credential TEXT NOT NULL,
      iv_tag TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 3. Quick Snippets table
  db.exec(`
    CREATE TABLE IF NOT EXISTS snippets (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      command TEXT NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Insert default quick snippets if empty
  const countStmt = db.prepare('SELECT count(*) as count FROM snippets');
  const countRes = countStmt.get() as { count: number };
  if (countRes.count === 0) {
    const insertSnippet = db.prepare(
      'INSERT INTO snippets (id, title, command, description) VALUES (?, ?, ?, ?)'
    );
    insertSnippet.run('1', 'System Info (OS & Kernel)', 'uname -a && lsb_release -a 2>/dev/null || cat /etc/os-release', 'Show operating system and kernel info');
    insertSnippet.run('2', 'Disk Usage (Top 10)', 'df -h && du -ah /var/log 2>/dev/null | sort -rh | head -n 10', 'Check disk space and large logs');
    insertSnippet.run('3', 'Docker Status & Containers', 'docker ps -a 2>/dev/null || echo "Docker not installed or running"', 'List all Docker containers');
    insertSnippet.run('4', 'Memory Hog Processes', 'ps aux --sort=-%mem | head -n 10', 'Show top 10 memory consuming processes');
    insertSnippet.run('5', 'CPU Hog Processes', 'ps aux --sort=-%cpu | head -n 10', 'Show top 10 CPU consuming processes');
    insertSnippet.run('6', 'Failed Systemd Services', 'systemctl --failed', 'Check any failing system services');
  }

  console.log(`[DB] Database initialized successfully at ${env.DB_PATH}`);
}
