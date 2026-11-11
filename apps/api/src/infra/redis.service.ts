import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { AppConfig } from '../config/app-config.service';

/**
 * Shared Redis connection. Keys are namespaced per environment (`onepay:<env>:`) so dev,
 * test and demo never collide if they share an instance. Callers must treat Redis as a
 * cache: on any Redis error, fall back to the database.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis;
  readonly prefix: string;

  constructor(private readonly config: AppConfig) {
    this.prefix = `onepay:${config.get('APP_ENV')}:`;
    this.client = new Redis(config.get('REDIS_URL'), {
      keyPrefix: this.prefix,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: false,
    });
    this.client.on('error', (e) => this.logger.warn(`Redis error: ${e.message}`));
  }

  /** New connection (no key prefix) for pub/sub use, e.g. the Socket.IO adapter. */
  duplicateRaw(): Redis {
    return new Redis(this.config.get('REDIS_URL'), { maxRetriesPerRequest: null });
  }

  async ping(): Promise<boolean> {
    try {
      return (await this.client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    // quit() waits for pending replies, unlike disconnect().
    await this.client.quit().catch(() => this.client.disconnect());
  }
}
