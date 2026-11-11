import { Injectable, NotFoundException } from '@nestjs/common';
import type { OutletDto, Paginated } from '@onepay/shared';
import { Prisma, type Outlet } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import type { TenantUser } from '../common/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateOutletDto, ListOutletsQueryDto, UpdateOutletDto } from './outlets.dto';

export function toOutletDto(o: Outlet): OutletDto {
  return {
    id: o.id,
    companyId: o.companyId,
    name: o.name,
    code: o.code,
    address: o.address,
    phone: o.phone,
    isActive: o.isActive,
    createdAt: o.createdAt.toISOString(),
  };
}

@Injectable()
export class OutletsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Tenant scope + per-member outlet restriction. Every read goes through this. */
  private scope(user: TenantUser): Prisma.OutletWhereInput {
    return {
      companyId: user.companyId,
      ...(user.outletIds.length > 0 ? { id: { in: user.outletIds } } : {}),
    };
  }

  async list(user: TenantUser, q: ListOutletsQueryDto): Promise<Paginated<OutletDto>> {
    const where: Prisma.OutletWhereInput = {
      ...this.scope(user),
      ...(q.isActive !== undefined ? { isActive: q.isActive } : {}),
      ...(q.search
        ? {
            OR: [
              { name: { contains: q.search, mode: 'insensitive' } },
              { code: { contains: q.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.outlet.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.outlet.count({ where }),
    ]);
    return { items: items.map(toOutletDto), total, page: q.page, pageSize: q.pageSize };
  }

  async get(user: TenantUser, id: string): Promise<OutletDto> {
    return toOutletDto(await this.findOwned(user, id));
  }

  async create(user: TenantUser, dto: CreateOutletDto, ip: string | null): Promise<OutletDto> {
    const outlet = await this.prisma.$transaction(async (tx) => {
      const created = await tx.outlet.create({ data: { ...dto, companyId: user.companyId } });
      await this.audit.log(
        {
          companyId: user.companyId,
          actorUserId: user.userId,
          action: 'outlet.created',
          entityType: 'outlet',
          entityId: created.id,
          metadata: { name: created.name, code: created.code },
          ipAddress: ip,
        },
        tx,
      );
      return created;
    });
    return toOutletDto(outlet);
  }

  async update(
    user: TenantUser,
    id: string,
    dto: UpdateOutletDto,
    ip: string | null,
  ): Promise<OutletDto> {
    await this.findOwned(user, id);
    const outlet = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.outlet.update({ where: { id }, data: dto });
      await this.audit.log(
        {
          companyId: user.companyId,
          actorUserId: user.userId,
          action: 'outlet.updated',
          entityType: 'outlet',
          entityId: id,
          metadata: { fields: Object.keys(dto) },
          ipAddress: ip,
        },
        tx,
      );
      return updated;
    });
    return toOutletDto(outlet);
  }

  /** Throws 404 (never 403) for outlets of other tenants so ids cannot be probed. */
  private async findOwned(user: TenantUser, id: string): Promise<Outlet> {
    const outlet = await this.prisma.outlet.findFirst({ where: { id, ...this.scope(user) } });
    if (!outlet) throw new NotFoundException('Outlet not found');
    return outlet;
  }
}
