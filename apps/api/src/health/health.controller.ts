import { Controller, Get, Headers, Inject, NotFoundException, Res, ServiceUnavailableException } from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import type { Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { dependencyUp, registry } from '../common/metrics';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../common/decorators';
import { AppConfig } from '../config/app-config.service';
import { MQTT_BRIDGE, type MqttBridge } from '../devices/mqtt.bridge';
import { IngestQueue } from '../infra/ingest-queue.service';
import { RedisService } from '../infra/redis.service';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('Health')
@SkipThrottle()
@Controller()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly queue: IngestQueue,
    private readonly config: AppConfig,
    @Inject(MQTT_BRIDGE) private readonly mqtt: MqttBridge,
  ) {}

  /** 200 when the database is reachable; Redis/queue outages report `degraded`. */
  @Public()
  @Get('health')
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
      // Soundboxes are optional: a broker outage does not degrade payment ingestion.
      soundbox: !this.mqtt.enabled ? 'disabled' : this.mqtt.connected() ? 'up' : 'down',
      environment: this.config.get('APP_ENV'),
    };
    if (!database) throw new ServiceUnavailableException(body);
    return body;
  }

  /**
   * Prometheus metrics. Off (404) unless METRICS_TOKEN is set; then requires
   * `Authorization: Bearer <METRICS_TOKEN>`. Scrape it from the private network only.
   */
  @Public()
  @Get('metrics')
  @ApiExcludeEndpoint()
  async metrics(@Headers('authorization') auth: string | undefined, @Res() res: Response): Promise<void> {
    const token = this.config.get('METRICS_TOKEN');
    if (!token) throw new NotFoundException();
    const given = Buffer.from(auth?.replace(/^Bearer /, '') ?? '');
    const expected = Buffer.from(token);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new NotFoundException();

    let database = 1;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      database = 0;
    }
    dependencyUp.set({ dependency: 'database' }, database);
    dependencyUp.set({ dependency: 'redis' }, (await this.redis.ping()) ? 1 : 0);
    dependencyUp.set({ dependency: 'queue' }, this.queue.isConnected() ? 1 : 0);
    if (this.mqtt.enabled) dependencyUp.set({ dependency: 'soundbox_broker' }, this.mqtt.connected() ? 1 : 0);
    res.setHeader('Content-Type', registry.contentType);
    res.setHeader('Cache-Control', 'no-store');
    res.end(await registry.metrics());
  }
}
