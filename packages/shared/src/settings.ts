/**
 * Platform settings that MysoftKH staff manage in the admin console instead of the server's env
 * file. A value saved in the console wins over the environment; clearing it falls back to the
 * environment (or the built-in default). Secrets are stored encrypted and never sent back.
 */
export const PLATFORM_SETTING_KEYS = ['BAKONG_API_TOKEN', 'SMTP_URL', 'MAIL_FROM', 'BILLING_PAYMENT_INSTRUCTIONS'] as const;
export type PlatformSettingKey = (typeof PLATFORM_SETTING_KEYS)[number];

/** Never returned by the API once saved; the console shows only a hint. */
export const SECRET_PLATFORM_SETTINGS: readonly PlatformSettingKey[] = ['BAKONG_API_TOKEN', 'SMTP_URL'];

export const isPlatformSettingKey = (k: string): k is PlatformSettingKey => (PLATFORM_SETTING_KEYS as readonly string[]).includes(k);

/** Where the value in use comes from. */
export type PlatformSettingSource = 'console' | 'environment' | 'default' | 'unset';

export interface PlatformSettingDto {
  key: PlatformSettingKey;
  secret: boolean;
  source: PlatformSettingSource;
  /** The value in use, for non-secret settings only. */
  value: string | null;
  /** Secrets only: a harmless reminder of what is set (last characters, or the mail server without its password). */
  hint: string | null;
  /** When it was last saved in the console, and by whom. */
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface PlatformSettingsDto {
  settings: PlatformSettingDto[];
  /** live = a Bakong token is in use; simulated = demo/development without one; off = production without one. */
  bakongMode: 'live' | 'simulated' | 'off';
  /** From the token itself (Bakong tokens are JWTs); null when unknown. */
  bakongTokenExpiresAt: string | null;
  /** smtp = mail is really sent; log = development/test only. */
  mailDriver: 'smtp' | 'log';
}

export type SettingTestReason = 'OK' | 'NOT_SET' | 'REJECTED' | 'UNREACHABLE' | 'FAILED';

export interface SettingTestResultDto {
  ok: boolean;
  reason: SettingTestReason;
  /** Technical detail for staff (never contains the secret). */
  detail: string | null;
}

/** Text limits, shared by the API validation and the console form. */
export const PLATFORM_SETTING_MAX_LENGTH: Record<PlatformSettingKey, number> = {
  BAKONG_API_TOKEN: 4000,
  SMTP_URL: 1000,
  MAIL_FROM: 200,
  BILLING_PAYMENT_INSTRUCTIONS: 1000,
};

/** Expiry (`exp`) of a JWT such as a Bakong token, without verifying it; null when it has none. */
export function jwtExpiry(token: string): Date | null {
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const json =
      typeof atob === 'function'
        ? decodeURIComponent(
            Array.from(atob(b64), (c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''),
          )
        : '';
    const exp = (JSON.parse(json) as { exp?: unknown }).exp;
    return typeof exp === 'number' && Number.isFinite(exp) ? new Date(exp * 1000) : null;
  } catch {
    return null;
  }
}

/** `smtp://user:secret@host:587` → `smtp://user@host:587` (the password never leaves the server). */
export function smtpUrlHint(url: string): string | null {
  try {
    const u = new URL(url);
    const user = u.username ? `${decodeURIComponent(u.username)}@` : '';
    return `${u.protocol}//${user}${u.host}`;
  } catch {
    return null;
  }
}
