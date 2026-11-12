import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  BILLING_GRACE_DAYS,
  INVOICE_DUE_DAYS,
  type BillingOverviewDto,
  type InvoiceDto,
  type Paginated,
} from '@onepay/shared';
import {
  Prisma,
  type BillingInterval,
  type Invoice,
  type InvoiceKind,
  type PaymentMethod,
  type Plan,
  type Subscription,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { apiError } from '../common/api-error';
import type { AuthUser, TenantUser } from '../common/auth-user';
import { AppConfig } from '../config/app-config.service';
import { toSubscriptionDto } from '../platform/platform-companies.service';
import { toPlanDto } from '../platform/platform-ops.service';
import { PrismaService } from '../prisma/prisma.service';
import { minorToNumber } from '../transactions/transaction.mapper';
import { EntitlementsService, USABLE_STATUSES } from './entitlements.service';

const DAY = 86_400_000;
type InvoiceWithRefs = Invoice & { plan: Plan; company?: { name: string } };

/** Adds calendar months/years in UTC, clamping to the last day (Jan 31 + 1 month = Feb 28/29). */
export function addInterval(start: Date, interval: BillingInterval): Date {
  const months = interval === 'YEAR' ? 12 : 1;
  const y = start.getUTCFullYear();
  const m = start.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(
      y,
      m,
      Math.min(start.getUTCDate(), lastDay),
      start.getUTCHours(),
      start.getUTCMinutes(),
      start.getUTCSeconds(),
      start.getUTCMilliseconds(),
    ),
  );
}

export function toInvoiceDto(i: InvoiceWithRefs): InvoiceDto {
  return {
    id: i.id,
    number: i.number,
    companyId: i.companyId,
    ...(i.company ? { companyName: i.company.name } : {}),
    kind: i.kind,
    status: i.status,
    plan: { id: i.plan.id, code: i.plan.code, name: i.plan.name },
    amountMinor: minorToNumber(i.amountMinor),
    currency: i.currency,
    interval: i.interval,
    dueAt: i.dueAt.toISOString(),
    periodStart: i.periodStart?.toISOString() ?? null,
    periodEnd: i.periodEnd?.toISOString() ?? null,
    paidAt: i.paidAt?.toISOString() ?? null,
    paymentMethod: i.paymentMethod,
    paymentReference: i.paymentReference,
    createdAt: i.createdAt.toISOString(),
  };
}

export interface LifecycleResult {
  trialsExpired: number;
  renewalInvoicesIssued: number;
  pastDue: number;
  canceled: number;
  expired: number;
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    private readonly audit: AuditService,
    private readonly config: AppConfig,
  ) {}

  // ───────────────────────── Merchant ─────────────────────────

  async overview(user: TenantUser): Promise<BillingOverviewDto> {
    const sub = await this.entitlements.current(user.companyId);
    const [usage, openInvoice, plans] = await Promise.all([
      this.entitlements.usage(user.companyId, sub?.plan ?? null),
      sub
        ? this.prisma.invoice.findFirst({ where: { subscriptionId: sub.id, status: 'OPEN' }, include: { plan: true } })
        : null,
      this.prisma.plan.findMany({ where: { isActive: true }, orderBy: { priceMinor: 'asc' } }),
    ]);
    return {
      subscription: sub ? toSubscriptionDto(sub) : null,
      canAddResources: !!sub && USABLE_STATUSES.includes(sub.status),
      usage,
      limits: sub
        ? {
            maxOutlets: sub.plan.maxOutlets,
            maxEmployees: sub.plan.maxEmployees,
            maxBankConns: sub.plan.maxBankConns,
            maxDevices: sub.plan.maxDevices,
          }
        : null,
      openInvoice: openInvoice ? toInvoiceDto(openInvoice) : null,
      plans: plans.map((p) => {
        const { subscriberCount: _omit, ...rest } = toPlanDto(p);
        return rest;
      }),
      paymentInstructions: this.config.get('BILLING_PAYMENT_INSTRUCTIONS'),
    };
  }

  async listInvoices(
    filter: { companyId?: string; status?: Invoice['status'] },
    page: number,
    pageSize: number,
    withCompany = false,
  ): Promise<Paginated<InvoiceDto>> {
    const where: Prisma.InvoiceWhereInput = {
      ...(filter.companyId ? { companyId: filter.companyId } : {}),
      ...(filter.status ? { status: filter.status } : {}),
    };
    // A merchant's own invoices go through the tenant client (row-level security); MysoftKH lists all.
    const db = filter.companyId ? this.prisma.forTenant(filter.companyId) : this.prisma;
    const [items, total] = await Promise.all([
      db.invoice.findMany({
        where,
        include: { plan: true, ...(withCompany ? { company: { select: { name: true } } } : {}) },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.invoice.count({ where }),
    ]);
    return { items: items.map(toInvoiceDto), total, page, pageSize };
  }

  /**
   * The merchant picks a plan: issues (or returns) the invoice to pay. The plan only takes
   * effect once MysoftKH confirms the payment — choosing a plan never unlocks anything by itself.
   */
  async checkout(user: TenantUser, planId: string, ip: string | null): Promise<InvoiceDto> {
    const plan = await this.prisma.plan.findFirst({ where: { id: planId, isActive: true } });
    if (!plan) throw apiError(HttpStatus.BAD_REQUEST, 'PLAN_UNAVAILABLE');

    const invoice = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`billing:${user.companyId}`}))::text`;
      let sub = await this.entitlements.current(user.companyId, tx);
      if (!sub) {
        // Companies created before billing existed: start an (expired) record to bill against.
        const now = new Date();
        sub = await tx.subscription.create({
          data: { companyId: user.companyId, planId: plan.id, status: 'EXPIRED', currentPeriodStart: now, currentPeriodEnd: now },
          include: { plan: true },
        });
      }
      const open = await tx.invoice.findFirst({ where: { subscriptionId: sub.id, status: 'OPEN' }, include: { plan: true } });
      if (open && open.planId === plan.id) return open;

      const paying = sub.status === 'ACTIVE' || sub.status === 'PAST_DUE';
      if (sub.status === 'ACTIVE' && sub.planId === plan.id) throw apiError(HttpStatus.CONFLICT, 'ALREADY_ON_PLAN');
      const kind: InvoiceKind = !paying ? 'NEW' : sub.planId === plan.id ? 'RENEWAL' : 'PLAN_CHANGE';

      if (open) {
        await tx.invoice.update({ where: { id: open.id }, data: { status: 'VOID', voidedAt: new Date() } });
      }
      const created = await this.issue(tx, sub, plan, kind, new Date(Date.now() + INVOICE_DUE_DAYS * DAY));
      await this.audit.log(
        {
          companyId: user.companyId,
          actorUserId: user.userId,
          action: 'billing.checkout',
          entityType: 'invoice',
          entityId: created.id,
          metadata: { number: created.number, plan: plan.code, kind, ...(open ? { replaced: open.number } : {}) },
          ipAddress: ip,
        },
        tx,
      );
      return created;
    });
    return toInvoiceDto(invoice);
  }

  // ───────────────────────── MysoftKH staff ─────────────────────────

  /**
   * Records a payment that MysoftKH has actually received and starts the paid period.
   * Renewals continue from the previous period end, so paying during the grace period does not
   * gain free days; anything else starts on the payment date.
   */
  async markPaid(
    actor: AuthUser,
    invoiceId: string,
    dto: { paymentMethod: PaymentMethod; paymentReference?: string; paidAt?: string },
    ip: string | null,
  ): Promise<InvoiceDto> {
    const paidAt = dto.paidAt ? new Date(dto.paidAt) : new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      const inv = await tx.invoice.findUnique({ where: { id: invoiceId }, include: { plan: true, subscription: true } });
      if (!inv) throw apiError(HttpStatus.NOT_FOUND, 'INVOICE_NOT_FOUND');
      if (inv.status !== 'OPEN') throw apiError(HttpStatus.CONFLICT, 'INVOICE_NOT_OPEN');
      const sub = inv.subscription;

      let start = paidAt;
      if (inv.kind === 'RENEWAL' && (sub.status === 'ACTIVE' || sub.status === 'PAST_DUE')) {
        start = sub.currentPeriodEnd;
        if (addInterval(start, inv.interval) <= paidAt) start = paidAt; // paid absurdly late
      }
      const end = addInterval(start, inv.interval);

      const updated = await tx.invoice.update({
        where: { id: inv.id },
        data: {
          status: 'PAID',
          paidAt,
          paymentMethod: dto.paymentMethod,
          paymentReference: dto.paymentReference ?? null,
          confirmedById: actor.userId,
          periodStart: start,
          periodEnd: end,
        },
        include: { plan: true, company: { select: { name: true } } },
      });
      await tx.subscription.update({
        where: { id: sub.id },
        data: { planId: inv.planId, status: 'ACTIVE', currentPeriodStart: start, currentPeriodEnd: end, canceledAt: null },
      });
      await this.audit.log(
        {
          companyId: inv.companyId,
          actorUserId: actor.userId,
          action: 'platform.invoice.paid',
          entityType: 'invoice',
          entityId: inv.id,
          metadata: {
            number: inv.number,
            amountMinor: inv.amountMinor.toString(),
            currency: inv.currency,
            method: dto.paymentMethod,
            reference: dto.paymentReference ?? null,
            periodStart: start.toISOString(),
            periodEnd: end.toISOString(),
          },
          ipAddress: ip,
        },
        tx,
      );
      return updated;
    });
    return toInvoiceDto(result);
  }

  async voidInvoice(actor: AuthUser, invoiceId: string, ip: string | null): Promise<InvoiceDto> {
    const result = await this.prisma.$transaction(async (tx) => {
      const inv = await tx.invoice.findUnique({ where: { id: invoiceId } });
      if (!inv) throw apiError(HttpStatus.NOT_FOUND, 'INVOICE_NOT_FOUND');
      if (inv.status !== 'OPEN') throw apiError(HttpStatus.CONFLICT, 'INVOICE_NOT_OPEN');
      const updated = await tx.invoice.update({
        where: { id: inv.id },
        data: { status: 'VOID', voidedAt: new Date() },
        include: { plan: true, company: { select: { name: true } } },
      });
      await this.audit.log(
        {
          companyId: inv.companyId,
          actorUserId: actor.userId,
          action: 'platform.invoice.voided',
          entityType: 'invoice',
          entityId: inv.id,
          metadata: { number: inv.number },
          ipAddress: ip,
        },
        tx,
      );
      return updated;
    });
    return toInvoiceDto(result);
  }

  // ───────────────────────── Lifecycle ─────────────────────────

  /**
   * Moves subscriptions along by the clock. Safe to run repeatedly and from several API
   * instances at once: every change is a conditional update, and the database allows only one
   * open invoice per subscription.
   *
   * - Trial over → EXPIRED.
   * - ACTIVE, period ends within INVOICE_DUE_DAYS → renewal invoice, due at period end (also for
   *   plans retired for new sign-ups: existing subscribers keep renewing on their plan).
   * - ACTIVE, period over → CANCELED if cancellation was requested, else PAST_DUE.
   * - PAST_DUE for more than BILLING_GRACE_DAYS → EXPIRED.
   *
   * Payment alerts keep working in every state: a lapsed subscription only stops the merchant
   * from adding outlets, employees and connections.
   */
  async runLifecycle(now = new Date()): Promise<LifecycleResult> {
    const result: LifecycleResult = { trialsExpired: 0, renewalInvoicesIssued: 0, pastDue: 0, canceled: 0, expired: 0 };

    const trials = await this.prisma.subscription.updateMany({
      where: { status: 'TRIALING', OR: [{ trialEndsAt: { lte: now } }, { trialEndsAt: null, currentPeriodEnd: { lte: now } }] },
      data: { status: 'EXPIRED' },
    });
    result.trialsExpired = trials.count;

    const renewing = await this.prisma.subscription.findMany({
      where: {
        status: { in: ['ACTIVE', 'PAST_DUE'] },
        canceledAt: null,
        currentPeriodEnd: { lte: new Date(now.getTime() + INVOICE_DUE_DAYS * DAY) },
        invoices: { none: { status: 'OPEN' } },
      },
      include: { plan: true },
    });
    for (const sub of renewing) {
      try {
        await this.prisma.$transaction((tx) => this.issue(tx, sub, sub.plan, 'RENEWAL', sub.currentPeriodEnd > now ? sub.currentPeriodEnd : now));
        result.renewalInvoicesIssued++;
      } catch (e) {
        // Another instance issued it first (unique open invoice per subscription).
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
      }
    }

    const canceled = await this.prisma.subscription.updateMany({
      where: { status: 'ACTIVE', currentPeriodEnd: { lte: now }, canceledAt: { not: null } },
      data: { status: 'CANCELED' },
    });
    result.canceled = canceled.count;

    const pastDue = await this.prisma.subscription.updateMany({
      where: { status: 'ACTIVE', currentPeriodEnd: { lte: now } },
      data: { status: 'PAST_DUE' },
    });
    result.pastDue = pastDue.count;

    const expired = await this.prisma.subscription.updateMany({
      where: { status: 'PAST_DUE', currentPeriodEnd: { lte: new Date(now.getTime() - BILLING_GRACE_DAYS * DAY) } },
      data: { status: 'EXPIRED' },
    });
    result.expired = expired.count;

    if (Object.values(result).some((n) => n > 0)) this.logger.log(`Billing lifecycle: ${JSON.stringify(result)}`);
    return result;
  }

  private async issue(
    tx: Prisma.TransactionClient,
    sub: Subscription,
    plan: Plan,
    kind: InvoiceKind,
    dueAt: Date,
  ): Promise<InvoiceWithRefs> {
    const [{ n }] = await tx.$queryRaw<{ n: bigint }[]>`SELECT nextval('invoice_number_seq') AS n`;
    const number = `INV-${new Date().getUTCFullYear()}-${n.toString().padStart(6, '0')}`;
    return tx.invoice.create({
      data: {
        number,
        companyId: sub.companyId,
        subscriptionId: sub.id,
        planId: plan.id,
        kind,
        amountMinor: plan.priceMinor,
        currency: plan.currency,
        interval: plan.interval,
        dueAt,
      },
      include: { plan: true },
    });
  }
}
