import { AdapterKey } from '@onepay/shared';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ALLOWED_STATUS_TRANSITIONS, type TransactionStatus } from '@onepay/shared';
import { Prisma } from '@prisma/client';
import { AppConfig } from '../config/app-config.service';
import { IngestQueue } from '../infra/ingest-queue.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  toTransactionDto,
  transactionInclude,
  type TransactionWithProvider,
} from '../transactions/transaction.mapper';
import { InvalidPayloadError, adapterFor } from './adapters';

export const MAX_ATTEMPTS = 5;
const SWEEP_INTERVAL_MS = 30_000;
const SWEEP_MIN_AGE_MS = 30_000;

type Outcome =
  | { kind: 'created' | 'updated'; transaction: TransactionWithProvider; previousStatus: TransactionStatus | null }
  | { kind: 'ignored' | 'skipped' | 'failed' };

class PermanentError extends Error {}

/**
 * Consumes `webhook_events` and turns them into `transactions`.
 * - Concurrency-safe: each event row is locked with FOR UPDATE SKIP LOCKED.
 * - Idempotent: a provider transaction is stored once; replays and stale events are ignored.
 * - Status changes follow ALLOWED_STATUS_TRANSITIONS (e.g. PENDING → SUCCESS → REVERSED).
 * - Retryable failures stay RECEIVED and are re-published by the sweeper, up to MAX_ATTEMPTS.
 */
@Injectable()
export class IngestionWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IngestionWorker.name);
  private sweeper: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: IngestQueue,
    private readonly notifications: NotificationsService,
    private readonly config: AppConfig,
  ) {}

  onModuleInit(): void {
    this.queue.registerHandler((id) => this.process(id));
    if (this.config.get('WORKER_ENABLED')) {
      this.sweeper = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS);
      this.sweeper.unref();
    }
  }

  onModuleDestroy(): void {
    if (this.sweeper) clearInterval(this.sweeper);
  }

  /** Re-publish events whose message was lost or whose processing failed transiently. */
  async sweep(): Promise<number> {
    const stale = await this.prisma.webhookEvent.findMany({
      where: {
        status: 'RECEIVED',
        attempts: { lt: MAX_ATTEMPTS },
        receivedAt: { lt: new Date(Date.now() - SWEEP_MIN_AGE_MS) },
      },
      select: { id: true },
      orderBy: { receivedAt: 'asc' },
      take: 100,
    });
    for (const e of stale) await this.queue.publish(e.id);
    return stale.length;
  }

  async process(webhookEventId: string): Promise<void> {
    let outcome: Outcome;
    try {
      outcome = await this.prisma.$transaction(
        (tx) => this.processLocked(tx, webhookEventId),
        { timeout: 15_000 },
      );
    } catch (e) {
      await this.recordFailure(webhookEventId, e as Error);
      return;
    }
    if (outcome.kind === 'created' || outcome.kind === 'updated') {
      // After commit: fan out. Notification failures never roll back a recorded payment.
      await this.notifications
        .transactionChanged(outcome.kind, toTransactionDto(outcome.transaction), outcome.previousStatus)
        .catch((e) => this.logger.error(`Notification fan-out failed: ${(e as Error).message}`));
    }
  }

  private async processLocked(tx: Prisma.TransactionClient, id: string): Promise<Outcome> {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM webhook_events
      WHERE id = ${id}::uuid AND status = 'RECEIVED'
      FOR UPDATE SKIP LOCKED`;
    if (locked.length === 0) return { kind: 'skipped' }; // already processed or in progress elsewhere

    const ev = await tx.webhookEvent.findUniqueOrThrow({
      where: { id },
      include: { bankConnection: { include: { provider: true } } },
    });
    const conn = ev.bankConnection;
    const adapter = adapterFor(conn.provider.adapterKey);
    const finish = (status: 'PROCESSED' | 'IGNORED' | 'FAILED', extra: Prisma.WebhookEventUpdateInput = {}) =>
      tx.webhookEvent.update({
        where: { id },
        data: { status, processedAt: new Date(), attempts: { increment: 1 }, ...extra },
      });

    try {
      if (!adapter) throw new PermanentError('Provider has no integration');
      // Simulated events: only outside production, on demo providers, or for KHQR codes paid with the
      // simulated Bakong (demo/dev without a Bakong token). Always flagged as demo payments below.
      const simulatedKhqr = adapter.key === AdapterKey.BAKONG_KHQR;
      if (ev.source === 'SIMULATOR' && ((!conn.provider.isDemo && !simulatedKhqr) || !this.config.allowsSimulatedPayments)) {
        throw new PermanentError('Simulated events are not allowed here');
      }
      let n;
      try {
        n = adapter.parse(ev.payload);
      } catch (e) {
        if (e instanceof InvalidPayloadError) throw new PermanentError(e.message);
        throw e;
      }
      if (n.currency !== conn.currency) throw new PermanentError('Currency does not match connection');

      let outletId = conn.outletId;
      if (n.outletCode) {
        const outlet = await tx.outlet.findFirst({
          where: { companyId: conn.companyId, code: n.outletCode },
          select: { id: true },
        });
        if (outlet) outletId = outlet.id;
      }

      const existing = await tx.transaction.findUnique({
        where: { bankConnectionId_providerTxnId: { bankConnectionId: conn.id, providerTxnId: n.providerTxnId } },
      });

      let outcome: Outcome;
      if (!existing) {
        const created = await tx.transaction.create({
          data: {
            companyId: conn.companyId,
            outletId,
            bankConnectionId: conn.id,
            providerTxnId: n.providerTxnId,
            direction: 'CREDIT',
            status: n.status,
            amountMinor: n.amountMinor,
            currency: n.currency,
            payerName: n.payerName,
            payerAccountMasked: n.payerAccountMasked,
            reference: n.reference,
            description: n.description,
            occurredAt: n.occurredAt,
            rawPayload: ev.payload as Prisma.InputJsonValue,
            isSimulated: ev.source === 'SIMULATOR',
          },
          include: transactionInclude,
        });
        await finish('PROCESSED', { transactionId: created.id });
        outcome = { kind: 'created', transaction: created, previousStatus: null };
      } else if (existing.amountMinor !== n.amountMinor || existing.currency !== n.currency) {
        throw new PermanentError('Amount/currency differs from the recorded transaction');
      } else if (existing.status === n.status) {
        await finish('IGNORED', { transactionId: existing.id, lastError: 'Duplicate status' });
        outcome = { kind: 'ignored' };
      } else if (!ALLOWED_STATUS_TRANSITIONS[existing.status].includes(n.status)) {
        await finish('IGNORED', {
          transactionId: existing.id,
          lastError: `Transition ${existing.status} → ${n.status} not allowed`,
        });
        outcome = { kind: 'ignored' };
      } else {
        const updated = await tx.transaction.update({
          where: { id: existing.id },
          data: { status: n.status },
          include: transactionInclude,
        });
        await finish('PROCESSED', { transactionId: existing.id });
        outcome = { kind: 'updated', transaction: updated, previousStatus: existing.status };
      }

      await tx.bankConnection.update({
        where: { id: conn.id },
        data: {
          lastSyncedAt: new Date(),
          ...(conn.status === 'PENDING' || conn.status === 'ERROR' ? { status: 'ACTIVE', lastError: null } : {}),
        },
      });
      return outcome;
    } catch (e) {
      if (e instanceof PermanentError) {
        await finish('FAILED', { lastError: e.message.slice(0, 500) });
        this.logger.warn(`Webhook event ${id} rejected: ${e.message}`);
        return { kind: 'failed' };
      }
      throw e; // transient: roll back, recorded by recordFailure
    }
  }

  private async recordFailure(id: string, error: Error): Promise<void> {
    this.logger.error(`Processing webhook event ${id} failed: ${error.message}`);
    try {
      const ev = await this.prisma.webhookEvent.update({
        where: { id },
        data: { attempts: { increment: 1 }, lastError: error.message.slice(0, 500) },
      });
      if (ev.attempts >= MAX_ATTEMPTS && ev.status === 'RECEIVED') {
        await this.prisma.webhookEvent.update({
          where: { id },
          data: { status: 'FAILED', processedAt: new Date() },
        });
      }
    } catch (e) {
      this.logger.error(`Could not record failure for ${id}: ${(e as Error).message}`);
    }
  }
}
