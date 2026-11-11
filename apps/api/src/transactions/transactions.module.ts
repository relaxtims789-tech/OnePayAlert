import {
  BadRequestException,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import {
  Permission,
  type CurrencySummary,
  type Paginated,
  type TransactionDto,
  type TransactionSummaryDto,
} from '@onepay/shared';
import { Prisma } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import type { TenantUser } from '../common/auth-user';
import { CurrentTenant, RequirePermissions } from '../common/decorators';
import { PaginationQueryDto } from '../common/pagination.dto';
import { PrismaService } from '../prisma/prisma.service';
import { minorToNumber, toTransactionDto, transactionInclude } from './transaction.mapper';

const toBool = ({ value }: { value: unknown }) => (value === 'true' ? true : value === 'false' ? false : value);
const MAX_RANGE_DAYS = 366;
export const BUSINESS_TIMEZONE = 'Asia/Phnom_Penh';

export class ListTransactionsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'ISO date-time, inclusive' }) @IsOptional() @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'ISO date-time, exclusive' }) @IsOptional() @IsDateString()
  to?: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID()
  outletId?: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID()
  bankConnectionId?: string;

  @ApiPropertyOptional({ enum: ['PENDING', 'SUCCESS', 'FAILED', 'REVERSED'] })
  @IsOptional()
  @IsEnum(['PENDING', 'SUCCESS', 'FAILED', 'REVERSED'])
  status?: 'PENDING' | 'SUCCESS' | 'FAILED' | 'REVERSED';

  @ApiPropertyOptional({ enum: ['USD', 'KHR'] }) @IsOptional() @IsEnum(['USD', 'KHR'])
  currency?: 'USD' | 'KHR';

  @ApiPropertyOptional({ description: 'Include demo-simulator transactions (default true)' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  includeSimulated?: boolean;
}

export class SummaryQueryDto {
  @ApiPropertyOptional({ description: 'ISO date-time, inclusive. Default: 7 days ago' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'ISO date-time, exclusive. Default: now' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID()
  outletId?: string;

  @ApiPropertyOptional() @IsOptional() @Transform(toBool) @IsBoolean()
  includeSimulated?: boolean;
}

function resolveRange(from?: string, to?: string): { from: Date; to: Date } {
  const end = to ? new Date(to) : new Date();
  const start = from ? new Date(from) : new Date(end.getTime() - 7 * 86_400_000);
  if (start >= end) throw new BadRequestException('`from` must be before `to`');
  if (end.getTime() - start.getTime() > MAX_RANGE_DAYS * 86_400_000) {
    throw new BadRequestException(`Date range cannot exceed ${MAX_RANGE_DAYS} days`);
  }
  return { from: start, to: end };
}

@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Tenant scope + outlet restriction: restricted members never see other outlets' money. */
  private scope(user: TenantUser, outletId?: string): Prisma.TransactionWhereInput {
    if (outletId && user.outletIds.length > 0 && !user.outletIds.includes(outletId)) {
      return { companyId: user.companyId, id: { in: [] } };
    }
    return {
      companyId: user.companyId,
      ...(outletId ? { outletId } : user.outletIds.length > 0 ? { outletId: { in: user.outletIds } } : {}),
    };
  }

  async list(user: TenantUser, q: ListTransactionsQueryDto): Promise<Paginated<TransactionDto>> {
    const where: Prisma.TransactionWhereInput = {
      ...this.scope(user, q.outletId),
      ...(q.bankConnectionId ? { bankConnectionId: q.bankConnectionId } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.currency ? { currency: q.currency } : {}),
      ...(q.includeSimulated === false ? { isSimulated: false } : {}),
      ...(q.from || q.to
        ? { occurredAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lt: new Date(q.to) } : {}) } }
        : {}),
      ...(q.search
        ? {
            OR: [
              { payerName: { contains: q.search, mode: 'insensitive' } },
              { reference: { contains: q.search, mode: 'insensitive' } },
              { providerTxnId: { contains: q.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.transaction.findMany({
        where,
        include: transactionInclude,
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.transaction.count({ where }),
    ]);
    return { items: items.map(toTransactionDto), total, page: q.page, pageSize: q.pageSize };
  }

  async get(user: TenantUser, id: string): Promise<TransactionDto> {
    const t = await this.prisma.transaction.findFirst({
      where: { id, ...this.scope(user) },
      include: transactionInclude,
    });
    if (!t) throw new NotFoundException('Transaction not found');
    return toTransactionDto(t);
  }

  async summary(user: TenantUser, q: SummaryQueryDto): Promise<TransactionSummaryDto> {
    const { from, to } = resolveRange(q.from, q.to);
    const where: Prisma.TransactionWhereInput = {
      ...this.scope(user, q.outletId),
      direction: 'CREDIT',
      occurredAt: { gte: from, lt: to },
      ...(q.includeSimulated === false ? { isSimulated: false } : {}),
    };
    const groups = await this.prisma.transaction.groupBy({
      by: ['currency', 'status'],
      where,
      _count: { _all: true },
      _sum: { amountMinor: true },
    });

    const byCurrency = new Map<string, CurrencySummary>();
    for (const g of groups) {
      const s =
        byCurrency.get(g.currency) ??
        ({
          currency: g.currency,
          successCount: 0,
          successAmountMinor: 0,
          pendingCount: 0,
          failedCount: 0,
          reversedCount: 0,
          reversedAmountMinor: 0,
        } satisfies CurrencySummary);
      const count = g._count._all;
      const sum = minorToNumber(g._sum.amountMinor);
      if (g.status === 'SUCCESS') {
        s.successCount += count;
        s.successAmountMinor += sum;
      } else if (g.status === 'PENDING') s.pendingCount += count;
      else if (g.status === 'FAILED') s.failedCount += count;
      else {
        s.reversedCount += count;
        s.reversedAmountMinor += sum;
      }
      byCurrency.set(g.currency, s);
    }

    const outletFilter =
      q.outletId !== undefined
        ? user.outletIds.length > 0 && !user.outletIds.includes(q.outletId)
          ? Prisma.sql`AND FALSE`
          : Prisma.sql`AND outlet_id = ${q.outletId}::uuid`
        : user.outletIds.length > 0
          ? Prisma.sql`AND outlet_id = ANY(${user.outletIds}::uuid[])`
          : Prisma.empty;
    const simulatedFilter = q.includeSimulated === false ? Prisma.sql`AND is_simulated = FALSE` : Prisma.empty;
    const daily = await this.prisma.$queryRaw<
      { date: string; currency: 'USD' | 'KHR'; count: number; amount: bigint }[]
    >`
      SELECT to_char((occurred_at AT TIME ZONE ${BUSINESS_TIMEZONE})::date, 'YYYY-MM-DD') AS date,
             currency::text AS currency,
             COUNT(*)::int AS count,
             COALESCE(SUM(amount_minor), 0)::bigint AS amount
      FROM transactions
      WHERE company_id = ${user.companyId}::uuid
        AND status = 'SUCCESS' AND direction = 'CREDIT'
        AND occurred_at >= ${from} AND occurred_at < ${to}
        ${outletFilter} ${simulatedFilter}
      GROUP BY 1, 2
      ORDER BY 1, 2`;

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      byCurrency: [...byCurrency.values()].sort((a, b) => a.currency.localeCompare(b.currency)),
      daily: daily.map((d) => ({
        date: d.date,
        currency: d.currency,
        successCount: d.count,
        successAmountMinor: minorToNumber(d.amount),
      })),
    };
  }
}

@ApiTags('Transactions')
@ApiBearerAuth()
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

  @Get()
  @RequirePermissions(Permission.TRANSACTION_READ)
  @ApiOperation({ summary: 'List payments (newest first) with filters' })
  list(@CurrentTenant() user: TenantUser, @Query() q: ListTransactionsQueryDto): Promise<Paginated<TransactionDto>> {
    return this.transactions.list(user, q);
  }

  @Get('summary')
  @RequirePermissions(Permission.TRANSACTION_READ)
  @ApiOperation({ summary: 'Totals per currency/status and daily totals (Asia/Phnom_Penh days)' })
  summary(@CurrentTenant() user: TenantUser, @Query() q: SummaryQueryDto): Promise<TransactionSummaryDto> {
    return this.transactions.summary(user, q);
  }

  @Get(':id')
  @RequirePermissions(Permission.TRANSACTION_READ)
  get(@CurrentTenant() user: TenantUser, @Param('id', ParseUUIDPipe) id: string): Promise<TransactionDto> {
    return this.transactions.get(user, id);
  }
}

@Module({
  controllers: [TransactionsController],
  providers: [TransactionsService],
})
export class TransactionsModule {}
