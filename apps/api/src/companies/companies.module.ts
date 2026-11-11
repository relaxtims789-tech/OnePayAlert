import { Body, Controller, Get, Injectable, Module, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Permission, type CompanyDto } from '@onepay/shared';
import type { Company } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { AuditService } from '../audit/audit.service';
import type { TenantUser } from '../common/auth-user';
import { ClientIp, CurrentTenant, RequirePermissions } from '../common/decorators';
import { PaginationQueryDto } from '../common/pagination.dto';
import { PrismaService } from '../prisma/prisma.service';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class UpdateCompanyDto {
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MinLength(2) @MaxLength(160)
  name?: string;

  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(200)
  legalName?: string;

  @ApiPropertyOptional() @IsOptional() @IsEmail() @MaxLength(254)
  email?: string;

  @ApiPropertyOptional() @IsOptional() @Matches(/^\+?[0-9]{8,15}$/)
  phone?: string;

  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(500)
  address?: string;

  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(64)
  taxId?: string;

  @ApiPropertyOptional({ enum: ['USD', 'KHR'] }) @IsOptional() @IsEnum(['USD', 'KHR'])
  defaultCurrency?: 'USD' | 'KHR';
}

export function toCompanyDto(c: Company): CompanyDto {
  return {
    id: c.id,
    name: c.name,
    legalName: c.legalName,
    email: c.email,
    phone: c.phone,
    address: c.address,
    taxId: c.taxId,
    defaultCurrency: c.defaultCurrency,
    status: c.status,
    createdAt: c.createdAt.toISOString(),
  };
}

@Injectable()
export class CompaniesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getCurrent(companyId: string): Promise<CompanyDto> {
    return toCompanyDto(await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } }));
  }

  async updateCurrent(user: TenantUser, dto: UpdateCompanyDto, ip: string | null): Promise<CompanyDto> {
    const company = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.company.update({ where: { id: user.companyId }, data: dto });
      await this.audit.log(
        {
          companyId: user.companyId,
          actorUserId: user.userId,
          action: 'company.updated',
          entityType: 'company',
          entityId: user.companyId,
          metadata: { fields: Object.keys(dto) },
          ipAddress: ip,
        },
        tx,
      );
      return updated;
    });
    return toCompanyDto(company);
  }
}

@ApiTags('Company')
@ApiBearerAuth()
@Controller('companies/current')
export class CompaniesController {
  constructor(
    private readonly companies: CompaniesService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions(Permission.COMPANY_READ)
  @ApiOperation({ summary: 'Get the active company profile' })
  get(@CurrentTenant() user: TenantUser): Promise<CompanyDto> {
    return this.companies.getCurrent(user.companyId);
  }

  @Patch()
  @RequirePermissions(Permission.COMPANY_UPDATE)
  @ApiOperation({ summary: 'Update the active company profile' })
  update(
    @CurrentTenant() user: TenantUser,
    @Body() dto: UpdateCompanyDto,
    @ClientIp() ip: string | null,
  ): Promise<CompanyDto> {
    return this.companies.updateCurrent(user, dto, ip);
  }

  @Get('audit-logs')
  @RequirePermissions(Permission.AUDIT_READ)
  @ApiOperation({ summary: 'Audit trail for the active company' })
  auditLogs(@CurrentTenant() user: TenantUser, @Query() q: PaginationQueryDto) {
    return this.audit.listForCompany(user.companyId, q.page, q.pageSize);
  }
}

@Module({
  controllers: [CompaniesController],
  providers: [CompaniesService],
  exports: [CompaniesService],
})
export class CompaniesModule {}
