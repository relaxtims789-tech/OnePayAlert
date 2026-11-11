import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { AppConfig } from '../config/app-config.service';

/**
 * Authenticated encryption (AES-256-GCM) for secrets at rest: bank credentials and
 * webhook signing secrets. Ciphertext format: `v1.<keyId>.<iv>.<tag>.<data>` (base64url).
 * The key id allows rotation; a KMS-backed keyring can replace the env key later.
 */
@Injectable()
export class CryptoService {
  private readonly keys = new Map<string, Buffer>();
  private readonly activeKeyId: string;

  constructor(config: AppConfig) {
    this.activeKeyId = config.get('DATA_ENCRYPTION_KEY_ID');
    this.keys.set(this.activeKeyId, Buffer.from(config.get('DATA_ENCRYPTION_KEY'), 'base64'));
  }

  encrypt(plaintext: string, aad = ''): string {
    const key = this.keys.get(this.activeKeyId)!;
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    if (aad) cipher.setAAD(Buffer.from(aad));
    const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return ['v1', this.activeKeyId, iv, tag, data]
      .map((p) => (typeof p === 'string' ? p : p.toString('base64url')))
      .join('.');
  }

  /** `aad` binds the ciphertext to its owner (e.g. the connection id) so it cannot be swapped. */
  decrypt(ciphertext: string, aad = ''): string {
    const [version, keyId, iv, tag, data] = ciphertext.split('.');
    if (version !== 'v1' || !keyId || !iv || !tag || data === undefined) {
      throw new Error('Unsupported ciphertext format');
    }
    const key = this.keys.get(keyId);
    if (!key) throw new Error(`Unknown encryption key id "${keyId}"`);
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
    if (aad) decipher.setAAD(Buffer.from(aad));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
  }
}
