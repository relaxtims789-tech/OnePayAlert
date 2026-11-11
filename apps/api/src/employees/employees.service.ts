import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ASSIGNABLE_ROLES,
  type CompanyRole,
  type EmployeeDto,
  type Paginated,
} from '@onepay/shared';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PasswordService } from '../auth/password.service';
import type { TenantUser } from '../common/auth-user';
import type { PaginationQueryDto } from '../common/pagination.dto';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateEmployeeDto, UpdateEmployeeDto } from './employees.dto';

const employeeInclude = {
  user: { select: { id: true, email: true, fullName: true, phone: true, status: true } },
  outlets: { select: { outletId: true } },
} satisfies Prisma.MembershipInclude;

type MembershipWithUser = Prisma.MembershipGetPayload<{ include: typeof employeeInclude }>;

function toEmployeeDto(m: MembershipWithUser): EmployeeDto {
  return {
    membershipId: m.id,
    userId: m.user.id,
    email: m.user.email,
    fullName: m.user.fullName,
    phone: m.user.phone,
    role: m.role as CompanyRole,
    status: m.user.status,
    isActive: m.isActive,
    outletIds: m.outlets.map((o) => o.outletId),
    createdAt: m.createdAt.toISOString(),
  };
}

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly audit: AuditService,
  ) {}

  async list(user: TenantUser, q: PaginationQueryDto): Promise<Paginated<EmployeeDto>> {
    const where: Prisma.MembershipWhereInput = {
      companyId: user.companyId,
      ...(q.search
        ? {
            user: {
              OR: [
                { fullName: { contains: q.search, mode: 'insensitive' } },
                { email: { contains: q.search, mode: 'insensitive' } },
              ],
            },
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.membership.findMany({
        where,
        include: employeeInclude,
        orderBy: { createdAt: 'asc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.prisma.membership.count({ where }),
    ]);
    return { items: items.map(toEmployeeDto), total, page: q.page, pageSize: q.pageSize };
  }

  async get(user: TenantUser, membershipId: string): Promise<EmployeeDto> {
    return toEmployeeDto(await this.findOwned(user, membershipId));
  }

  async create(user: TenantUser, dto: CreateEmployeeDto, ip: string | null): Promise<EmployeeDto> {
    this.assertCanAssign(user, dto.role);
    const outletIds = await this.validateOutlets(user.companyId, dto.outletIds);

    const existingUser = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existingUser) {
      const existingMembership = await this.prisma.membership.findUnique({
        where: { companyId_userId: { companyId: user.companyId, userId: existingUser.id } },
      });
      if (existingMembership) throw new ConflictException('This person is already an employee');
    }
    const passwordHash = existingUser ? null : await this.passwords.hash(dto.initialPassword);

    const membership = await this.prisma.$transaction(async (tx) => {
      const employeeUser =
        existingUser ??
        (await tx.user.create({
          data: {
            email: dto.email,
            fullName: dto.fullName,
            phone: dto.phone ?? null,
            passwordHash: passwordHash as string,
          },
        }));
      const created = await tx.membership.create({
        data: {
          companyId: user.companyId,
          userId: employeeUser.id,
          role: dto.role,
          outlets: {
            create: outletIds.map((outletId) => ({ outletId, companyId: user.companyId })),
          },
        },
        include: employeeInclude,
      });
      await this.audit.log(
        {
          companyId: user.companyId,
          actorUserId: user.userId,
          action: 'employee.added',
          entityType: 'membership',
          entityId: created.id,
          metadata: { email: dto.email, role: dto.role, existingAccount: !!existingUser },
          ipAddress: ip,
        },
        tx,
      );
      return created;
    });
    return toEmployeeDto(membership);
  }

  async update(
    user: TenantUser,
    membershipId: string,
    dto: UpdateEmployeeDto,
    ip: string | null,
  ): Promise<EmployeeDto> {
    const target = await this.findOwned(user, membershipId);
    if (target.userId === user.userId) {
      throw new ForbiddenException('You cannot change your own role or access');
    }
    // The actor must outrank the target's current role and any new role.
    this.assertCanAssign(user, target.role as CompanyRole);
    if (dto.role) this.assertCanAssign(user, dto.role);
    const outletIds =
      dto.outletIds !== undefined ? await this.validateOutlets(user.companyId, dto.outletIds) : null;

    const updated = await this.prisma.$transaction(async (tx) => {
      if (outletIds !== null) {
        await tx.membershipOutlet.deleteMany({ where: { membershipId } });
        if (outletIds.length > 0) {
          await tx.membershipOutlet.createMany({
            data: outletIds.map((outletId) => ({ membershipId, outletId, companyId: user.companyId })),
          });
        }
      }
      const m = await tx.membership.update({
        where: { id: membershipId },
        data: {
          ...(dto.role ? { role: dto.role } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
        include: employeeInclude,
      });
      if (dto.isActive === false) {
        // Revoke the employee's sessions that are scoped to this company.
        await tx.session.updateMany({
          where: { userId: target.userId, companyId: user.companyId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      await this.audit.log(
        {
          companyId: user.companyId,
          actorUserId: user.userId,
          action: 'employee.updated',
          entityType: 'membership',
          entityId: membershipId,
          metadata: {
            fromRole: target.role,
            ...(dto.role ? { toRole: dto.role } : {}),
            ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
            ...(outletIds !== null ? { outletIds } : {}),
          },
          ipAddress: ip,
        },
        tx,
      );
      return m;
    });
    return toEmployeeDto(updated);
  }

  private assertCanAssign(user: TenantUser, role: CompanyRole): void {
    if (!ASSIGNABLE_ROLES[user.companyRole].includes(role)) {
      throw new ForbiddenException(`Your role cannot manage ${role} employees`);
    }
  }

  private async validateOutlets(companyId: string, outletIds: string[] | undefined): Promise<string[]> {
    const ids = [...new Set(outletIds ?? [])];
    if (ids.length === 0) return [];
    const count = await this.prisma.outlet.count({ where: { companyId, id: { in: ids } } });
    if (count !== ids.length) throw new BadRequestException('One or more outlets do not exist');
    return ids;
  }

  private async findOwned(user: TenantUser, membershipId: string): Promise<MembershipWithUser> {
    const m = await this.prisma.membership.findFirst({
      where: { id: membershipId, companyId: user.companyId },
      include: employeeInclude,
    });
    if (!m) throw new NotFoundException('Employee not found');
    return m;
  }
}
