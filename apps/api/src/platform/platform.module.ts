import {
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Permission, type CompanyDto, type Paginated } from '@onepay/shared';
import { Prisma } from '@prisma/client';
import { IsEnum } from 'class-validator';
import { AuditService } from '../audit/audit.service';
import { PrincipalService } from '../auth/principal.service';
import type { AuthUser } from '../common/auth-user';
import { ClientIp, CurrentUser, RequirePermissions } from '../common/decorators';
import { PaginationQueryDto } from '../common/pagination.dto';
import { toCompanyDto } from '../companies/companies.module';
import { PrismaService } from '../prisma/prisma.service';

export class CompanyStatusDto {
  @ApiProperty({ enum: ['ACTIVE', 'SUSPENDED', 'CLOSED'] })
  @IsEnum(['ACTIVE', 'SUSPENDED', 'CLOSED'])
  status!: 'ACTIVE' | 'SUSPENDED' | 'CLOSED';
}

export interface PlatformCompanyDto extends CompanyDto {
  outletCount: number;
  employeeCount: number;
}

/** CAM Professional Technology super-admin operations across all tenants. */
@Injectable()
export class PlatformCompaniesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly principals: PrincipalService,
  ) {}

  async list(q: PaginationQueryDto): Promise<Paginated<PlatformCompanyDto>> {
    const where: Prisma.CompanyWhereInput = q.search
      ? {
          OR: [
            { name: { contains: q.search, mode: 'insensitive' } },
            { email: { contains: q.search, mode: 'insensitive' } },
          ],
        }
      : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.company.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { _count: { select: { outlets: true, memberships: true } } },
      }),
      this.prisma.company.count({ where }),
    ]);
    return {
      items: items.map((c) => ({
        ...toCompanyDto(c),
        outletCount: c._count.outlets,
        employeeCount: c._count.memberships,
      })),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  async setStatus(actor: AuthUser, id: string, dto: CompanyStatusDto, ip: string | null) {
    const company = await this.prisma.$transaction(async (tx) => {
      const before = await tx.company.findUniqueOrThrow({ where: { id } });
      const updated = await tx.company.update({ where: { id }, data: { status: dto.status } });
      await this.audit.log(
        {
          companyId: id,
          actorUserId: actor.userId,
          action: 'platform.company.status_changed',
          entityType: 'company',
          entityId: id,
          metadata: { from: before.status, to: dto.status },
          ipAddress: ip,
        },
        tx,
      );
      return updated;
    });
    await this.principals.invalidateCompany(id);
    return toCompanyDto(company);
  }
}

@ApiTags('Platform (CAM Super Admin)')
@ApiBearerAuth()
@Controller('platform/companies')
export class PlatformCompaniesController {
  constructor(private readonly service: PlatformCompaniesService) {}

  @Get()
  @RequirePermissions(Permission.PLATFORM_COMPANIES_READ)
  @ApiOperation({ summary: 'List all merchant companies' })
  list(@Query() q: PaginationQueryDto): Promise<Paginated<PlatformCompanyDto>> {
    return this.service.list(q);
  }

  @Patch(':id/status')
  @RequirePermissions(Permission.PLATFORM_COMPANIES_MANAGE)
  @ApiOperation({ summary: 'Activate, suspend or close a merchant company' })
  setStatus(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompanyStatusDto,
    @ClientIp() ip: string | null,
  ): Promise<CompanyDto> {
    return this.service.setStatus(user, id, dto, ip);
  }
}

@Module({
  controllers: [PlatformCompaniesController],
  providers: [PlatformCompaniesService],
})
export class PlatformModule {}
