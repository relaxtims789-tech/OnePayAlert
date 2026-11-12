import { Body, Controller, Get, Module, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permission, type OutletDto, type Paginated } from '@onepay/shared';
import type { TenantUser } from '../common/auth-user';
import { ClientIp, CurrentTenant, RequirePermissions } from '../common/decorators';
import { CreateOutletDto, ListOutletsQueryDto, UpdateOutletDto } from './outlets.dto';
import { BillingModule } from '../billing/billing.module';
import { OutletsService } from './outlets.service';

@ApiTags('Outlets')
@ApiBearerAuth()
@Controller('outlets')
export class OutletsController {
  constructor(private readonly outlets: OutletsService) {}

  @Get()
  @RequirePermissions(Permission.OUTLET_READ)
  @ApiOperation({ summary: 'List outlets of the active company' })
  list(@CurrentTenant() user: TenantUser, @Query() q: ListOutletsQueryDto): Promise<Paginated<OutletDto>> {
    return this.outlets.list(user, q);
  }

  @Get(':id')
  @RequirePermissions(Permission.OUTLET_READ)
  get(@CurrentTenant() user: TenantUser, @Param('id', ParseUUIDPipe) id: string): Promise<OutletDto> {
    return this.outlets.get(user, id);
  }

  @Post()
  @RequirePermissions(Permission.OUTLET_MANAGE)
  @ApiOperation({ summary: 'Create an outlet' })
  create(
    @CurrentTenant() user: TenantUser,
    @Body() dto: CreateOutletDto,
    @ClientIp() ip: string | null,
  ): Promise<OutletDto> {
    return this.outlets.create(user, dto, ip);
  }

  @Patch(':id')
  @RequirePermissions(Permission.OUTLET_MANAGE)
  @ApiOperation({ summary: 'Update or (de)activate an outlet' })
  update(
    @CurrentTenant() user: TenantUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOutletDto,
    @ClientIp() ip: string | null,
  ): Promise<OutletDto> {
    return this.outlets.update(user, id, dto, ip);
  }
}

@Module({
  imports: [BillingModule],
  controllers: [OutletsController],
  providers: [OutletsService],
  exports: [OutletsService],
})
export class OutletsModule {}
