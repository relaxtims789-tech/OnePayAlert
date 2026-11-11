import { Body, Controller, Get, Module, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permission, type EmployeeDto, type Paginated } from '@onepay/shared';
import type { TenantUser } from '../common/auth-user';
import { ClientIp, CurrentTenant, RequirePermissions } from '../common/decorators';
import { PaginationQueryDto } from '../common/pagination.dto';
import { CreateEmployeeDto, UpdateEmployeeDto } from './employees.dto';
import { EmployeesService } from './employees.service';

@ApiTags('Employees')
@ApiBearerAuth()
@Controller('employees')
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Get()
  @RequirePermissions(Permission.EMPLOYEE_READ)
  @ApiOperation({ summary: 'List employees of the active company' })
  list(@CurrentTenant() user: TenantUser, @Query() q: PaginationQueryDto): Promise<Paginated<EmployeeDto>> {
    return this.employees.list(user, q);
  }

  @Get(':membershipId')
  @RequirePermissions(Permission.EMPLOYEE_READ)
  get(
    @CurrentTenant() user: TenantUser,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
  ): Promise<EmployeeDto> {
    return this.employees.get(user, membershipId);
  }

  @Post()
  @RequirePermissions(Permission.EMPLOYEE_MANAGE)
  @ApiOperation({ summary: 'Add an employee (creates the user account if needed)' })
  create(
    @CurrentTenant() user: TenantUser,
    @Body() dto: CreateEmployeeDto,
    @ClientIp() ip: string | null,
  ): Promise<EmployeeDto> {
    return this.employees.create(user, dto, ip);
  }

  @Patch(':membershipId')
  @RequirePermissions(Permission.EMPLOYEE_MANAGE)
  @ApiOperation({ summary: 'Change role, outlet access, or deactivate an employee' })
  update(
    @CurrentTenant() user: TenantUser,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Body() dto: UpdateEmployeeDto,
    @ClientIp() ip: string | null,
  ): Promise<EmployeeDto> {
    return this.employees.update(user, membershipId, dto, ip);
  }
}

@Module({
  controllers: [EmployeesController],
  providers: [EmployeesService],
})
export class EmployeesModule {}
