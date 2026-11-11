import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  type RawBodyRequest,
} from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  Permission,
  type BankConnectionDto,
  type BankConnectionWithSecretDto,
  type Paginated,
  type PaymentProviderDto,
} from '@onepay/shared';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';
import type { Request } from 'express';
import { AuditService } from '../audit/audit.service';
import type { AuthUser, TenantUser } from '../common/auth-user';
import { ClientIp, CurrentTenant, CurrentUser, Public, RequirePermissions } from '../common/decorators';
import { PaginationQueryDto } from '../common/pagination.dto';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBankConnectionDto, SimulatePaymentDto, UpdateBankConnectionDto } from './bank-connections.dto';
import { BankConnectionsService, toProviderDto } from './bank-connections.service';
import { IngestionService } from './ingestion.service';
import { IngestionWorker } from './ingestion.worker';

@ApiTags('Payment providers')
@ApiBearerAuth()
@Controller('payment-providers')
export class PaymentProvidersController {
  constructor(private readonly connections: BankConnectionsService) {}

  @Get()
  @ApiOperation({ summary: 'Supported banks, wallets and gateways (and whether integration is live)' })
  list(): Promise<PaymentProviderDto[]> {
    return this.connections.listProviders();
  }
}

export class UpdateProviderDto {
  @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString() @MaxLength(120)
  name?: string;

  @ApiPropertyOptional() @IsOptional() @IsUrl({ protocols: ['https'], require_protocol: true }) @MaxLength(500)
  logoUrl?: string;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  isActive?: boolean;
}

@ApiTags('Platform (CAM Super Admin)')
@ApiBearerAuth()
@Controller('platform/payment-providers')
export class PlatformProvidersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions(Permission.PLATFORM_COMPANIES_READ)
  async list(): Promise<(PaymentProviderDto & { isActive: boolean; connectionCount: number })[]> {
    const rows = await this.prisma.paymentProvider.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { connections: true } } },
    });
    return rows.map((p) => ({ ...toProviderDto(p), isActive: p.isActive, connectionCount: p._count.connections }));
  }

  @Patch(':id')
  @RequirePermissions(Permission.PLATFORM_PROVIDERS_MANAGE)
  @ApiOperation({ summary: 'Rename, set logo, or enable/disable a provider' })
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProviderDto,
    @ClientIp() ip: string | null,
  ): Promise<PaymentProviderDto> {
    const existing = await this.prisma.paymentProvider.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Provider not found');
    const updated = await this.prisma.paymentProvider.update({ where: { id }, data: dto });
    await this.audit.log({
      companyId: null,
      actorUserId: user.userId,
      action: 'platform.provider.updated',
      entityType: 'payment_provider',
      entityId: id,
      metadata: { fields: Object.keys(dto) },
      ipAddress: ip,
    });
    return toProviderDto(updated);
  }
}

@ApiTags('Bank connections')
@ApiBearerAuth()
@Controller('bank-connections')
export class BankConnectionsController {
  constructor(private readonly connections: BankConnectionsService) {}

  @Get()
  @RequirePermissions(Permission.BANK_CONNECTION_READ)
  list(@CurrentTenant() user: TenantUser, @Query() q: PaginationQueryDto): Promise<Paginated<BankConnectionDto>> {
    return this.connections.list(user, q);
  }

  @Get(':id')
  @RequirePermissions(Permission.BANK_CONNECTION_READ)
  get(@CurrentTenant() user: TenantUser, @Param('id', ParseUUIDPipe) id: string): Promise<BankConnectionDto> {
    return this.connections.get(user, id);
  }

  @Post()
  @RequirePermissions(Permission.BANK_CONNECTION_MANAGE)
  @ApiOperation({ summary: 'Connect a bank/gateway account. The webhook secret is returned only once.' })
  create(
    @CurrentTenant() user: TenantUser,
    @Body() dto: CreateBankConnectionDto,
    @ClientIp() ip: string | null,
  ): Promise<BankConnectionWithSecretDto> {
    return this.connections.create(user, dto, ip);
  }

  @Patch(':id')
  @RequirePermissions(Permission.BANK_CONNECTION_MANAGE)
  update(
    @CurrentTenant() user: TenantUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBankConnectionDto,
    @ClientIp() ip: string | null,
  ): Promise<BankConnectionDto> {
    return this.connections.update(user, id, dto, ip);
  }

  @Post(':id/rotate-webhook-secret')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.BANK_CONNECTION_MANAGE)
  @ApiOperation({ summary: 'Issue a new webhook signing secret (old one stops working immediately)' })
  rotate(
    @CurrentTenant() user: TenantUser,
    @Param('id', ParseUUIDPipe) id: string,
    @ClientIp() ip: string | null,
  ): Promise<BankConnectionWithSecretDto> {
    return this.connections.rotateWebhookSecret(user, id, ip);
  }

  @Delete(':id')
  @RequirePermissions(Permission.BANK_CONNECTION_MANAGE)
  @ApiOperation({ summary: 'Disconnect: stop ingestion and destroy stored secrets (history is kept)' })
  disconnect(
    @CurrentTenant() user: TenantUser,
    @Param('id', ParseUUIDPipe) id: string,
    @ClientIp() ip: string | null,
  ): Promise<BankConnectionDto> {
    return this.connections.disconnect(user, id, ip);
  }

  @Post(':id/simulate-payment')
  @HttpCode(HttpStatus.ACCEPTED)
  @RequirePermissions(Permission.BANK_CONNECTION_MANAGE)
  @ApiOperation({ summary: 'DEMO ONLY: inject a simulated payment (disabled in production)' })
  simulate(
    @CurrentTenant() user: TenantUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SimulatePaymentDto,
  ) {
    return this.connections.simulatePayment(user, id, dto);
  }
}

@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly ingestion: IngestionService) {}

  @Public()
  @Throttle({ default: { limit: 1200, ttl: 60_000 } })
  @Post(':connectionId')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Inbound payment events (ONEPAY_WEBHOOK_V1, HMAC-SHA256 signed)',
    description:
      'Headers: X-OnePay-Timestamp (unix seconds), X-OnePay-Signature: v1=hex(HMAC_SHA256(secret, "<timestamp>.<raw body>")). ' +
      'Returns 202 once the event is durably stored; duplicates return 202 with duplicate=true.',
  })
  async receive(
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Req() req: RawBodyRequest<Request>,
  ): Promise<{ status: 'accepted'; webhookEventId: string; duplicate: boolean }> {
    const result = await this.ingestion.receiveWebhook(connectionId, headers, req.rawBody);
    return { status: 'accepted', ...result };
  }

  /** Lets integrators verify reachability without a signature. */
  @Public()
  @Get('ping')
  @ApiExcludeEndpoint()
  ping() {
    return { ok: true };
  }
}

@Module({
  imports: [NotificationsModule],
  controllers: [PaymentProvidersController, PlatformProvidersController, BankConnectionsController, WebhooksController],
  providers: [BankConnectionsService, IngestionService, IngestionWorker],
  exports: [IngestionWorker],
})
export class PaymentsModule {}
