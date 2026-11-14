import { HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import {
  AdapterKey,
  RELAY_ID_HEADER,
  parseBankNotification,
  toMinorUnits,
  type Currency,
  type RelayNotificationInput,
  type RelayNotificationResult,
  type RelayPhoneDto,
  type RelayPhoneEnrollment,
} from '@onepay/shared';
import type { RelayPhone } from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { apiError } from '../common/api-error';
import type { TenantUser } from '../common/auth-user';
import { CryptoService } from '../infra/crypto.service';
import { verifyOnePayV1 } from '../payments/adapters';
import { IngestionService } from '../payments/ingestion.service';
import { PrismaService } from '../prisma/prisma.service';

/** Notifications older than this when they reach us are not announced (a phone that was offline for a day). */
export const RELAY_MAX_AGE_MS = 24 * 3_600_000;
/** The same payment forwarded by a second phone within this window is counted once. */
export const RELAY_CROSS_PHONE_WINDOW_MS = 90_000;

const secretAad = (id: string) => `relay_phone:${id}:secret`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function toRelayPhoneDto(p: RelayPhone): RelayPhoneDto {
  return {
    id: p.id,
    bankConnectionId: p.bankConnectionId,
    name: p.name,
    lastSeenAt: p.lastSeenAt?.toISOString() ?? null,
    lastPaymentAt: p.lastPaymentAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
  };
}

/**
 * Phone bank alerts. A merchant's Android phone, set up once with a secret, forwards the
 * notifications of the bank apps the merchant chose; this service decides whether each one is a
 * payment received and sends it through the normal pipeline marked REPORTED (not bank-confirmed).
 */
@Injectable()
export class RelayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly ingestion: IngestionService,
    private readonly audit: AuditService,
  ) {}

  async enroll(user: TenantUser, dto: { bankConnectionId: string; name: string }, ip: string | null): Promise<RelayPhoneEnrollment> {
    const db = this.prisma.forTenant(user.companyId);
    const connection = await db.bankConnection.findFirst({
      where: { id: dto.bankConnectionId, companyId: user.companyId, status: 'ACTIVE', provider: { adapterKey: AdapterKey.PHONE_RELAY } },
    });
    if (!connection) throw apiError(HttpStatus.BAD_REQUEST, 'RELAY_CONNECTION_REQUIRED');
    const id = randomUUID();
    const secret = randomBytes(32).toString('base64url');
    const phone = await db.relayPhone.create({
      data: {
        id,
        companyId: user.companyId,
        bankConnectionId: connection.id,
        name: dto.name.trim(),
        secretCiphertext: this.crypto.encrypt(secret, secretAad(id)),
        createdById: user.userId,
      },
    });
    await this.audit.log({
      companyId: user.companyId,
      actorUserId: user.userId,
      action: 'relay_phone.enrolled',
      entityType: 'relay_phone',
      entityId: id,
      metadata: { bankConnectionId: connection.id, name: phone.name },
      ipAddress: ip,
    });
    return { phone: toRelayPhoneDto(phone), relayId: id, secret };
  }

  async list(user: TenantUser, bankConnectionId?: string): Promise<RelayPhoneDto[]> {
    const rows = await this.prisma.forTenant(user.companyId).relayPhone.findMany({
      where: { companyId: user.companyId, revokedAt: null, ...(bankConnectionId ? { bankConnectionId } : {}) },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toRelayPhoneDto);
  }

  async revoke(user: TenantUser, id: string, ip: string | null): Promise<void> {
    const r = await this.prisma
      .forTenant(user.companyId)
      .relayPhone.updateMany({ where: { id, companyId: user.companyId, revokedAt: null }, data: { revokedAt: new Date() } });
    if (r.count !== 1) throw apiError(HttpStatus.NOT_FOUND, 'RELAY_PHONE_NOT_FOUND');
    await this.audit.log({ companyId: user.companyId, actorUserId: user.userId, action: 'relay_phone.revoked', entityType: 'relay_phone', entityId: id, ipAddress: ip });
  }

  /** Public, called by the phone. Authenticated by the phone's own HMAC signature, not a user session. */
  async receive(
    headers: Record<string, string | string[] | undefined>,
    rawBody: Buffer | undefined,
    body: RelayNotificationInput,
    now = new Date(),
  ): Promise<RelayNotificationResult> {
    const rawId = headers[RELAY_ID_HEADER];
    const relayId = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!relayId || !UUID.test(relayId)) throw new UnauthorizedException('Unknown phone');
    const phone = await this.prisma.relayPhone.findUnique({
      where: { id: relayId },
      include: { bankConnection: { include: { provider: true } } },
    });
    // One answer for unknown, revoked and badly signed: nothing to learn by probing.
    if (!phone || phone.revokedAt) throw new UnauthorizedException('Unknown phone');
    const secret = this.crypto.decrypt(phone.secretCiphertext, secretAad(phone.id));
    if (!rawBody || !verifyOnePayV1(headers, rawBody, secret, Math.floor(now.getTime() / 1000))) {
      throw new UnauthorizedException('Unknown phone');
    }
    await this.prisma.relayPhone.update({ where: { id: phone.id }, data: { lastSeenAt: now } });

    const posted = new Date(body.postedAt);
    if (now.getTime() - posted.getTime() > RELAY_MAX_AGE_MS) return { status: 'ignored', reason: 'too_old' };
    const occurredAt = posted > now ? now : posted;

    const parsed = parseBankNotification({ title: body.title, text: body.text });
    if (parsed.kind === 'ignored') return { status: 'ignored', reason: parsed.reason };

    const target = await this.connectionFor(phone.bankConnection, parsed.currency);
    if (!target) return { status: 'ignored', reason: 'other_currency' };

    // The same payment forwarded by another phone of the shop counts once.
    const phoneTag = `relay_${phone.id.slice(0, 8)}_`;
    const twin = await this.prisma.transaction.findFirst({
      where: {
        bankConnectionId: target.id,
        verification: 'REPORTED',
        currency: parsed.currency,
        amountMinor: toMinorUnits(parsed.amount, parsed.currency),
        payerName: parsed.payerName,
        occurredAt: { gte: new Date(occurredAt.getTime() - RELAY_CROSS_PHONE_WINDOW_MS), lte: new Date(occurredAt.getTime() + RELAY_CROSS_PHONE_WINDOW_MS) },
        NOT: { providerTxnId: { startsWith: phoneTag } },
      },
      select: { id: true },
    });
    if (twin) return { status: 'duplicate' };

    const hash = createHash('sha256').update(`${phone.id}:${body.key}`).digest('hex').slice(0, 32);
    const result = await this.ingestion.accept(
      target,
      {
        eventId: `relay_${hash}`,
        type: 'payment.succeeded',
        transactionId: `${phoneTag}${hash}`,
        amount: parsed.amount,
        currency: parsed.currency,
        occurredAt: occurredAt.toISOString(),
        ...(parsed.payerName ? { payer: { name: parsed.payerName } } : {}),
        description: `Phone bank alert · ${phone.name}`.slice(0, 500),
      },
      'RELAY',
    );
    if (result.duplicate) return { status: 'duplicate' };
    await this.prisma.relayPhone.update({ where: { id: phone.id }, data: { lastPaymentAt: now } });
    return { status: 'accepted' };
  }

  /** The phone's own connection, or the shop's other phone-alert connection in that currency (USD vs KHR accounts). */
  private async connectionFor<C extends { id: string; companyId: string; currency: Currency; status: string; providerId: string }>(
    own: C,
    currency: Currency,
  ) {
    if (own.status === 'ACTIVE' && own.currency === currency) return this.prisma.bankConnection.findUniqueOrThrow({ where: { id: own.id }, include: { provider: true } });
    return this.prisma.bankConnection.findFirst({
      where: { companyId: own.companyId, providerId: own.providerId, currency, status: 'ACTIVE' },
      include: { provider: true },
      orderBy: { createdAt: 'asc' },
    });
  }
}
