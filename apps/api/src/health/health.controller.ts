import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../common/decorators';
import { AppConfig } from '../config/app-config.service';
import { IngestQueue } from '../infra/ingest-queue.service';
import { RedisService } from '../infra/redis.service';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('Health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly queue: IngestQueue,
    private readonly config: AppConfig,
  ) {}

  /** 200 when the database is reachable; Redis/queue outages report `degraded`. */
  @Public()
  @Get()
  async check() {
    let database = true;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      database = false;
    }
    const redis = await this.redis.ping();
    const queue = this.queue.isConnected();
    const body = {
      status: !database ? 'error' : redis && queue ? 'ok' : 'degraded',
      database: database ? 'up' : 'down',
      redis: redis ? 'up' : 'down',
      queue: queue ? `up (${this.queue.driver})` : 'down',
      environment: this.config.get('APP_ENV'),
    };
    if (!database) throw new ServiceUnavailableException(body);
    return body;
  }
}
