// AES-256-GCM at-rest encryption for OAuth refresh tokens.
// Stored value is base64(iv || tag || ciphertext).
import crypto from 'node:crypto';
import { emailCrypto } from './config.js';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12; // 96 bits recommended for GCM
const TAG_LEN = 16;
const KEY_LEN = 32; // 256 bits

function deriveKey(secret) {
  // Accept hex (64 chars) or any string. Hash to deterministic 32 bytes.
  if (/^[0-9a-f]{64}$/i.test(secret)) {
    return Buffer.from(secret, 'hex');
  }
  return crypto.createHash('sha256').update(String(secret)).digest();
}

export function encryptToken(plaintext) {
  if (!plaintext) return '';
  const key = deriveKey(emailCrypto.key);
  if (key.length !== KEY_LEN) return '';
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString('base64');
}

export function decryptToken(payload) {
  if (!payload) return '';
  const key = deriveKey(emailCrypto.key);
  if (key.length !== KEY_LEN) return '';
  let raw;
  try {
    raw = Buffer.from(String(payload), 'base64');
  } catch {
    return '';
  }
  if (raw.length < IV_LEN + TAG_LEN + 1) return '';
  const iv = raw.subarray(0, IV_LEN);
  const tag = raw.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = raw.subarray(IV_LEN + TAG_LEN);
  try {
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
    return pt.toString('utf8');
  } catch {
    return '';
  }
}
