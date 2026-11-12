import {
  Body,
  Controller,
  Get,
  HttpCode,
  Injectable,
  Logger,
  Module,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Permission, type BillingOverviewDto, type InvoiceDto, type Paginated } from '@onepay/shared';
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import type { AuthUser, TenantUser } from '../common/auth-user';
import { ClientIp, CurrentTenant, CurrentUser, RequirePermissions } from '../common/decorators';
import { PaginationQueryDto } from '../common/pagination.dto';
import { AppConfig } from '../config/app-config.service';
import { BillingService, type LifecycleResult } from './billing.service';
import { EntitlementsService } from './entitlements.service';

export class CheckoutDto {
  @ApiProperty({ description: 'Plan to subscribe or switch to' })
  @IsUUID()
  planId!: string;
}

export class MarkPaidDto {
  @ApiProperty({ enum: ['BANK_TRANSFER', 'CASH', 'OTHER'] })
  @IsEnum(['BANK_TRANSFER', 'CASH', 'OTHER'])
  paymentMethod!: 'BANK_TRANSFER' | 'CASH' | 'OTHER';

  @ApiPropertyOptional({ description: 'Bank transfer reference or receipt number' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  paymentReference?: string;

  @ApiPropertyOptional({ description: 'When the money arrived (ISO date-time). Default: now' })
  @IsOptional()
  @IsDateString()
  paidAt?: string;
}

export class ListInvoicesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['OPEN', 'PAID', 'VOID'] })
  @IsOptional()
  @IsEnum(['OPEN', 'PAID', 'VOID'])
  status?: 'OPEN' | 'PAID' | 'VOID';

  @ApiPropertyOptional() @IsOptional() @IsUUID()
  companyId?: string;
}

@ApiTags('Billing')
@ApiBearerAuth()
@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get()
  @RequirePermissions(Permission.SUBSCRIPTION_READ)
  @ApiOperation({ summary: 'Current plan, usage against plan limits, open invoice and available plans' })
  overview(@CurrentTenant() user: TenantUser): Promise<BillingOverviewDto> {
    return this.billing.overview(user);
  }

  @Get('invoices')
  @RequirePermissions(Permission.SUBSCRIPTION_READ)
  @ApiOperation({ summary: "The company's invoices, newest first" })
  invoices(@CurrentTenant() user: TenantUser, @Query() q: PaginationQueryDto): Promise<Paginated<InvoiceDto>> {
    return this.billing.listInvoices({ companyId: user.companyId }, q.page, q.pageSize);
  }

  @Post('checkout')
  @HttpCode(200)
  @RequirePermissions(Permission.SUBSCRIPTION_MANAGE)
  @ApiOperation({ summary: 'Choose a plan: returns the invoice to pay. The plan starts once MysoftKH confirms payment.' })
  checkout(@CurrentTenant() user: TenantUser, @Body() dto: CheckoutDto, @ClientIp() ip: string | null): Promise<InvoiceDto> {
    return this.billing.checkout(user, dto.planId, ip);
  }
}

@ApiTags('Platform (MysoftKH Super Admin)')
@ApiBearerAuth()
@Controller('platform')
export class PlatformBillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('invoices')
  @RequirePermissions(Permission.PLATFORM_COMPANIES_READ)
  @ApiOperation({ summary: 'All merchant invoices (filter by status or company)' })
  list(@Query() q: ListInvoicesQueryDto): Promise<Paginated<InvoiceDto>> {
    return this.billing.listInvoices({ companyId: q.companyId, status: q.status }, q.page, q.pageSize, true);
  }

  @Post('invoices/:id/mark-paid')
  @HttpCode(200)
  @RequirePermissions(Permission.PLATFORM_COMPANIES_MANAGE)
  @ApiOperation({ summary: 'Confirm money received for an invoice; starts the paid period' })
  markPaid(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MarkPaidDto,
    @ClientIp() ip: string | null,
  ): Promise<InvoiceDto> {
    return this.billing.markPaid(actor, id, dto, ip);
  }

  @Post('invoices/:id/void')
  @HttpCode(200)
  @RequirePermissions(Permission.PLATFORM_COMPANIES_MANAGE)
  @ApiOperation({ summary: 'Cancel an unpaid invoice' })
  void(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @ClientIp() ip: string | null): Promise<InvoiceDto> {
    return this.billing.voidInvoice(actor, id, ip);
  }

  @Post('billing/run-lifecycle')
  @HttpCode(200)
  @RequirePermissions(Permission.PLATFORM_COMPANIES_MANAGE)
  @ApiOperation({ summary: 'Run the trial/renewal/grace-period checks now (they also run on a timer)' })
  runLifecycle(): Promise<LifecycleResult> {
    return this.billing.runLifecycle();
  }
}

/** Runs the lifecycle checks on a timer. Overlapping runs across instances are harmless. */
@Injectable()
export class BillingScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(BillingScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly billing: BillingService,
    private readonly config: AppConfig,
  ) {}

  onApplicationBootstrap(): void {
    const seconds = this.config.get('BILLING_JOB_INTERVAL_SECONDS');
    if (seconds <= 0) return;
    this.timer = setInterval(() => void this.tick(), seconds * 1000);
    this.timer.unref();
    void this.tick();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.billing.runLifecycle();
    } catch (e) {
      this.logger.error('Billing lifecycle run failed', e instanceof Error ? e.stack : String(e));
    } finally {
      this.running = false;
    }
  }
}

@Module({
  controllers: [BillingController, PlatformBillingController],
  providers: [BillingService, EntitlementsService, BillingScheduler],
  exports: [EntitlementsService, BillingService],
})
export class BillingModule {}
