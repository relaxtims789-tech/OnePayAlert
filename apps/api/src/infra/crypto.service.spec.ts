import type { AppConfig } from '../config/app-config.service';
import { CryptoService } from './crypto.service';

const config = {
  get: (k: string) => (k === 'DATA_ENCRYPTION_KEY' ? Buffer.alloc(32, 1).toString('base64') : 'k1'),
} as unknown as AppConfig;

describe('CryptoService', () => {
  const crypto = new CryptoService(config);

  it('round-trips and never repeats ciphertexts', () => {
    const a = crypto.encrypt('whsec_secret', 'conn:1');
    const b = crypto.encrypt('whsec_secret', 'conn:1');
    expect(a).not.toBe(b);
    expect(a).not.toContain('whsec_secret');
    expect(a.startsWith('v1.k1.')).toBe(true);
    expect(crypto.decrypt(a, 'conn:1')).toBe('whsec_secret');
  });

  it('rejects tampering and ciphertexts moved to another record', () => {
    const c = crypto.encrypt('secret', 'conn:1');
    expect(() => crypto.decrypt(c, 'conn:2')).toThrow();
    const parts = c.split('.');
    parts[4] = Buffer.from('tampered').toString('base64url');
    expect(() => crypto.decrypt(parts.join('.'), 'conn:1')).toThrow();
    expect(() => crypto.decrypt('v1.k9.a.b.c', 'conn:1')).toThrow(/Unknown encryption key/);
  });
});
