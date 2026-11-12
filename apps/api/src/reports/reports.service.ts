import { HttpStatus, Injectable } from '@nestjs/common';
import {
  MAX_REPORT_DAYS,
  fromMinorUnits,
  type Currency,
  type ReportBreakdownRow,
  type ReportGranularity,
  type SalesReportDto,
} from '@onepay/shared';
import { Prisma } from '@prisma/client';
import { apiError } from '../common/api-error';
import type { TenantUser } from '../common/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { minorToNumber } from '../transactions/transaction.mapper';
import { BUSINESS_TIMEZONE, TransactionsService } from '../transactions/transactions.module';

const DAY = 86_400_000;
/** Bigger exports must be split by date range (keeps memory and response time bounded). */
export const MAX_EXPORT_ROWS = 100_000;
const EXPORT_BATCH = 2_000;

export interface ReportQuery {
  from?: string;
  to?: string;
  outletId?: string;
  includeSimulated?: boolean;
}

export function resolveReportRange(from?: string, to?: string): { from: Date; to: Date } {
  const end = to ? new Date(to) : new Date();
  const start = from ? new Date(from) : new Date(end.getTime() - 30 * DAY);
  if (start >= end) throw apiError(HttpStatus.BAD_REQUEST, 'DATE_RANGE_ORDER');
  if (end.getTime() - start.getTime() > MAX_REPORT_DAYS * DAY) {
    throw apiError(HttpStatus.BAD_REQUEST, 'DATE_RANGE_TOO_LONG', { days: MAX_REPORT_DAYS });
  }
  return { from: start, to: end };
}

/** Wall-clock time in Phnom Penh, "YYYY-MM-DD HH:mm:ss" (what accountants expect in a sheet). */
export function phnomPenhTime(d: Date): string {
  return new Date(d.getTime() + 7 * 3_600_000).toISOString().replace('T', ' ').slice(0, 19);
}

/** Neutralises spreadsheet formulas in text that came from outside (payer names, references). */
export function csvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  let s = String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const CSV_HEADER = [
  'occurred_at_phnom_penh',
  'status',
  'currency',
  'amount',
  'payer_name',
  'payer_account',
  'reference',
  'outlet',
  'bank_connection',
  'provider',
  'provider_txn_id',
  'demo',
];

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transactions: TransactionsService,
  ) {}

  /** Same outlet rules as the transaction list: restricted staff only see their outlets. */
  private outletSql(user: TenantUser, outletId?: string): Prisma.Sql {
    if (outletId !== undefined) {
      if (user.outletIds.length > 0 && !user.outletIds.includes(outletId)) return Prisma.sql`AND FALSE`;
      return Prisma.sql`AND t.outlet_id = ${outletId}::uuid`;
    }
    return user.outletIds.length > 0 ? Prisma.sql`AND t.outlet_id = ANY(${user.outletIds}::uuid[])` : Prisma.empty;
  }

  private where(user: TenantUser, q: ReportQuery, from: Date, to: Date): Prisma.Sql {
    return Prisma.sql`
      WHERE t.company_id = ${user.companyId}::uuid
        AND t.status = 'SUCCESS' AND t.direction = 'CREDIT'
        AND t.occurred_at >= ${from} AND t.occurred_at < ${to}
        ${this.outletSql(user, q.outletId)}
        ${q.includeSimulated === false ? Prisma.sql`AND t.is_simulated = FALSE` : Prisma.empty}`;
  }

  async sales(user: TenantUser, q: ReportQuery & { granularity?: ReportGranularity }): Promise<SalesReportDto> {
    const db = this.prisma.forTenant(user.companyId);
    const { from, to } = resolveReportRange(q.from, q.to);
    const granularity = q.granularity ?? 'day';
    const where = this.where(user, q, from, to);

    const [summary, series, byOutlet, byProvider] = await Promise.all([
      this.transactions.summary(user, {
        from: from.toISOString(),
        to: to.toISOString(),
        outletId: q.outletId,
        includeSimulated: q.includeSimulated,
      }),
      db.$queryRaw<{ period: string; currency: Currency; count: number; amount: bigint }[]>`
        SELECT to_char(date_trunc(${granularity}, t.occurred_at AT TIME ZONE ${BUSINESS_TIMEZONE})::date, 'YYYY-MM-DD') AS period,
               t.currency::text AS currency, COUNT(*)::int AS count, COALESCE(SUM(t.amount_minor), 0)::bigint AS amount
        FROM transactions t ${where}
        GROUP BY 1, 2 ORDER BY 1, 2`,
      db.$queryRaw<{ key: string; label: string; currency: Currency; count: number; amount: bigint }[]>`
        SELECT COALESCE(o.id::text, '') AS key, COALESCE(o.name, '') AS label,
               t.currency::text AS currency, COUNT(*)::int AS count, COALESCE(SUM(t.amount_minor), 0)::bigint AS amount
        FROM transactions t LEFT JOIN outlets o ON o.id = t.outlet_id ${where}
        GROUP BY 1, 2, 3 ORDER BY 5 DESC, 2`,
      db.$queryRaw<{ key: string; label: string; currency: Currency; count: number; amount: bigint }[]>`
        SELECT p.code AS key, p.name AS label,
               t.currency::text AS currency, COUNT(*)::int AS count, COALESCE(SUM(t.amount_minor), 0)::bigint AS amount
        FROM transactions t
          JOIN bank_connections bc ON bc.id = t.bank_connection_id
          JOIN payment_providers p ON p.id = bc.provider_id
        ${where}
        GROUP BY 1, 2, 3 ORDER BY 5 DESC, 2`,
    ]);

    const row = (r: { key: string; label: string; currency: Currency; count: number; amount: bigint }): ReportBreakdownRow => ({
      key: r.key,
      label: r.label,
      currency: r.currency,
      successCount: r.count,
      successAmountMinor: minorToNumber(r.amount),
    });
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      granularity,
      timezone: BUSINESS_TIMEZONE,
      includeSimulated: q.includeSimulated !== false,
      totals: summary.byCurrency,
      series: series.map((s) => ({
        period: s.period,
        currency: s.currency,
        successCount: s.count,
        successAmountMinor: minorToNumber(s.amount),
      })),
      byOutlet: byOutlet.map(row),
      byProvider: byProvider.map(row),
    };
  }

  /**
   * Every payment (any status) in the range as CSV lines, header first. Streams in batches so a
   * large export never sits in memory at once.
   */
  async *transactionsCsv(user: TenantUser, q: ReportQuery & { status?: string }): AsyncGenerator<string> {
    const db = this.prisma.forTenant(user.companyId);
    const { from, to } = resolveReportRange(q.from, q.to);
    const restricted = q.outletId !== undefined && user.outletIds.length > 0 && !user.outletIds.includes(q.outletId);
    const where: Prisma.TransactionWhereInput = {
      companyId: user.companyId,
      occurredAt: { gte: from, lt: to },
      ...(restricted
        ? { id: { in: [] } }
        : q.outletId
          ? { outletId: q.outletId }
          : user.outletIds.length > 0
            ? { outletId: { in: user.outletIds } }
            : {}),
      ...(q.status ? { status: q.status as Prisma.EnumTransactionStatusFilter['equals'] } : {}),
      ...(q.includeSimulated === false ? { isSimulated: false } : {}),
    };
    const total = await db.transaction.count({ where });
    if (total > MAX_EXPORT_ROWS) throw apiError(HttpStatus.BAD_REQUEST, 'REPORT_TOO_LARGE', { max: MAX_EXPORT_ROWS });

    // UTF-8 BOM so Excel shows Khmer and Chinese names correctly.
    yield `﻿${CSV_HEADER.join(',')}\r\n`;
    let cursor: string | undefined;
    for (;;) {
      const batch = await db.transaction.findMany({
        where,
        include: {
          outlet: { select: { name: true } },
          bankConnection: { select: { displayName: true, provider: { select: { code: true } } } },
        },
        orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
        take: EXPORT_BATCH,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });
      if (batch.length === 0) return;
      yield batch
        .map((t) =>
          [
            phnomPenhTime(t.occurredAt),
            t.status,
            t.currency,
            fromMinorUnits(t.amountMinor, t.currency),
            t.payerName,
            t.payerAccountMasked,
            t.reference,
            t.outlet?.name ?? '',
            t.bankConnection.displayName,
            t.bankConnection.provider.code,
            t.providerTxnId,
            t.isSimulated,
          ]
            .map(csvCell)
            .join(','),
        )
        .join('\r\n')
        .concat('\r\n');
      if (batch.length < EXPORT_BATCH) return;
      cursor = batch[batch.length - 1]?.id;
    }
  }
}
