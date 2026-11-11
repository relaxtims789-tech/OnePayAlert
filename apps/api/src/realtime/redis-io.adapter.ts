import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type Redis from 'ioredis';
import type { Server, ServerOptions } from 'socket.io';
import { AppConfig } from '../config/app-config.service';
import { RedisService } from '../infra/redis.service';

/**
 * Socket.IO adapter backed by Redis pub/sub, so an event emitted by any API/worker instance
 * reaches clients connected to every instance.
 */
export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter> | null = null;
  private clients: Redis[] = [];

  constructor(private readonly appRef: INestApplicationContext) {
    super(appRef);
  }

  async connectToRedis(): Promise<void> {
    const redis = this.appRef.get(RedisService);
    const pub = redis.duplicateRaw();
    const sub = pub.duplicate();
    this.clients = [pub, sub];
    const key = `${redis.prefix}socket.io`;
    this.adapterConstructor = createAdapter(pub, sub, { key });
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    const config = this.appRef.get(AppConfig);
    const server: Server = super.createIOServer(port, {
      ...options,
      cors: { origin: config.get('CORS_ORIGINS'), credentials: true },
    });
    if (this.adapterConstructor) server.adapter(this.adapterConstructor);
    return server;
  }

  override async close(server: Server): Promise<void> {
    await super.close(server);
    await this.dispose();
  }

  override async dispose(): Promise<void> {
    const clients = this.clients;
    this.clients = [];
    await Promise.all(clients.map((c) => c.quit().catch(() => c.disconnect())));
  }
}
