import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { apiError } from '../common/api-error';
import { AppConfig } from '../config/app-config.service';
import { RedisService } from '../infra/redis.service';

/**
 * Per-account sign-in lockout, on top of the per-IP rate limit: after LOGIN_MAX_FAILURES wrong
 * passwords within LOGIN_LOCK_MINUTES, the account refuses every sign-in (even the right password)
 * for LOGIN_LOCK_MINUTES. Guessing from many addresses therefore gets nowhere either.
 *
 * - Keyed by a hash of the email, so Redis never holds addresses. Unknown emails are counted and
 *   locked exactly like real ones, so a lock reveals nothing about which accounts exist.
 * - A successful sign-in or password reset clears the count and the lock.
 * - If Redis is unavailable, sign-in keeps working (the per-IP limit still applies); this is
 *   logged, never silently ignored.
 */
@Injectable()
export class LoginLockoutService {
  private readonly logger = new Logger(LoginLockoutService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly config: AppConfig,
  ) {}

  get lockMinutes(): number {
    return this.config.get('LOGIN_LOCK_MINUTES');
  }

  private key(kind: 'fails' | 'lock', email: string): string {
    const id = createHash('sha256').update(email.trim().toLowerCase()).digest('hex').slice(0, 40);
    return `onepay:${this.config.get('APP_ENV')}:login:${kind}:${id}`;
  }

  private locked(remainingMs: number) {
    return apiError(HttpStatus.TOO_MANY_REQUESTS, 'ACCOUNT_LOCKED', { minutes: Math.max(1, Math.ceil(remainingMs / 60_000)) });
  }

  private unavailable(e: unknown): void {
    this.logger.warn(`Sign-in lockout unavailable (Redis): ${e instanceof Error ? e.message : String(e)}`);
  }

  /** Throws ACCOUNT_LOCKED (429) while the account is locked. */
  async assertNotLocked(email: string): Promise<void> {
    let remaining: number;
    try {
      remaining = await this.redis.client.pttl(this.key('lock', email));
    } catch (e) {
      this.unavailable(e);
      return;
    }
    if (remaining > 0) throw this.locked(remaining);
  }

  /** Counts a failed attempt. Returns true when this attempt locked the account. */
  async recordFailure(email: string): Promise<boolean> {
    const fails = this.key('fails', email);
    const windowMs = this.lockMinutes * 60_000;
    try {
      const count = await this.redis.client.incr(fails);
      if (count === 1) await this.redis.client.pexpire(fails, windowMs);
      if (count < this.config.get('LOGIN_MAX_FAILURES')) return false;
      await this.redis.client.multi().set(this.key('lock', email), '1', 'PX', windowMs).del(fails).exec();
      return true;
    } catch (e) {
      this.unavailable(e);
      return false;
    }
  }

  /** The error to answer the attempt that just locked the account. */
  lockedError() {
    return this.locked(this.lockMinutes * 60_000);
  }

  async clear(email: string): Promise<void> {
    try {
      await this.redis.client.del(this.key('fails', email), this.key('lock', email));
    } catch (e) {
      this.unavailable(e);
    }
  }
}
