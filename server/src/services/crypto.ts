import crypto from 'node:crypto';
import { env } from '../config/env.js';

// AES-256-GCM requires a 32-byte (256-bit) key
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // Standard 96-bit IV for GCM

function getKey(): Buffer {
  // Ensure exactly 32 bytes
  return crypto.createHash('sha256').update(env.ENCRYPTION_KEY).digest();
}

export interface EncryptedData {
  ciphertext: string; // base64
  ivTag: string;      // base64(iv):base64(tag)
}

export function encrypt(plaintext: string): EncryptedData {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  const tag = cipher.getAuthTag();

  return {
    ciphertext: encrypted,
    ivTag: `${iv.toString('base64')}:${tag.toString('base64')}`,
  };
}

export function decrypt(ciphertext: string, ivTag: string): string {
  const [ivBase64, tagBase64] = ivTag.split(':');
  if (!ivBase64 || !tagBase64) {
    throw new Error('Invalid ivTag format. Expected iv:tag');
  }

  const key = getKey();
  const iv = Buffer.from(ivBase64, 'base64');
  const tag = Buffer.from(tagBase64, 'base64');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
