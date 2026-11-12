import { Controller, Get, Logger, Module, Query, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Permission, type SalesReportDto } from '@onepay/shared';
import { Transform } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import type { Request, Response } from 'express';
import { pickLocale } from '../common/api-exception.filter';
import type { TenantUser } from '../common/auth-user';
import { CurrentTenant, RequirePermissions } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsModule } from '../transactions/transactions.module';
import { ReportsService } from './reports.service';
import { renderSalesPdf } from './sales-pdf';

const toBool = ({ value }: { value: unknown }) => (value === 'true' ? true : value === 'false' ? false : value);

export class ReportQueryDto {
  @ApiPropertyOptional({ description: 'ISO date-time, inclusive. Default: 30 days before `to`' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'ISO date-time, exclusive. Default: now. At most 366 days after `from`' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional() @IsOptional() @IsUUID()
  outletId?: string;

  @ApiPropertyOptional({ description: 'Include demo (simulated) payments. Default: true' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  includeSimulated?: boolean;
}

export class SalesReportQueryDto extends ReportQueryDto {
  @ApiPropertyOptional({ enum: ['day', 'week', 'month'], description: 'Default: day' })
  @IsOptional()
  @IsEnum(['day', 'week', 'month'])
  granularity?: 'day' | 'week' | 'month';
}

export class CsvQueryDto extends ReportQueryDto {
  @ApiPropertyOptional({ enum: ['SUCCESS', 'PENDING', 'FAILED', 'REVERSED'] })
  @IsOptional()
  @IsEnum(['SUCCESS', 'PENDING', 'FAILED', 'REVERSED'])
  status?: 'SUCCESS' | 'PENDING' | 'FAILED' | 'REVERSED';
}

const fileDate = (iso: string) => new Date(new Date(iso).getTime() + 7 * 3_600_000).toISOString().slice(0, 10);

@ApiTags('Reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  private readonly logger = new Logger(ReportsController.name);

  constructor(
    private readonly reports: ReportsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('sales')
  @RequirePermissions(Permission.REPORT_READ)
  @ApiOperation({ summary: 'Received money per day/week/month (Phnom Penh time), with totals, outlets and providers' })
  sales(@CurrentTenant() user: TenantUser, @Query() q: SalesReportQueryDto): Promise<SalesReportDto> {
    return this.reports.sales(user, q);
  }

  @Get('sales.pdf')
  @RequirePermissions(Permission.REPORT_READ)
  @ApiProduces('application/pdf')
  @ApiOperation({ summary: 'The sales report as a PDF, labelled in the Accept-Language language (km/en/zh)' })
  async salesPdf(
    @CurrentTenant() user: TenantUser,
    @Query() q: SalesReportQueryDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const report = await this.reports.sales(user, q);
    const [company, outlet] = await Promise.all([
      this.prisma.company.findUniqueOrThrow({ where: { id: user.companyId }, select: { name: true } }),
      q.outletId ? this.prisma.outlet.findFirst({ where: { id: q.outletId, companyId: user.companyId }, select: { name: true } }) : null,
    ]);
    const pdf = await renderSalesPdf({
      report,
      locale: pickLocale(req.headers['accept-language']),
      companyName: company.name,
      outletName: outlet?.name ?? null,
      generatedAt: new Date(),
      onTextFallback: (text, e) =>
        this.logger.warn(`PDF: drew "${text}" without Khmer marks (${e instanceof Error ? e.message : String(e)})`),
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="sales-report_${fileDate(report.from)}_${fileDate(new Date(new Date(report.to).getTime() - 1).toISOString())}.pdf"`,
    );
    res.setHeader('Cache-Control', 'no-store');
    res.end(pdf);
  }

  @Get('transactions.csv')
  @RequirePermissions(Permission.REPORT_READ)
  @ApiProduces('text/csv')
  @ApiOperation({ summary: 'Every payment in the range as CSV (UTF-8, Phnom Penh times). Up to 100,000 rows' })
  async transactionsCsv(@CurrentTenant() user: TenantUser, @Query() q: CsvQueryDto, @Res() res: Response): Promise<void> {
    const rows = this.reports.transactionsCsv(user, q);
    // Pull the first chunk before sending headers so validation errors still return clean JSON.
    const first = await rows.next();
    const from = q.from ?? new Date(Date.now() - 30 * 86_400_000).toISOString();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="payments_${fileDate(from)}.csv"`);
    res.setHeader('Cache-Control', 'no-store');
    try {
      if (!first.done) res.write(first.value);
      for await (const chunk of rows) {
        if (!res.write(chunk)) await new Promise((r) => res.once('drain', r));
      }
      res.end();
    } catch (e) {
      // Headers are gone; cut the download rather than hand over a silently truncated file.
      res.destroy(e instanceof Error ? e : new Error(String(e)));
    }
  }
}

@Module({
  imports: [TransactionsModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
