import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import {
  AdapterKey,
  KHQR_CHARGE_TTL_SECONDS,
  RealtimeEvent,
  fromMinorUnits,
  toMinorUnits,
  type KhqrAccountDto,
  type KhqrChargeDto,
  type KhqrStatusDto,
} from '@onepay/shared';
import type { BankConnection, KhqrCharge, Outlet, PaymentProvider } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { apiError } from '../common/api-error';
import type { TenantUser } from '../common/auth-user';
import { alertsSent } from '../common/metrics';
import { AppConfig } from '../config/app-config.service';
import { RedisService } from '../infra/redis.service';
import { IngestionService } from '../payments/ingestion.service';
import { maskAccount } from '../payments/adapters';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { BakongHealthService } from './bakong-health.service';
import { BAKONG_CLIENT, BakongError, SimulatedBakongClient, type BakongClient, type BakongTransaction } from './bakong.client';
import { encodeKhqr, khqrSafeText } from './khqr-encoder';

/** A payment landing just after the code expired is still honoured for this long. */
export const KHQR_GRACE_MS = 60_000;
const BATCH = 50;
const REF_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';

type ChargeWithRefs = KhqrCharge & { bankConnection: BankConnection & { provider: PaymentProvider }; outlet: Outlet | null };

function newReference(): string {
  return `OPA${[...randomBytes(7)].map((b) => REF_ALPHABET[b % REF_ALPHABET.length]).join('')}`;
}

export function toChargeDto(c: KhqrCharge & { bankConnection: Pick<BankConnection, 'accountName'> }): KhqrChargeDto {
  return {
    id: c.id,
    bankConnectionId: c.bankConnectionId,
    outletId: c.outletId,
    reference: c.reference,
    amountMinor: Number(c.amountMinor),
    currency: c.currency,
    qr: c.qr,
    md5: c.md5,
    status: c.status,
    merchantName: c.bankConnection.accountName ?? '',
    expiresAt: c.expiresAt.toISOString(),
    paidAt: c.paidAt?.toISOString() ?? null,
    payerAccount: c.payerAccount,
    simulated: c.simulated,
    createdAt: c.createdAt.toISOString(),
  };
}

@Injectable()
export class KhqrService {
  private readonly logger = new Logger(KhqrService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ingestion: IngestionService,
    private readonly realtime: RealtimeGateway,
    private readonly redis: RedisService,
    private readonly config: AppConfig,
    @Inject(BAKONG_CLIENT) private readonly bakong: BakongClient,
    private readonly bakongHealth: BakongHealthService,
  ) {}

  /** Per environment: dev, test and demo may share one Redis. */
  private get lockKey(): string {
    return `onepay:${this.config.get('APP_ENV')}:khqr:poll`;
  }

  status(): KhqrStatusDto {
    return { mode: this.bakong.mode };
  }

  /** Active Bakong accounts this member may collect into; outlet-restricted staff see their outlets' and shared ones. */
  async accounts(user: TenantUser): Promise<KhqrAccountDto[]> {
    const rows = await this.prisma.forTenant(user.companyId).bankConnection.findMany({
      where: {
        companyId: user.companyId,
        status: 'ACTIVE',
        externalAccountId: { not: null },
        provider: { adapterKey: AdapterKey.BAKONG_KHQR },
        ...(user.outletIds.length > 0 ? { OR: [{ outletId: null }, { outletId: { in: user.outletIds } }] } : {}),
      },
      orderBy: [{ displayName: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((c) => ({
      id: c.id,
      displayName: c.displayName,
      accountId: c.externalAccountId!,
      merchantName: c.accountName ?? '',
      currency: c.currency,
      outletId: c.outletId,
    }));
  }

  async create(user: TenantUser, dto: { bankConnectionId: string; amount: string; outletId?: string }): Promise<KhqrChargeDto> {
    if (this.bakong.mode === 'off') throw apiError(HttpStatus.SERVICE_UNAVAILABLE, 'KHQR_NOT_AVAILABLE');
    const db = this.prisma.forTenant(user.companyId);
    const connection = await db.bankConnection.findFirst({
      where: { id: dto.bankConnectionId, companyId: user.companyId, status: 'ACTIVE', provider: { adapterKey: AdapterKey.BAKONG_KHQR } },
      include: { provider: true },
    });
    if (!connection?.externalAccountId) throw apiError(HttpStatus.BAD_REQUEST, 'KHQR_CONNECTION_REQUIRED');

    // Which outlet the money is for: chosen, else the connection's, else the cashier's only outlet.
    let outletId = dto.outletId ?? connection.outletId ?? (user.outletIds.length === 1 ? user.outletIds[0]! : null);
    if (user.outletIds.length > 0 && (!outletId || !user.outletIds.includes(outletId))) throw apiError(HttpStatus.FORBIDDEN, 'FORBIDDEN');
    const outlet = outletId ? await db.outlet.findFirst({ where: { id: outletId, companyId: user.companyId, isActive: true } }) : null;
    if (outletId && !outlet) throw apiError(HttpStatus.BAD_REQUEST, 'OUTLET_NOT_EXIST');
    outletId = outlet?.id ?? null;

    let amountMinor: bigint;
    try {
      amountMinor = toMinorUnits(dto.amount.trim(), connection.currency);
    } catch {
      throw apiError(HttpStatus.BAD_REQUEST, 'KHQR_AMOUNT_INVALID');
    }
    if (amountMinor <= 0n || (connection.currency === 'KHR' && amountMinor % 100n !== 0n)) {
      throw apiError(HttpStatus.BAD_REQUEST, 'KHQR_AMOUNT_INVALID');
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + KHQR_CHARGE_TTL_SECONDS * 1000);
    const reference = newReference();
    const { qr, md5 } = encodeKhqr({
      bakongAccountId: connection.externalAccountId,
      merchantName: connection.accountName || 'One PayAlert Merchant',
      currency: connection.currency,
      amountMinor,
      billNumber: reference,
      storeLabel: outlet ? khqrSafeText(outlet.name, 25) || undefined : undefined,
      terminalLabel: 'One PayAlert',
      createdAt: now,
      expiresAt,
    });
    const charge = await db.khqrCharge.create({
      data: {
        companyId: user.companyId,
        bankConnectionId: connection.id,
        outletId,
        createdById: user.userId,
        reference,
        amountMinor,
        currency: connection.currency,
        qr,
        md5,
        expiresAt,
        simulated: this.bakong.mode === 'simulated',
      },
      include: { bankConnection: true },
    });
    return toChargeDto(charge);
  }

  async get(user: TenantUser, id: string): Promise<KhqrChargeDto> {
    return toChargeDto(await this.findOwned(user, id));
  }

  async cancel(user: TenantUser, id: string): Promise<KhqrChargeDto> {
    const charge = await this.findOwned(user, id);
    const res = await this.prisma.khqrCharge.updateMany({ where: { id: charge.id, status: 'PENDING' }, data: { status: 'CANCELED' } });
    if (res.count !== 1) throw apiError(HttpStatus.CONFLICT, 'KHQR_CHARGE_NOT_PENDING');
    return this.publish(charge.id);
  }

  /** Demo/development only: the "customer" pays with the simulated Bakong. */
  async simulatePaid(user: TenantUser, id: string): Promise<KhqrChargeDto> {
    if (!(this.bakong instanceof SimulatedBakongClient)) throw apiError(HttpStatus.FORBIDDEN, 'FORBIDDEN');
    const charge = await this.findOwned(user, id);
    if (charge.status !== 'PENDING') throw apiError(HttpStatus.CONFLICT, 'KHQR_CHARGE_NOT_PENDING');
    this.bakong.markPaid(charge.md5, {
      fromAccountId: 'demo_customer@bkrt',
      toAccountId: charge.bankConnection.externalAccountId,
      currency: charge.currency,
      amount: fromMinorUnits(charge.amountMinor, charge.currency),
      description: charge.reference,
    });
    await this.settle(charge);
    return toChargeDto(await this.findOwned(user, id));
  }

  // ───────────────────────── Polling ─────────────────────────

  /**
   * One polling round: asks Bakong which pending codes were paid (50 per call), records those, and
   * expires codes past their grace period. Runs on one API instance at a time (Redis lock).
   */
  async pollOnce(now = new Date()): Promise<{ checked: number; paid: number; expired: number }> {
    const result = { checked: 0, paid: 0, expired: 0 };
    if (this.bakong.mode === 'off') return result;
    const lock = await this.redis.client.set(this.lockKey, String(process.pid), 'PX', 15_000, 'NX');
    if (lock !== 'OK') return result;
    try {
      const pending = await this.prisma.khqrCharge.findMany({
        where: { status: 'PENDING', expiresAt: { gt: new Date(now.getTime() - KHQR_GRACE_MS) } },
        include: { bankConnection: { include: { provider: true } }, outlet: true },
        orderBy: [{ lastCheckedAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }],
        take: 500,
      });
      for (let i = 0; i < pending.length; i += BATCH) {
        const batch = pending.slice(i, i + BATCH);
        let paid: Set<string>;
        try {
          paid = await this.bakongHealth.track(() => this.bakong.paidAmong(batch.map((c) => c.md5)));
        } catch (e) {
          this.logger.warn(`Bakong check failed: ${e instanceof Error ? e.message : String(e)}`);
          break; // try again next round
        }
        result.checked += batch.length;
        await this.prisma.khqrCharge.updateMany({ where: { id: { in: batch.map((c) => c.id) } }, data: { lastCheckedAt: now } });
        for (const c of batch.filter((b) => paid.has(b.md5))) {
          if (await this.settle(c)) result.paid++;
        }
      }

      const expiring = await this.prisma.khqrCharge.findMany({
        where: { status: 'PENDING', expiresAt: { lte: new Date(now.getTime() - KHQR_GRACE_MS) } },
        select: { id: true },
        take: 500,
      });
      for (const { id } of expiring) {
        const r = await this.prisma.khqrCharge.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'EXPIRED' } });
        if (r.count) {
          result.expired++;
          await this.publish(id);
        }
      }
    } finally {
      await this.redis.client.del(this.lockKey);
    }
    return result;
  }

  /**
   * Fetches the Bakong transfer for a paid code, checks it is exactly what was asked for, and hands
   * it to ingestion (which stores the payment and sends every alert). Anything that does not match
   * is parked for review instead of being announced as money received.
   */
  private async settle(charge: ChargeWithRefs): Promise<boolean> {
    let tx: BakongTransaction | null;
    try {
      tx = await this.bakongHealth.track(() => this.bakong.checkMd5(charge.md5));
    } catch (e) {
      if (e instanceof BakongError) this.logger.warn(`Bakong detail check failed for ${charge.reference}: ${e.message}`);
      return false;
    }
    if (!tx) return false;

    const problem = this.mismatch(charge, tx);
    if (problem) {
      const r = await this.prisma.khqrCharge.updateMany({
        where: { id: charge.id, status: 'PENDING' },
        data: { status: 'REVIEW', reviewReason: problem, providerTxnId: tx.hash.slice(0, 128) },
      });
      if (r.count) {
        this.logger.warn(`KHQR ${charge.reference} needs review: ${problem}`);
        await this.publish(charge.id);
      }
      return false;
    }

    const payload = {
      eventId: `khqr_${charge.md5}`,
      type: 'payment.succeeded',
      transactionId: tx.hash.slice(0, 128),
      amount: fromMinorUnits(charge.amountMinor, charge.currency),
      currency: charge.currency,
      occurredAt: (tx.occurredAt.getTime() > Date.now() ? new Date() : tx.occurredAt).toISOString(),
      ...(tx.fromAccountId ? { payer: { account: tx.fromAccountId.slice(0, 64) } } : {}),
      reference: charge.reference,
      description: 'Bakong KHQR',
      ...(charge.outlet ? { outletCode: charge.outlet.code } : {}),
    };
    await this.ingestion.accept(charge.bankConnection, payload, charge.simulated ? 'SIMULATOR' : 'POLLER');
    const r = await this.prisma.khqrCharge.updateMany({
      where: { id: charge.id, status: { in: ['PENDING', 'EXPIRED'] } },
      data: {
        status: 'PAID',
        paidAt: tx.occurredAt,
        providerTxnId: tx.hash.slice(0, 128),
        payerAccount: tx.fromAccountId ? maskAccount(tx.fromAccountId) : null,
      },
    });
    if (r.count) {
      alertsSent.inc({ channel: 'khqr', result: 'paid' });
      await this.publish(charge.id);
    }
    return r.count === 1;
  }

  /** null when the Bakong transfer is exactly the payment requested. */
  private mismatch(charge: ChargeWithRefs, tx: BakongTransaction): string | null {
    if (tx.currency !== charge.currency) return `currency ${tx.currency || '?'} instead of ${charge.currency}`;
    let paidMinor: bigint;
    try {
      paidMinor = toMinorUnits(tx.amount, charge.currency);
    } catch {
      return `unreadable amount "${tx.amount}"`;
    }
    if (paidMinor !== charge.amountMinor) {
      return `amount ${tx.amount} instead of ${fromMinorUnits(charge.amountMinor, charge.currency)}`;
    }
    const expected = charge.bankConnection.externalAccountId?.toLowerCase();
    if (tx.toAccountId && expected && tx.toAccountId.toLowerCase() !== expected) {
      return `paid to ${tx.toAccountId} instead of ${expected}`;
    }
    return null;
  }

  private async publish(id: string): Promise<KhqrChargeDto> {
    const c = await this.prisma.khqrCharge.findUniqueOrThrow({ where: { id }, include: { bankConnection: true } });
    const dto = toChargeDto(c);
    this.realtime.emitToCompany(RealtimeEvent.KHQR_CHARGE_UPDATED, c.companyId, c.outletId, dto);
    return dto;
  }

  private async findOwned(user: TenantUser, id: string): Promise<ChargeWithRefs> {
    const c = await this.prisma.forTenant(user.companyId).khqrCharge.findFirst({
      where: {
        id,
        companyId: user.companyId,
        ...(user.outletIds.length > 0 ? { outletId: { in: user.outletIds } } : {}),
      },
      include: { bankConnection: { include: { provider: true } }, outlet: true },
    });
    if (!c) throw apiError(HttpStatus.NOT_FOUND, 'KHQR_CHARGE_NOT_FOUND');
    return c;
  }
}
