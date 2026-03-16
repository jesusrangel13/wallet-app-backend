/**
 * AES-256-GCM encryption utility for sensitive data (e.g. SnapTrade userSecret).
 * Uses Node.js native 'crypto' module — no external dependencies.
 *
 * Requires: ENCRYPTION_KEY env var (32-byte hex string, 64 hex chars)
 * Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */
import crypto from 'crypto';
import { env } from '../config/env';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;    // 96 bits (recommended for GCM)
const TAG_LENGTH = 16;   // 128 bits (GCM auth tag)

function getKey(): Buffer {
    if (!env.ENCRYPTION_KEY) {
        throw new Error('ENCRYPTION_KEY is not set in environment variables.');
    }
    const key = Buffer.from(env.ENCRYPTION_KEY, 'hex');
    if (key.length !== 32) {
        throw new Error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes).');
    }
    return key;
}

/**
 * Encrypts a plaintext string.
 * @returns Base64 string in format: iv:authTag:ciphertext
 */
export function encrypt(plaintext: string): string {
    const key = getKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    const encrypted = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    // Format: base64(iv):base64(authTag):base64(ciphertext)
    return [
        iv.toString('base64'),
        authTag.toString('base64'),
        encrypted.toString('base64'),
    ].join(':');
}

/**
 * Decrypts a string previously encrypted with `encrypt()`.
 * @param encryptedData Base64 string in format: iv:authTag:ciphertext
 * @returns Decrypted plaintext string
 */
export function decrypt(encryptedData: string): string {
    const key = getKey();
    const parts = encryptedData.split(':');
    if (parts.length !== 3) {
        throw new Error('Invalid encrypted data format. Expected iv:authTag:ciphertext.');
    }

    const [ivB64, authTagB64, ciphertextB64] = parts;
    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(authTagB64, 'base64');
    const ciphertext = Buffer.from(ciphertextB64, 'base64');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
    ]);

    return decrypted.toString('utf8');
}
