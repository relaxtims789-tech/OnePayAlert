import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CompanyStatus,
  Paginated,
  PlanDto,
  PlatformAuditDto,
  PlatformHealthDto,
  PlatformOverviewDto,
  SubscriptionStatus,
} from '@onepay/shared';
import { Prisma, type Plan } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../common/auth-user';
import { AppConfig } from '../config/app-config.service';
import { IngestQueue } from '../infra/ingest-queue.service';
import { RedisService } from '../infra/redis.service';
import { PrismaService } from '../prisma/prisma.service';
import { minorToNumber } from '../transactions/transaction.mapper';
import { BUSINESS_TIMEZONE } from '../transactions/transactions.module';
import { PlatformCompaniesService } from './platform-companies.service';
import type { CreatePlanDto, PlatformAuditQueryDto, UpdatePlanDto } from './platform.dto';

const STUCK_AFTER_MS = 2 * 60_000;
const DAY_MS = 86_400_000;

/** Start of today in Phnom Penh (UTC+7, no DST). */
function startOfBusinessDay(now = new Date()): Date {
  const offset = 7 * 3600_000;
  const local = new Date(now.getTime() + offset);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - offset);
}

export function toPlanDto(p: Plan & { _count?: { subscriptions: number } }): PlanDto {
  return {
    id: p.id,
    code: p.code,
    name: p.name,
    priceMinor: minorToNumber(p.priceMinor),
    currency: p.currency,
    interval: p.interval,
    maxOutlets: p.maxOutlets,
    maxEmployees: p.maxEmployees,
    maxBankConns: p.maxBankConns,
    maxDevices: p.maxDevices,
    isActive: p.isActive,
    subscriberCount: p._count?.subscriptions ?? 0,
  };
}

@Injectable()
export class PlatformOpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companies: PlatformCompaniesService,
    private readonly audit: AuditService,
    private readonly redis: RedisService,
    private readonly queue: IngestQueue,
    private readonly config: AppConfig,
  ) {}

  // ───────────── Overview ─────────────

  async overview(): Promise<PlatformOverviewDto> {
    const today = startOfBusinessDay();
    const since30 = new Date(Date.now() - 30 * DAY_MS);
    const [byStatus, newMerchants, subs, payments, conns, failed, stuck, signups, recent] = await Promise.all([
      this.prisma.company.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.company.count({ where: { createdAt: { gte: since30 } } }),
      this.prisma.subscription.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.transaction.groupBy({
        by: ['currency', 'isSimulated'],
        where: { status: 'SUCCESS', direction: 'CREDIT', occurredAt: { gte: today } },
        _count: { _all: true },
        _sum: { amountMinor: true },
      }),
      this.prisma.bankConnection.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.webhookEvent.count({ where: { status: 'FAILED', receivedAt: { gte: new Date(Date.now() - DAY_MS) } } }),
      this.prisma.webhookEvent.count({ where: { status: 'RECEIVED', receivedAt: { lt: new Date(Date.now() - STUCK_AFTER_MS) } } }),
      this.prisma.$queryRaw<{ date: string; count: number }[]>`
        SELECT to_char((created_at AT TIME ZONE ${BUSINESS_TIMEZONE})::date, 'YYYY-MM-DD') AS date, COUNT(*)::int AS count
        FROM companies WHERE created_at >= ${since30}
        GROUP BY 1 ORDER BY 1`,
      this.companies.recent(8),
    ]);

    const statusCounts: Record<CompanyStatus, number> = { PENDING: 0, ACTIVE: 0, SUSPENDED: 0, CLOSED: 0 };
    byStatus.forEach((s) => (statusCounts[s.status] = s._count._all));
    const subCounts: Record<SubscriptionStatus, number> = { TRIALING: 0, ACTIVE: 0, PAST_DUE: 0, CANCELED: 0, EXPIRED: 0 };
    subs.forEach((s) => (subCounts[s.status] = s._count._all));
    const connCount = (s: string) => conns.find((c) => c.status === s)?._count._all ?? 0;

    return {
      merchants: {
        total: Object.values(statusCounts).reduce((a, b) => a + b, 0),
        byStatus: statusCounts,
        newLast30Days: newMerchants,
      },
      subscriptions: subCounts,
      paymentsToday: payments
        .filter((p) => !p.isSimulated)
        .map((p) => ({ currency: p.currency, count: p._count._all, amountMinor: minorToNumber(p._sum.amountMinor) })),
      simulatedPaymentsToday: payments.filter((p) => p.isSimulated).reduce((a, p) => a + p._count._all, 0),
      connections: { active: connCount('ACTIVE'), pending: connCount('PENDING'), error: connCount('ERROR') },
      webhookEvents: { failedLast24h: failed, stuck },
      signupsDaily: signups,
      recentMerchants: recent,
    };
  }

  // ───────────── Plans ─────────────

  async listPlans(): Promise<PlanDto[]> {
    const plans = await this.prisma.plan.findMany({
      orderBy: [{ isActive: 'desc' }, { priceMinor: 'asc' }],
      include: { _count: { select: { subscriptions: true } } },
    });
    return plans.map(toPlanDto);
  }

  async createPlan(actor: AuthUser, dto: CreatePlanDto, ip: string | null): Promise<PlanDto> {
    const exists = await this.prisma.plan.findUnique({ where: { code: dto.code } });
    if (exists) throw new ConflictException(`Plan code ${dto.code} already exists`);
    const plan = await this.prisma.plan.create({ data: { ...dto, priceMinor: BigInt(dto.priceMinor) } });
    await this.audit.log({
      companyId: null,
      actorUserId: actor.userId,
      action: 'platform.plan.created',
      entityType: 'plan',
      entityId: plan.id,
      metadata: { code: plan.code, priceMinor: dto.priceMinor, currency: dto.currency },
      ipAddress: ip,
    });
    return toPlanDto(plan);
  }

  async updatePlan(actor: AuthUser, id: string, dto: UpdatePlanDto, ip: string | null): Promise<PlanDto> {
    if (Object.keys(dto).length === 0) throw new BadRequestException('Nothing to update');
    const existing = await this.prisma.plan.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Plan not found');
    const { priceMinor, ...rest } = dto;
    const plan = await this.prisma.plan.update({
      where: { id },
      data: { ...rest, ...(priceMinor !== undefined ? { priceMinor: BigInt(priceMinor) } : {}) },
      include: { _count: { select: { subscriptions: true } } },
    });
    await this.audit.log({
      companyId: null,
      actorUserId: actor.userId,
      action: 'platform.plan.updated',
      entityType: 'plan',
      entityId: id,
      metadata: { code: plan.code, fields: Object.keys(dto) },
      ipAddress: ip,
    });
    return toPlanDto(plan);
  }

  // ───────────── Audit ─────────────

  async auditLogs(q: PlatformAuditQueryDto): Promise<Paginated<PlatformAuditDto>> {
    const where: Prisma.AuditLogWhereInput = {
      ...(q.companyId ? { companyId: q.companyId } : {}),
      ...(q.action ? { action: { startsWith: q.action } } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { company: { select: { name: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    const actorIds = [...new Set(rows.map((r) => r.actorUserId).filter((x): x is string => !!x))];
    const actors = await this.prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, email: true } });
    const email = new Map(actors.map((a) => [a.id, a.email]));
    return {
      items: rows.map((r) => ({
        id: r.id,
        createdAt: r.createdAt.toISOString(),
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        companyId: r.companyId,
        companyName: r.company?.name ?? null,
        actorUserId: r.actorUserId,
        actorEmail: r.actorUserId ? (email.get(r.actorUserId) ?? null) : null,
        ipAddress: r.ipAddress,
        metadata: r.metadata,
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  // ───────────── Health & webhook recovery ─────────────

  async health(): Promise<PlatformHealthDto> {
    let database: 'up' | 'down' = 'up';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      database = 'down';
    }
    const redis = (await this.redis.ping()) ? 'up' : 'down';
    const queue = this.queue.isConnected() ? 'up' : 'down';
    const dayAgo = new Date(Date.now() - DAY_MS);

    const [received, stuck, failed24, processed24, failures] =
      database === 'up'
        ? await Promise.all([
            this.prisma.webhookEvent.count({ where: { status: 'RECEIVED' } }),
            this.prisma.webhookEvent.count({ where: { status: 'RECEIVED', receivedAt: { lt: new Date(Date.now() - STUCK_AFTER_MS) } } }),
            this.prisma.webhookEvent.count({ where: { status: 'FAILED', receivedAt: { gte: dayAgo } } }),
            this.prisma.webhookEvent.count({ where: { status: 'PROCESSED', receivedAt: { gte: dayAgo } } }),
            this.prisma.webhookEvent.findMany({
              where: { status: 'FAILED' },
              orderBy: { receivedAt: 'desc' },
              take: 20,
              select: {
                id: true,
                companyId: true,
                providerEventId: true,
                attempts: true,
                lastError: true,
                receivedAt: true,
                bankConnection: {
                  select: { displayName: true, provider: { select: { code: true } }, company: { select: { name: true } } },
                },
              },
            }),
          ])
        : [0, 0, 0, 0, []];

    return {
      status: database === 'down' ? 'error' : redis === 'up' && queue === 'up' && stuck === 0 ? 'ok' : 'degraded',
      database,
      redis,
      queue,
      queueDriver: this.queue.driver,
      environment: this.config.get('APP_ENV'),
      webhookEvents: { received, stuck, failedLast24h: failed24, processedLast24h: processed24 },
      recentFailures: failures.map((f) => ({
        id: f.id,
        companyId: f.companyId,
        companyName: f.bankConnection.company.name,
        connectionName: f.bankConnection.displayName,
        providerCode: f.bankConnection.provider.code,
        providerEventId: f.providerEventId,
        attempts: f.attempts,
        lastError: f.lastError,
        receivedAt: f.receivedAt.toISOString(),
      })),
    };
  }

  /** Re-queues a FAILED inbound event (e.g. after fixing a connection or outlet code). */
  async retryWebhookEvent(actor: AuthUser, id: string, ip: string | null): Promise<{ status: 'requeued' }> {
    const reset = await this.prisma.webhookEvent.updateMany({
      where: { id, status: 'FAILED' },
      data: { status: 'RECEIVED', attempts: 0, lastError: null, processedAt: null },
    });
    if (reset.count !== 1) {
      const exists = await this.prisma.webhookEvent.count({ where: { id } });
      if (!exists) throw new NotFoundException('Webhook event not found');
      throw new BadRequestException('Only FAILED events can be retried');
    }
    const ev = await this.prisma.webhookEvent.findUniqueOrThrow({ where: { id }, select: { companyId: true } });
    await this.audit.log({
      companyId: ev.companyId,
      actorUserId: actor.userId,
      action: 'platform.webhook_event.retried',
      entityType: 'webhook_event',
      entityId: id,
      ipAddress: ip,
    });
    await this.queue.publish(id);
    return { status: 'requeued' };
  }
}
