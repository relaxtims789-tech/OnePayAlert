import { Inject, Injectable, Logger } from '@nestjs/common';
import type { KhqrHealthDto } from '@onepay/shared';
import { AppConfig } from '../config/app-config.service';
import { RedisService } from '../infra/redis.service';
import { PrismaService } from '../prisma/prisma.service';
import { BAKONG_CLIENT, BakongError, type BakongClient } from './bakong.client';

const DAY_MS = 86_400_000;
/** Warn this long before the Bakong token expires (renewing takes a visit to the NBC portal). */
export const TOKEN_WARNING_DAYS = 14;
/** A failed call newer than the last good one, within this window, shows as a warning. */
const RECENT_ERROR_MS = 15 * 60_000;

interface Outcomes {
  lastOkAt: Date | null;
  lastErrorAt: Date | null;
  lastError: string | null;
  rejected: boolean;
}

/** Whole days until expiry, rounded up ("9.9 days" reads as 10); negative once expired. */
export function daysLeft(expiresAt: Date, now = new Date()): number {
  const ms = expiresAt.getTime() - now.getTime();
  return ms > 0 ? Math.ceil(ms / DAY_MS) : Math.floor(ms / DAY_MS);
}

/** Pure: the health verdict from the token expiry and the last call outcomes. */
export function khqrHealthStatus(mode: BakongClient['mode'], expiresAt: Date | null, o: Outcomes, now = new Date()): KhqrHealthDto['status'] {
  if (mode !== 'live') return mode;
  if (o.rejected || (expiresAt && expiresAt <= now)) return 'error';
  if (expiresAt && expiresAt.getTime() - now.getTime() <= TOKEN_WARNING_DAYS * DAY_MS) return 'warning';
  const failingNow = o.lastErrorAt && (!o.lastOkAt || o.lastErrorAt > o.lastOkAt) && now.getTime() - o.lastErrorAt.getTime() < RECENT_ERROR_MS;
  return failingNow ? 'warning' : 'ok';
}

/**
 * Remembers how calls to Bakong went (shared by every API instance through Redis) so MysoftKH
 * sees an expiring or rejected token in the admin console and metrics, not only in the logs.
 */
@Injectable()
export class BakongHealthService {
  private readonly logger = new Logger(BakongHealthService.name);

  constructor(
    @Inject(BAKONG_CLIENT) private readonly bakong: BakongClient,
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {}

  private get key(): string {
    return `onepay:${this.config.get('APP_ENV')}:bakong:health`;
  }

  /** Runs a Bakong call and records whether it worked. Errors are re-thrown unchanged. */
  async track<T>(call: () => Promise<T>): Promise<T> {
    try {
      const result = await call();
      if (this.bakong.mode === 'live') await this.write({ lastOkAt: new Date().toISOString(), rejected: '0' });
      return result;
    } catch (e) {
      if (e instanceof BakongError) {
        await this.write({ lastErrorAt: new Date().toISOString(), lastError: e.message.slice(0, 300), rejected: e.retryable ? '0' : '1' });
      }
      throw e;
    }
  }

  private async write(fields: Record<string, string>): Promise<void> {
    try {
      await this.redis.client.hset(this.key, fields);
    } catch (e) {
      this.logger.warn(`Could not record Bakong health: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private async outcomes(): Promise<Outcomes> {
    let h: Record<string, string> = {};
    try {
      h = await this.redis.client.hgetall(this.key);
    } catch {
      // Redis down: report what the token alone says.
    }
    const date = (v?: string) => (v ? new Date(v) : null);
    return { lastOkAt: date(h.lastOkAt), lastErrorAt: date(h.lastErrorAt), lastError: h.lastError ?? null, rejected: h.rejected === '1' };
  }

  async health(now = new Date()): Promise<KhqrHealthDto> {
    const expiresAt = this.bakong.tokenExpiresAt ?? null;
    const o = await this.outcomes();
    const [pendingCharges, oldest] = await Promise.all([
      this.prisma.khqrCharge.count({ where: { status: 'PENDING' } }),
      this.prisma.khqrCharge.findFirst({ where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
    ]);
    return {
      mode: this.bakong.mode,
      status: khqrHealthStatus(this.bakong.mode, expiresAt, o, now),
      tokenExpiresAt: expiresAt?.toISOString() ?? null,
      tokenDaysLeft: expiresAt ? daysLeft(expiresAt, now) : null,
      tokenRejected: o.rejected,
      lastOkAt: o.lastOkAt?.toISOString() ?? null,
      lastErrorAt: o.lastErrorAt?.toISOString() ?? null,
      lastError: o.lastError,
      pendingCharges,
      oldestPendingAt: oldest?.createdAt.toISOString() ?? null,
    };
  }
}
