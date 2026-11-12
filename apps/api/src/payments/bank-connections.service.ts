import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  BankConnectionDto,
  BankConnectionWithSecretDto,
  Paginated,
  PaymentProviderDto,
} from '@onepay/shared';
import { Prisma, type BankConnection, type PaymentProvider } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import type { TenantUser } from '../common/auth-user';
import type { PaginationQueryDto } from '../common/pagination.dto';
import { AppConfig } from '../config/app-config.service';
import { CryptoService } from '../infra/crypto.service';
import { EntitlementsService } from '../billing/entitlements.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  adapterFor,
  credentialsAad,
  maskAccount,
  newWebhookSecret,
  webhookSecretAad,
} from './adapters';
import type {
  CreateBankConnectionDto,
  CredentialsInput,
  SimulatePaymentDto,
  UpdateBankConnectionDto,
} from './bank-connections.dto';
import { IngestionService } from './ingestion.service';

type ConnectionWithProvider = BankConnection & { provider: PaymentProvider };

export function toProviderDto(p: PaymentProvider): PaymentProviderDto {
  return {
    id: p.id,
    code: p.code,
    name: p.name,
    type: p.type,
    logoUrl: p.logoUrl,
    integrationAvailable: adapterFor(p.adapterKey) !== null,
    isDemo: p.isDemo,
  };
}

@Injectable()
export class BankConnectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly config: AppConfig,
    private readonly audit: AuditService,
    private readonly ingestion: IngestionService,
    private readonly entitlements: EntitlementsService,
  ) {}

  webhookUrl(c: ConnectionWithProvider): string | null {
    const adapter = adapterFor(c.provider.adapterKey);
    if (!adapter?.acceptsPublicWebhooks) return null;
    return `${this.config.get('PUBLIC_API_URL')}/api/v1/webhooks/${c.id}`;
  }

  toDto(c: ConnectionWithProvider): BankConnectionDto {
    return {
      id: c.id,
      companyId: c.companyId,
      outletId: c.outletId,
      provider: {
        id: c.provider.id,
        code: c.provider.code,
        name: c.provider.name,
        type: c.provider.type,
        isDemo: c.provider.isDemo,
      },
      displayName: c.displayName,
      accountName: c.accountName,
      accountNumberMasked: c.accountNumberMasked,
      currency: c.currency,
      status: c.status,
      hasCredentials: c.credentialCiphertext !== null,
      webhookUrl: this.webhookUrl(c),
      lastSyncedAt: c.lastSyncedAt?.toISOString() ?? null,
      lastError: c.lastError,
      createdAt: c.createdAt.toISOString(),
    };
  }

  async listProviders(): Promise<PaymentProviderDto[]> {
    const providers = await this.prisma.paymentProvider.findMany({
      where: { isActive: true, ...(this.config.allowsSimulatedPayments ? {} : { isDemo: false }) },
      orderBy: [{ isDemo: 'asc' }, { name: 'asc' }],
    });
    return providers.map(toProviderDto);
  }

  private scope(user: TenantUser): Prisma.BankConnectionWhereInput {
    return {
      companyId: user.companyId,
      ...(user.outletIds.length > 0 ? { outletId: { in: user.outletIds } } : {}),
    };
  }

  async list(user: TenantUser, q: PaginationQueryDto): Promise<Paginated<BankConnectionDto>> {
    const where: Prisma.BankConnectionWhereInput = {
      ...this.scope(user),
      ...(q.search ? { displayName: { contains: q.search, mode: 'insensitive' } } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.bankConnection.findMany({
        where,
        include: { provider: true },
        orderBy: { createdAt: 'asc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.bankConnection.count({ where }),
    ]);
    return { items: items.map((c) => this.toDto(c)), total, page: q.page, pageSize: q.pageSize };
  }

  async get(user: TenantUser, id: string): Promise<BankConnectionDto> {
    return this.toDto(await this.findOwned(user, id));
  }

  async create(
    user: TenantUser,
    dto: CreateBankConnectionDto,
    ip: string | null,
  ): Promise<BankConnectionWithSecretDto> {
    const provider = await this.prisma.paymentProvider.findFirst({
      where: { id: dto.providerId, isActive: true },
    });
    if (!provider) throw new BadRequestException('Unknown or inactive payment provider');
    const adapter = adapterFor(provider.adapterKey);
    if ((provider.isDemo || adapter?.demoOnly) && !this.config.allowsSimulatedPayments) {
      throw new ForbiddenException('Demo providers are not available in production');
    }
    if (dto.outletId) await this.assertOutlet(user.companyId, dto.outletId);
    const credentials = dto.credentials ? validateCredentials(dto.credentials) : null;

    const id = randomUUID();
    const webhookSecret = adapter?.acceptsPublicWebhooks ? newWebhookSecret() : null;
    const status = !adapter ? 'PENDING' : adapter.demoOnly ? 'ACTIVE' : 'PENDING';
    const lastError = adapter
      ? null
      : `Live integration with ${provider.name} is not available yet. The connection will activate once it is.`;

    const created = await this.prisma.$transaction(async (tx) => {
      await this.entitlements.assertCanAdd(tx, user.companyId, 'bankConnections');
      const c = await tx.bankConnection.create({
        data: {
          id,
          companyId: user.companyId,
          outletId: dto.outletId ?? null,
          providerId: provider.id,
          displayName: dto.displayName,
          accountName: dto.accountName ?? null,
          accountNumberMasked: dto.accountNumber ? maskAccount(dto.accountNumber) : null,
          currency: dto.currency,
          status,
          lastError,
          credentialCiphertext: credentials
            ? this.crypto.encrypt(JSON.stringify(credentials), credentialsAad(id))
            : null,
          webhookSecretCiphertext: webhookSecret
            ? this.crypto.encrypt(webhookSecret, webhookSecretAad(id))
            : null,
        },
        include: { provider: true },
      });
      await this.audit.log(
        {
          companyId: user.companyId,
          actorUserId: user.userId,
          action: 'bank_connection.created',
          entityType: 'bank_connection',
          entityId: id,
          metadata: { provider: provider.code, currency: dto.currency, hasCredentials: !!credentials },
          ipAddress: ip,
        },
        tx,
      );
      return c;
    });
    return { ...this.toDto(created), webhookSecret };
  }

  async update(
    user: TenantUser,
    id: string,
    dto: UpdateBankConnectionDto,
    ip: string | null,
  ): Promise<BankConnectionDto> {
    const existing = await this.findOwned(user, id);
    if (existing.status === 'DISCONNECTED') throw new BadRequestException('Connection is disconnected');
    if (dto.outletId) await this.assertOutlet(user.companyId, dto.outletId);
    const credentials = dto.credentials ? validateCredentials(dto.credentials) : undefined;

    const updated = await this.prisma.$transaction(async (tx) => {
      const c = await tx.bankConnection.update({
        where: { id },
        data: {
          displayName: dto.displayName,
          accountName: dto.accountName,
          outletId: dto.outletId,
          ...(credentials
            ? {
                credentialCiphertext: this.crypto.encrypt(
                  JSON.stringify(credentials),
                  credentialsAad(id),
                ),
              }
            : {}),
        },
        include: { provider: true },
      });
      await this.audit.log(
        {
          companyId: user.companyId,
          actorUserId: user.userId,
          action: 'bank_connection.updated',
          entityType: 'bank_connection',
          entityId: id,
          // Field names only; credential values are never logged.
          metadata: { fields: Object.keys(dto) },
          ipAddress: ip,
        },
        tx,
      );
      return c;
    });
    return this.toDto(updated);
  }

  async rotateWebhookSecret(user: TenantUser, id: string, ip: string | null): Promise<BankConnectionWithSecretDto> {
    const existing = await this.findOwned(user, id);
    if (!adapterFor(existing.provider.adapterKey)?.acceptsPublicWebhooks) {
      throw new BadRequestException('This provider does not use webhooks');
    }
    if (existing.status === 'DISCONNECTED') throw new BadRequestException('Connection is disconnected');
    const secret = newWebhookSecret();
    const updated = await this.prisma.$transaction(async (tx) => {
      const c = await tx.bankConnection.update({
        where: { id },
        data: { webhookSecretCiphertext: this.crypto.encrypt(secret, webhookSecretAad(id)) },
        include: { provider: true },
      });
      await this.audit.log(
        {
          companyId: user.companyId,
          actorUserId: user.userId,
          action: 'bank_connection.webhook_secret_rotated',
          entityType: 'bank_connection',
          entityId: id,
          ipAddress: ip,
        },
        tx,
      );
      return c;
    });
    return { ...this.toDto(updated), webhookSecret: secret };
  }

  /** Disconnect: stops ingestion and destroys stored secrets. Transactions are kept. */
  async disconnect(user: TenantUser, id: string, ip: string | null): Promise<BankConnectionDto> {
    await this.findOwned(user, id);
    const updated = await this.prisma.$transaction(async (tx) => {
      const c = await tx.bankConnection.update({
        where: { id },
        data: { status: 'DISCONNECTED', credentialCiphertext: null, webhookSecretCiphertext: null },
        include: { provider: true },
      });
      await this.audit.log(
        {
          companyId: user.companyId,
          actorUserId: user.userId,
          action: 'bank_connection.disconnected',
          entityType: 'bank_connection',
          entityId: id,
          ipAddress: ip,
        },
        tx,
      );
      return c;
    });
    return this.toDto(updated);
  }

  /**
   * Demo simulator. Refused in production and for non-demo providers. Goes through the same
   * inbox → queue → worker pipeline as real webhooks; resulting transactions are flagged
   * `isSimulated` so they can never be mistaken for real money.
   */
  async simulatePayment(
    user: TenantUser,
    id: string,
    dto: SimulatePaymentDto,
  ): Promise<{ webhookEventId: string; status: 'accepted' }> {
    if (!this.config.allowsSimulatedPayments) {
      throw new ForbiddenException('Simulated payments are disabled in production');
    }
    const c = await this.findOwned(user, id);
    if (!c.provider.isDemo || !adapterFor(c.provider.adapterKey)?.demoOnly) {
      throw new ForbiddenException('Only demo simulator connections can simulate payments');
    }
    if (c.status === 'DISCONNECTED') throw new BadRequestException('Connection is disconnected');
    const payload = {
      eventId: `sim_evt_${randomUUID()}`,
      type: dto.type ?? 'payment.succeeded',
      transactionId: `SIM-${Date.now()}-${randomUUID().slice(0, 8)}`,
      amount: dto.amount,
      currency: c.currency,
      occurredAt: new Date().toISOString(),
      ...(dto.payerName ? { payer: { name: dto.payerName } } : {}),
      reference: 'DEMO SIMULATION',
      ...(dto.outletCode ? { outletCode: dto.outletCode } : {}),
    };
    const result = await this.ingestion.accept(c, payload, 'SIMULATOR');
    return { webhookEventId: result.webhookEventId, status: 'accepted' };
  }

  private async assertOutlet(companyId: string, outletId: string): Promise<void> {
    const count = await this.prisma.outlet.count({ where: { id: outletId, companyId } });
    if (count !== 1) throw new BadRequestException('Outlet does not exist');
  }

  private async findOwned(user: TenantUser, id: string): Promise<ConnectionWithProvider> {
    const c = await this.prisma.bankConnection.findFirst({
      where: { id, ...this.scope(user) },
      include: { provider: true },
    });
    if (!c) throw new NotFoundException('Bank connection not found');
    return c;
  }
}

function validateCredentials(input: CredentialsInput): CredentialsInput {
  const entries = Object.entries(input);
  if (entries.length === 0 || entries.length > 20) {
    throw new BadRequestException('credentials must contain 1-20 entries');
  }
  for (const [k, v] of entries) {
    if (!/^[A-Za-z0-9_.-]{1,64}$/.test(k) || typeof v !== 'string' || v.length === 0 || v.length > 4000) {
      throw new BadRequestException('credentials must map short keys to non-empty string values');
    }
  }
  return input;
}
