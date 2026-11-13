import { BakongModule } from '../khqr/bakong.module';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Module,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  Permission,
  type CompanyDto,
  type Paginated,
  type PlanDto,
  type PlatformAuditDto,
  type PlatformCompanyDetailDto,
  type PlatformCompanyDto,
  type PlatformHealthDto,
  type PlatformOverviewDto,
  type SubscriptionDto,
} from '@onepay/shared';
import type { AuthUser } from '../common/auth-user';
import { ClientIp, CurrentUser, RequirePermissions } from '../common/decorators';
import { PlatformCompaniesService } from './platform-companies.service';
import { PlatformOpsService } from './platform-ops.service';
import {
  CompanyStatusDto,
  CreatePlanDto,
  ListCompaniesQueryDto,
  PlatformAuditQueryDto,
  UpdatePlanDto,
  UpdateSubscriptionDto,
} from './platform.dto';

export { CompanyStatusDto } from './platform.dto';

/**
 * Mysoftkh (platform) API. Reachable only with a platform role:
 * SUPPORT can read, SUPER_ADMIN can also change merchants, plans and providers.
 */
@ApiTags('Platform (MysoftKH Super Admin)')
@ApiBearerAuth()
@Controller('platform')
export class PlatformController {
  constructor(
    private readonly companies: PlatformCompaniesService,
    private readonly ops: PlatformOpsService,
  ) {}

  @Get('overview')
  @RequirePermissions(Permission.PLATFORM_COMPANIES_READ)
  @ApiOperation({ summary: 'Platform KPIs: merchants, subscriptions, payments today, pipeline health' })
  overview(): Promise<PlatformOverviewDto> {
    return this.ops.overview();
  }

  @Get('companies')
  @RequirePermissions(Permission.PLATFORM_COMPANIES_READ)
  @ApiOperation({ summary: 'List merchant companies (search by name, email, phone, owner email)' })
  list(@Query() q: ListCompaniesQueryDto): Promise<Paginated<PlatformCompanyDto>> {
    return this.companies.list(q);
  }

  @Get('companies/:id')
  @RequirePermissions(Permission.PLATFORM_COMPANIES_READ)
  @ApiOperation({ summary: 'Merchant detail: members, outlets, connections (no secrets), subscription, 30-day volume' })
  detail(@Param('id', ParseUUIDPipe) id: string): Promise<PlatformCompanyDetailDto> {
    return this.companies.detail(id);
  }

  @Patch('companies/:id/status')
  @RequirePermissions(Permission.PLATFORM_COMPANIES_MANAGE)
  @ApiOperation({ summary: 'Approve/activate, suspend or close a merchant company' })
  setStatus(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompanyStatusDto,
    @ClientIp() ip: string | null,
  ): Promise<CompanyDto> {
    return this.companies.setStatus(user, id, dto, ip);
  }

  @Patch('companies/:id/subscription')
  @RequirePermissions(Permission.PLATFORM_COMPANIES_MANAGE)
  @ApiOperation({ summary: 'Change plan, status, billing period or trial end of a merchant subscription' })
  updateSubscription(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSubscriptionDto,
    @ClientIp() ip: string | null,
  ): Promise<SubscriptionDto> {
    return this.companies.updateSubscription(user, id, dto, ip);
  }

  @Get('plans')
  @RequirePermissions(Permission.PLATFORM_COMPANIES_READ)
  listPlans(): Promise<PlanDto[]> {
    return this.ops.listPlans();
  }

  @Post('plans')
  @RequirePermissions(Permission.PLATFORM_PLANS_MANAGE)
  @ApiOperation({ summary: 'Create a subscription plan (price in integer minor units)' })
  createPlan(@CurrentUser() user: AuthUser, @Body() dto: CreatePlanDto, @ClientIp() ip: string | null): Promise<PlanDto> {
    return this.ops.createPlan(user, dto, ip);
  }

  @Patch('plans/:id')
  @RequirePermissions(Permission.PLATFORM_PLANS_MANAGE)
  updatePlan(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePlanDto,
    @ClientIp() ip: string | null,
  ): Promise<PlanDto> {
    return this.ops.updatePlan(user, id, dto, ip);
  }

  @Get('audit-logs')
  @RequirePermissions(Permission.PLATFORM_AUDIT_READ)
  @ApiOperation({ summary: 'Platform-wide audit trail (filter by company or action prefix)' })
  audit(@Query() q: PlatformAuditQueryDto): Promise<Paginated<PlatformAuditDto>> {
    return this.ops.auditLogs(q);
  }

  @Get('health')
  @RequirePermissions(Permission.PLATFORM_COMPANIES_READ)
  @ApiOperation({ summary: 'Infrastructure status and payment-ingestion backlog/failures' })
  health(): Promise<PlatformHealthDto> {
    return this.ops.health();
  }

  @Post('webhook-events/:id/retry')
  @HttpCode(HttpStatus.ACCEPTED)
  @RequirePermissions(Permission.PLATFORM_COMPANIES_MANAGE)
  @ApiOperation({ summary: 'Re-queue a FAILED inbound payment event' })
  retry(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @ClientIp() ip: string | null) {
    return this.ops.retryWebhookEvent(user, id, ip);
  }
}

@Module({
  imports: [BakongModule],
  controllers: [PlatformController],
  providers: [PlatformCompaniesService, PlatformOpsService],
})
export class PlatformModule {}
