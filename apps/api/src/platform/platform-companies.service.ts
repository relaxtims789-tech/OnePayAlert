import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CompanyDto,
  CurrencyAmount,
  Paginated,
  PlatformCompanyDetailDto,
  PlatformCompanyDto,
  SubscriptionDto,
} from '@onepay/shared';
import { Prisma, type Plan, type Subscription } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrincipalService } from '../auth/principal.service';
import type { AuthUser } from '../common/auth-user';
import { toCompanyDto } from '../companies/companies.module';
import { PrismaService } from '../prisma/prisma.service';
import { minorToNumber } from '../transactions/transaction.mapper';
import type { CompanyStatusDto, ListCompaniesQueryDto, UpdateSubscriptionDto } from './platform.dto';

const listInclude = {
  _count: { select: { outlets: true, memberships: true } },
  memberships: {
    where: { role: 'OWNER' },
    take: 1,
    orderBy: { createdAt: 'asc' },
    select: { user: { select: { email: true } } },
  },
  subscriptions: { orderBy: { createdAt: 'desc' }, take: 1, include: { plan: { select: { code: true } } } },
} satisfies Prisma.CompanyInclude;

type CompanyWithList = Prisma.CompanyGetPayload<{ include: typeof listInclude }>;

export function toPlatformCompanyDto(c: CompanyWithList): PlatformCompanyDto {
  const sub = c.subscriptions[0];
  return {
    ...toCompanyDto(c),
    outletCount: c._count.outlets,
    employeeCount: c._count.memberships,
    ownerEmail: c.memberships[0]?.user.email ?? null,
    planCode: sub?.plan.code ?? null,
    subscriptionStatus: sub?.status ?? null,
  };
}

export function toSubscriptionDto(s: Subscription & { plan: Plan }): SubscriptionDto {
  return {
    id: s.id,
    status: s.status,
    plan: {
      id: s.plan.id,
      code: s.plan.code,
      name: s.plan.name,
      priceMinor: minorToNumber(s.plan.priceMinor),
      currency: s.plan.currency,
      interval: s.plan.interval,
    },
    currentPeriodStart: s.currentPeriodStart.toISOString(),
    currentPeriodEnd: s.currentPeriodEnd.toISOString(),
    trialEndsAt: s.trialEndsAt?.toISOString() ?? null,
    canceledAt: s.canceledAt?.toISOString() ?? null,
  };
}

/** Mysoftkh operations across all tenants. */
@Injectable()
export class PlatformCompaniesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly principals: PrincipalService,
  ) {}

  async list(q: ListCompaniesQueryDto): Promise<Paginated<PlatformCompanyDto>> {
    const where: Prisma.CompanyWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.search
        ? {
            OR: [
              { name: { contains: q.search, mode: 'insensitive' } },
              { email: { contains: q.search, mode: 'insensitive' } },
              { phone: { contains: q.search } },
              { memberships: { some: { user: { email: { contains: q.search, mode: 'insensitive' } } } } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.company.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: listInclude,
      }),
      this.prisma.company.count({ where }),
    ]);
    return { items: items.map(toPlatformCompanyDto), total, page: q.page, pageSize: q.pageSize };
  }

  async recent(take: number): Promise<PlatformCompanyDto[]> {
    const rows = await this.prisma.company.findMany({ orderBy: { createdAt: 'desc' }, take, include: listInclude });
    return rows.map(toPlatformCompanyDto);
  }

  async detail(id: string): Promise<PlatformCompanyDetailDto> {
    const c = await this.prisma.company.findUnique({
      where: { id },
      include: {
        ...listInclude,
        outlets: { orderBy: { createdAt: 'asc' }, select: { id: true, name: true, code: true, isActive: true } },
        // Explicit select: credential/secret ciphertexts never leave the database layer.
        bankConnections: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            displayName: true,
            currency: true,
            status: true,
            accountNumberMasked: true,
            lastSyncedAt: true,
            lastError: true,
            provider: { select: { code: true, name: true, type: true } },
          },
        },
      },
    });
    if (!c) throw new NotFoundException('Company not found');

    const [members, subscription, payments] = await Promise.all([
      this.prisma.membership.findMany({
        where: { companyId: id },
        orderBy: { createdAt: 'asc' },
        include: { user: { select: { id: true, fullName: true, email: true, phone: true, status: true, lastLoginAt: true } } },
      }),
      this.prisma.subscription.findFirst({ where: { companyId: id }, orderBy: { createdAt: 'desc' }, include: { plan: true } }),
      this.prisma.transaction.groupBy({
        by: ['currency', 'isSimulated'],
        where: { companyId: id, status: 'SUCCESS', direction: 'CREDIT', occurredAt: { gte: new Date(Date.now() - 30 * 86_400_000) } },
        _count: { _all: true },
        _sum: { amountMinor: true },
      }),
    ]);

    const real: CurrencyAmount[] = payments
      .filter((p) => !p.isSimulated)
      .map((p) => ({ currency: p.currency, count: p._count._all, amountMinor: minorToNumber(p._sum.amountMinor) }));

    return {
      ...toPlatformCompanyDto(c),
      members: members.map((m) => ({
        membershipId: m.id,
        userId: m.user.id,
        fullName: m.user.fullName,
        email: m.user.email,
        phone: m.user.phone,
        role: m.role,
        isActive: m.isActive,
        userStatus: m.user.status,
        lastLoginAt: m.user.lastLoginAt?.toISOString() ?? null,
      })),
      outlets: c.outlets,
      connections: c.bankConnections.map((b) => ({
        id: b.id,
        displayName: b.displayName,
        providerCode: b.provider.code,
        providerName: b.provider.name,
        providerType: b.provider.type,
        currency: b.currency,
        status: b.status,
        accountNumberMasked: b.accountNumberMasked,
        lastSyncedAt: b.lastSyncedAt?.toISOString() ?? null,
        lastError: b.lastError,
      })),
      subscription: subscription ? toSubscriptionDto(subscription) : null,
      payments30d: real,
      simulatedPayments30d: payments.filter((p) => p.isSimulated).reduce((a, p) => a + p._count._all, 0),
    };
  }

  async setStatus(actor: AuthUser, id: string, dto: CompanyStatusDto, ip: string | null): Promise<CompanyDto> {
    const company = await this.prisma.$transaction(async (tx) => {
      const before = await tx.company.findUnique({ where: { id } });
      if (!before) throw new NotFoundException('Company not found');
      const updated = await tx.company.update({ where: { id }, data: { status: dto.status } });
      await this.audit.log(
        {
          companyId: id,
          actorUserId: actor.userId,
          action: 'platform.company.status_changed',
          entityType: 'company',
          entityId: id,
          metadata: { from: before.status, to: dto.status, ...(dto.reason ? { reason: dto.reason } : {}) },
          ipAddress: ip,
        },
        tx,
      );
      return updated;
    });
    await this.principals.invalidateCompany(id);
    return toCompanyDto(company);
  }

  /** Change plan, status or billing period of the merchant's current subscription. */
  async updateSubscription(actor: AuthUser, companyId: string, dto: UpdateSubscriptionDto, ip: string | null): Promise<SubscriptionDto> {
    if (Object.keys(dto).length === 0) throw new BadRequestException('Nothing to update');
    const company = await this.prisma.company.findUnique({ where: { id: companyId }, select: { id: true } });
    if (!company) throw new NotFoundException('Company not found');
    if (dto.planId) {
      const plan = await this.prisma.plan.findUnique({ where: { id: dto.planId } });
      if (!plan) throw new BadRequestException('Unknown plan');
    }
    const periodEnd = dto.currentPeriodEnd ? new Date(dto.currentPeriodEnd) : undefined;
    const trialEnd = dto.trialEndsAt ? new Date(dto.trialEndsAt) : undefined;

    const sub = await this.prisma.$transaction(async (tx) => {
      const current = await tx.subscription.findFirst({ where: { companyId }, orderBy: { createdAt: 'desc' } });
      const data = {
        ...(dto.planId ? { planId: dto.planId } : {}),
        ...(dto.status ? { status: dto.status, canceledAt: dto.status === 'CANCELED' ? new Date() : null } : {}),
        ...(periodEnd ? { currentPeriodEnd: periodEnd } : {}),
        ...(trialEnd ? { trialEndsAt: trialEnd } : {}),
      };
      let result;
      if (current) {
        result = await tx.subscription.update({ where: { id: current.id }, data, include: { plan: true } });
      } else {
        if (!dto.planId) throw new BadRequestException('planId is required to start a subscription');
        const now = new Date();
        result = await tx.subscription.create({
          data: {
            companyId,
            planId: dto.planId,
            status: dto.status ?? 'ACTIVE',
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd ?? new Date(now.getTime() + 30 * 86_400_000),
            trialEndsAt: trialEnd ?? null,
          },
          include: { plan: true },
        });
      }
      await this.audit.log(
        {
          companyId,
          actorUserId: actor.userId,
          action: 'platform.subscription.updated',
          entityType: 'subscription',
          entityId: result.id,
          metadata: { ...dto } as Prisma.InputJsonValue,
          ipAddress: ip,
        },
        tx,
      );
      return result;
    });
    return toSubscriptionDto(sub);
  }
}
