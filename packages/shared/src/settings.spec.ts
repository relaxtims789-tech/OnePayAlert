import { isPlatformSettingKey, jwtExpiry, smtpUrlHint } from './settings';

const b64url = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');

describe('platform settings helpers', () => {
  it('reads the expiry of a JWT such as a Bakong token, and nothing from other text', () => {
    const token = `${b64url({ alg: 'HS256' })}.${b64url({ data: { id: 'x' }, iat: 1700000000, exp: 1800000000 })}.sig`;
    expect(jwtExpiry(token)?.toISOString()).toBe(new Date(1800000000 * 1000).toISOString());
    expect(jwtExpiry(`${b64url({})}.${b64url({ iat: 1 })}.sig`)).toBeNull();
    expect(jwtExpiry('not-a-jwt')).toBeNull();
    expect(jwtExpiry('a.!!!.c')).toBeNull();
  });

  it('shows the mail server without its password', () => {
    expect(smtpUrlHint('smtps://mailer%40shop.kh:p%40ss@smtp.example.com:465')).toBe('smtps://mailer@shop.kh@smtp.example.com:465');
    expect(smtpUrlHint('smtp://smtp.example.com:25')).toBe('smtp://smtp.example.com:25');
    expect(smtpUrlHint('nonsense')).toBeNull();
  });

  it('knows which keys exist', () => {
    expect(isPlatformSettingKey('BAKONG_API_TOKEN')).toBe(true);
    expect(isPlatformSettingKey('DATA_ENCRYPTION_KEY')).toBe(false);
  });
});
