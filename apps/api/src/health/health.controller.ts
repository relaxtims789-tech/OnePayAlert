import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
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
@Controller('health')
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
      // Soundboxes are optional: a broker outage does not degrade payment ingestion.
      soundbox: !this.mqtt.enabled ? 'disabled' : this.mqtt.connected() ? 'up' : 'down',
      environment: this.config.get('APP_ENV'),
    };
    if (!database) throw new ServiceUnavailableException(body);
    return body;
  }
}
