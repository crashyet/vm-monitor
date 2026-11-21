import dotenv from 'dotenv';
import path from 'node:path';
import crypto from 'node:crypto';

dotenv.config();

const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), '../data');
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'nexus_ssh.db');
const PORT = parseInt(process.env.PORT || '3001', 10);
const JWT_SECRET = process.env.JWT_SECRET || 'nexus_ssh_jwt_secret_key_change_in_production_32chars!';

// Master Encryption Key for AES-256-GCM (32 bytes = 256 bits)
let masterKey = process.env.ENCRYPTION_KEY;
if (!masterKey) {
  // If not provided in env, warn and generate a persistent or fallback one
  console.warn('[SECURITY WARNING] ENCRYPTION_KEY not set in environment. Using default fallback key. Please set ENCRYPTION_KEY in .env for production!');
  masterKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
}

export const env = {
  PORT,
  JWT_SECRET,
  ENCRYPTION_KEY: masterKey,
  DATA_DIR,
  DB_PATH,
};
