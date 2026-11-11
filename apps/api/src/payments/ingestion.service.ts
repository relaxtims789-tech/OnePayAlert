import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, type BankConnection, type PaymentProvider } from '@prisma/client';
import { AppConfig } from '../config/app-config.service';
import { CryptoService } from '../infra/crypto.service';
import { IngestQueue } from '../infra/ingest-queue.service';
import { PrismaService } from '../prisma/prisma.service';
import { InvalidPayloadError, adapterFor, sanitizeForStorage, webhookSecretAad } from './adapters';

export interface AcceptResult {
  webhookEventId: string;
  duplicate: boolean;
}

/**
 * Front door of the payment pipeline: authenticate the sender, validate the payload,
 * persist it to the `webhook_events` inbox (idempotent per provider event id) and enqueue it.
 * Responding only after the inbox commit guarantees no acknowledged event is ever lost.
 */
@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly queue: IngestQueue,
    private readonly config: AppConfig,
  ) {}

  async receiveWebhook(
    connectionId: string,
    headers: Record<string, string | string[] | undefined>,
    rawBody: Buffer | undefined,
  ): Promise<AcceptResult> {
    const connection = await this.prisma.bankConnection.findUnique({
      where: { id: connectionId },
      include: { provider: true },
    });
    const adapter = adapterFor(connection?.provider.adapterKey);
    // Uniform 404 so unknown, disconnected and non-webhook connections are indistinguishable.
    if (
      !connection ||
      connection.status === 'DISCONNECTED' ||
      !connection.provider.isActive ||
      !adapter?.acceptsPublicWebhooks ||
      !connection.webhookSecretCiphertext
    ) {
      throw new NotFoundException('Unknown webhook endpoint');
    }
    if (!rawBody || rawBody.length === 0) throw new BadRequestException('Empty body');
    if (rawBody.length > 64 * 1024) throw new BadRequestException('Payload too large');

    const secret = this.crypto.decrypt(connection.webhookSecretCiphertext, webhookSecretAad(connection.id));
    if (!adapter.verifySignature(headers, rawBody, secret)) {
      this.logger.warn(`Rejected webhook with invalid signature for connection ${connection.id}`);
      throw new UnauthorizedException('Invalid signature');
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw new BadRequestException('Body must be valid JSON');
    }
    return this.accept(connection, payload, 'WEBHOOK');
  }

  /** Validate + store + enqueue. Also used by the demo simulator. */
  async accept(
    connection: BankConnection & { provider: PaymentProvider },
    payload: unknown,
    source: 'WEBHOOK' | 'SIMULATOR',
  ): Promise<AcceptResult> {
    const adapter = adapterFor(connection.provider.adapterKey);
    if (!adapter) throw new BadRequestException('Provider has no integration');
    if (source === 'SIMULATOR' && !this.config.allowsSimulatedPayments) {
      throw new BadRequestException('Simulated payments are disabled');
    }

    let event;
    try {
      event = adapter.parse(payload);
    } catch (e) {
      if (e instanceof InvalidPayloadError) throw new BadRequestException(`Invalid payload: ${e.message}`);
      throw e;
    }
    if (event.currency !== connection.currency) {
      throw new BadRequestException(
        `Currency ${event.currency} does not match the connection currency ${connection.currency}`,
      );
    }

    let row;
    try {
      row = await this.prisma.webhookEvent.create({
        data: {
          companyId: connection.companyId,
          bankConnectionId: connection.id,
          providerEventId: event.eventId,
          source,
          payload: sanitizeForStorage(payload) as Prisma.InputJsonValue,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const existing = await this.prisma.webhookEvent.findUniqueOrThrow({
          where: {
            bankConnectionId_providerEventId: {
              bankConnectionId: connection.id,
              providerEventId: event.eventId,
            },
          },
          select: { id: true },
        });
        return { webhookEventId: existing.id, duplicate: true };
      }
      throw e;
    }

    await this.queue.publish(row.id);
    return { webhookEventId: row.id, duplicate: false };
  }
}
