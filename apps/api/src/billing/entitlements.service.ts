import { HttpStatus, Injectable } from '@nestjs/common';
import type { ApiErrorCode, PlanResource, PlanUsage } from '@onepay/shared';
import { Prisma, type Plan, type Subscription, type SubscriptionStatus } from '@prisma/client';
import { apiError } from '../common/api-error';
import { PrismaService } from '../prisma/prisma.service';

type Db = Prisma.TransactionClient | PrismaService;

/** Statuses in which a merchant may add plan-limited resources. */
export const USABLE_STATUSES: readonly SubscriptionStatus[] = ['TRIALING', 'ACTIVE', 'PAST_DUE'];

const LIMIT_ERROR: Record<PlanResource, ApiErrorCode> = {
  outlets: 'PLAN_LIMIT_OUTLETS',
  employees: 'PLAN_LIMIT_EMPLOYEES',
  bankConnections: 'PLAN_LIMIT_BANK_CONNECTIONS',
  devices: 'PLAN_LIMIT_DEVICES',
};

export function planLimit(plan: Plan, resource: PlanResource): number {
  switch (resource) {
    case 'outlets':
      return plan.maxOutlets;
    case 'employees':
      return plan.maxEmployees;
    case 'bankConnections':
      return plan.maxBankConns;
    case 'devices':
      return plan.maxDevices;
  }
}

/**
 * Plan limits, enforced on the server. What counts toward a limit:
 * - outlets: active outlets
 * - employees: active memberships other than the owner(s)
 * - bank connections: connections that are not disconnected
 * - devices: devices that are not disabled
 * Deactivating or disconnecting frees the slot. Merchants already above a lower plan's limit keep
 * what they have; they just cannot add more.
 */
@Injectable()
export class EntitlementsService {
  constructor(private readonly prisma: PrismaService) {}

  current(companyId: string, db: Db = this.prisma): Promise<(Subscription & { plan: Plan }) | null> {
    return db.subscription.findFirst({ where: { companyId }, orderBy: { createdAt: 'desc' }, include: { plan: true } });
  }

  count(companyId: string, resource: PlanResource, db: Db = this.prisma): Promise<number> {
    switch (resource) {
      case 'outlets':
        return db.outlet.count({ where: { companyId, isActive: true } });
      case 'employees':
        return db.membership.count({ where: { companyId, isActive: true, role: { not: 'OWNER' } } });
      case 'bankConnections':
        return db.bankConnection.count({ where: { companyId, status: { not: 'DISCONNECTED' } } });
      case 'devices':
        return db.device.count({ where: { companyId, status: { not: 'DISABLED' } } });
    }
  }

  async usage(companyId: string, plan: Plan | null, db: Db = this.prisma): Promise<PlanUsage> {
    const resources: PlanResource[] = ['outlets', 'employees', 'bankConnections', 'devices'];
    const usage = {} as PlanUsage;
    for (const r of resources) {
      usage[r] = { used: await this.count(companyId, r, db), limit: plan ? planLimit(plan, r) : 0 };
    }
    return usage;
  }

  /**
   * Throws unless the company may add `adding` more of `resource`. Call it inside the transaction
   * that creates (or re-activates) the resource: the per-company advisory lock makes concurrent
   * requests queue up, so two parallel requests cannot both take the last slot.
   */
  async assertCanAdd(tx: Prisma.TransactionClient, companyId: string, resource: PlanResource, adding = 1): Promise<void> {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`entitlements:${companyId}`}))::text`;
    const sub = await this.current(companyId, tx);
    if (!sub || !USABLE_STATUSES.includes(sub.status)) {
      throw apiError(HttpStatus.FORBIDDEN, 'SUBSCRIPTION_INACTIVE');
    }
    const limit = planLimit(sub.plan, resource);
    const used = await this.count(companyId, resource, tx);
    if (used + adding > limit) {
      throw apiError(HttpStatus.FORBIDDEN, LIMIT_ERROR[resource], { plan: sub.plan.name, limit });
    }
  }
}
