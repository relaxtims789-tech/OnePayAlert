import { Global, HttpStatus, Injectable, Logger, Module, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import {
  PLATFORM_SETTING_KEYS,
  PLATFORM_SETTING_MAX_LENGTH,
  SECRET_PLATFORM_SETTINGS,
  smtpUrlHint,
  type PlatformSettingDto,
  type PlatformSettingKey,
  type PlatformSettingSource,
} from '@onepay/shared';
import { apiError } from '../common/api-error';
import { AuditService } from '../audit/audit.service';
import { AppConfig } from '../config/app-config.service';
import { CryptoService } from '../infra/crypto.service';
import { PrismaService } from '../prisma/prisma.service';

interface Stored {
  value: string;
  updatedAt: Date;
  updatedBy: string | null;
}

/** Keys whose environment variable has a built-in default (so "not in the env file" is still a value). */
const HAS_DEFAULT: readonly PlatformSettingKey[] = ['MAIL_FROM', 'BILLING_PAYMENT_INSTRUCTIONS'];
/** Other API instances pick up a change made on one of them within this time. */
const REFRESH_MS = 30_000;

const aad = (key: PlatformSettingKey) => `platform_setting:${key}`;

/**
 * Settings MysoftKH staff change in the admin console instead of the server's env file. A value
 * saved here wins over the environment variable of the same name and takes effect at once: callers
 * read it through `get()` on every use. Values are kept decrypted in memory only.
 */
@Injectable()
export class PlatformSettingsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PlatformSettingsService.name);
  private cache = new Map<PlatformSettingKey, Stored>();
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly config: AppConfig,
    private readonly audit: AuditService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.reload();
    this.timer = setInterval(() => void this.reload().catch((e) => this.logger.warn(`Reloading settings failed: ${String(e)}`)), REFRESH_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async reload(): Promise<void> {
    const rows = await this.prisma.platformSetting.findMany({ include: { updatedBy: { select: { email: true } } } });
    const next = new Map<PlatformSettingKey, Stored>();
    for (const r of rows) {
      if (!(PLATFORM_SETTING_KEYS as readonly string[]).includes(r.key)) continue;
      const key = r.key as PlatformSettingKey;
      try {
        next.set(key, {
          value: r.encrypted ? this.crypto.decrypt(r.value, aad(key)) : r.value,
          updatedAt: r.updatedAt,
          updatedBy: r.updatedBy?.email ?? null,
        });
      } catch (e) {
        // A value encrypted with another key cannot be used; fall back to the environment, loudly.
        this.logger.error(`Cannot decrypt platform setting ${key}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    this.cache = next;
  }

  /** The value in use: saved in the console, else the environment (or its default). */
  get(key: PlatformSettingKey): string | undefined {
    const saved = this.cache.get(key)?.value;
    if (saved !== undefined) return saved;
    const env = this.config.get(key);
    return typeof env === 'string' && env.length > 0 ? env : undefined;
  }

  source(key: PlatformSettingKey): PlatformSettingSource {
    if (this.cache.has(key)) return 'console';
    const raw = process.env[key];
    if (raw !== undefined && raw.trim() !== '') return 'environment';
    return HAS_DEFAULT.includes(key) ? 'default' : 'unset';
  }

  list(): PlatformSettingDto[] {
    return PLATFORM_SETTING_KEYS.map((key) => {
      const secret = SECRET_PLATFORM_SETTINGS.includes(key);
      const value = this.get(key) ?? null;
      const stored = this.cache.get(key);
      return {
        key,
        secret,
        source: this.source(key),
        value: secret ? null : value,
        hint: secret && value ? secretHint(key, value) : null,
        updatedAt: stored?.updatedAt.toISOString() ?? null,
        updatedBy: stored?.updatedBy ?? null,
      };
    });
  }

  async set(key: PlatformSettingKey, raw: string, actorUserId: string, ip: string | null): Promise<void> {
    const value = validate(key, raw);
    const secret = SECRET_PLATFORM_SETTINGS.includes(key);
    const stored = secret ? this.crypto.encrypt(value, aad(key)) : value;
    await this.prisma.$transaction(async (tx) => {
      await tx.platformSetting.upsert({
        where: { key },
        create: { key, value: stored, encrypted: secret, updatedById: actorUserId },
        update: { value: stored, encrypted: secret, updatedById: actorUserId },
      });
      // Never the value itself: the audit trail records who changed what, not the secret.
      await this.audit.log(
        { companyId: null, actorUserId, action: 'platform.setting.updated', entityType: 'platform_setting', metadata: { key }, ipAddress: ip },
        tx,
      );
    });
    await this.reload();
  }

  async clear(key: PlatformSettingKey, actorUserId: string, ip: string | null): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.platformSetting.deleteMany({ where: { key } });
      if (count > 0) {
        await this.audit.log(
          { companyId: null, actorUserId, action: 'platform.setting.cleared', entityType: 'platform_setting', metadata: { key }, ipAddress: ip },
          tx,
        );
      }
    });
    await this.reload();
  }
}

function secretHint(key: PlatformSettingKey, value: string): string | null {
  if (key === 'SMTP_URL') return smtpUrlHint(value);
  return value.length >= 12 ? `…${value.slice(-4)}` : '…';
}

/** Normalises and checks a value before it is saved; throws a translated 400 otherwise. */
export function validate(key: PlatformSettingKey, raw: string): string {
  const max = PLATFORM_SETTING_MAX_LENGTH[key];
  if (key === 'BAKONG_API_TOKEN') {
    const v = raw.trim();
    if (!/^\S{20,}$/.test(v) || v.length > max) throw apiError(HttpStatus.BAD_REQUEST, 'SETTING_BAKONG_TOKEN_INVALID');
    return v;
  }
  if (key === 'SMTP_URL') {
    const v = raw.trim();
    let ok = false;
    try {
      const u = new URL(v);
      ok = (u.protocol === 'smtp:' || u.protocol === 'smtps:') && u.hostname.length > 0;
    } catch {
      ok = false;
    }
    if (!ok || v.length > max) throw apiError(HttpStatus.BAD_REQUEST, 'SETTING_SMTP_URL_INVALID');
    return v;
  }
  const v = key === 'MAIL_FROM' ? raw.trim() : raw.trim().replace(/\r\n/g, '\n');
  if (v.length < 1 || v.length > max) throw apiError(HttpStatus.BAD_REQUEST, 'SETTING_TEXT_INVALID', { max: String(max) });
  return v;
}

@Global()
@Module({ providers: [PlatformSettingsService], exports: [PlatformSettingsService] })
export class PlatformSettingsCoreModule {}
