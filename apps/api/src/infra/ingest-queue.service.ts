import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import amqp, { type AmqpConnectionManager, type ChannelWrapper } from 'amqp-connection-manager';
import type { Channel, ConsumeMessage } from 'amqplib';
import { AppConfig } from '../config/app-config.service';

export type IngestHandler = (webhookEventId: string) => Promise<void>;

const PUBLISH_TIMEOUT_MS = 3000;

/**
 * Work queue for inbound payment events. Messages carry only the `webhook_events` id;
 * the database row is the source of truth (inbox pattern), so a lost or failed publish is
 * recovered by the re-publish sweeper and handlers must be idempotent.
 *
 * Drivers: `rabbitmq` (durable queue, publisher confirms) or `inline` (local dev only).
 */
@Injectable()
export class IngestQueue implements OnModuleInit, OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(IngestQueue.name);
  private handler: IngestHandler | null = null;
  private connection: AmqpConnectionManager | null = null;
  private channel: ChannelWrapper | null = null;
  private readonly inFlight = new Set<Promise<void>>();
  readonly queueName: string;

  constructor(private readonly config: AppConfig) {
    this.queueName = `onepay.${config.get('APP_ENV')}.payments.ingest`;
  }

  get driver(): 'rabbitmq' | 'inline' {
    return this.config.get('QUEUE_DRIVER');
  }

  /** Registered by the ingestion worker. Consumption starts at application bootstrap. */
  registerHandler(handler: IngestHandler): void {
    this.handler = handler;
  }

  isConnected(): boolean {
    return this.driver === 'inline' || (this.connection?.isConnected() ?? false);
  }

  onModuleInit(): void {
    if (this.driver !== 'rabbitmq') return;
    this.connection = amqp.connect([this.config.get('RABBITMQ_URL')], {
      heartbeatIntervalInSeconds: 15,
      reconnectTimeInSeconds: 2,
    });
    this.connection.on('disconnect', ({ err }) =>
      this.logger.warn(`RabbitMQ disconnected: ${err?.message ?? 'unknown'}`),
    );
    this.channel = this.connection.createChannel({
      json: true,
      confirm: true,
      setup: (ch: Channel) => ch.assertQueue(this.queueName, { durable: true }),
    });
  }

  async onApplicationBootstrap(): Promise<void> {
    if (this.driver !== 'rabbitmq') return;
    // Give the broker a moment so the app starts healthy; if it is down we still start
    // (degraded) and publishing resumes automatically on reconnect.
    await this.connection!.connect({ timeout: 5000 }).catch((e: Error) =>
      this.logger.warn(`RabbitMQ not reachable at startup: ${e.message}`),
    );
    if (!this.handler || !this.config.get('WORKER_ENABLED')) return;
    await this.channel!.addSetup(async (ch: Channel) => {
      await ch.prefetch(10);
      await ch.consume(this.queueName, (msg) => void this.onMessage(ch, msg));
    });
    this.logger.log(`Consuming ${this.queueName}`);
  }

  /** Returns true when the message was handed to the broker (or scheduled inline). */
  async publish(webhookEventId: string): Promise<boolean> {
    if (this.driver === 'inline') {
      if (this.handler && this.config.get('WORKER_ENABLED')) this.track(this.handler(webhookEventId));
      return true;
    }
    try {
      await Promise.race([
        this.channel!.sendToQueue(this.queueName, { webhookEventId }, { persistent: true }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('publish timeout')), PUBLISH_TIMEOUT_MS).unref()),
      ]);
      return true;
    } catch (e) {
      this.logger.warn(`Publish of ${webhookEventId} failed (sweeper will retry): ${(e as Error).message}`);
      return false;
    }
  }

  private async onMessage(ch: Channel, msg: ConsumeMessage | null): Promise<void> {
    if (!msg) return;
    let id: string | undefined;
    try {
      id = (JSON.parse(msg.content.toString()) as { webhookEventId?: string }).webhookEventId;
    } catch {
      /* malformed message */
    }
    if (!id || !this.handler) {
      ch.ack(msg);
      return;
    }
    const work = this.handler(id);
    this.track(work);
    try {
      await work;
    } finally {
      // The handler records failures in the DB; the sweeper re-publishes retryable events.
      ch.ack(msg);
    }
  }

  private track(p: Promise<void>): void {
    const tracked = p.catch((e) => this.logger.error(`Ingest handler crashed: ${(e as Error).message}`));
    this.inFlight.add(tracked);
    void tracked.finally(() => this.inFlight.delete(tracked));
  }

  async onModuleDestroy(): Promise<void> {
    // Let in-flight handlers finish (and ack) before closing; unacked messages are redelivered.
    await Promise.allSettled([...this.inFlight]);
    await this.channel?.close().catch(() => undefined);
    await this.connection?.close().catch(() => undefined);
  }
}
