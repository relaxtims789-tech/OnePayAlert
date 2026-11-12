import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function tenantClient(base: PrismaClient, companyId: string) {
  return base.$extends({
    name: 'tenant-rls',
    query: {
      // Every query (models and raw SQL) runs in its own short transaction that first sets the
      // company context, so the database's row-level security policies apply to it.
      async $allOperations({ args, query }) {
        const [, result] = await base.$transaction([
          base.$executeRaw`SELECT set_config('onepay.company_id', ${companyId}, true)`,
          query(args) as never,
        ]);
        return result;
      },
    },
  });
}

export type TenantPrisma = ReturnType<typeof tenantClient>;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * A client whose queries the database itself limits to one company (row-level security), on
   * top of the `companyId` filters in the code. Use it for merchant read paths. Not for
   * interactive transactions: those keep using `this.$transaction` with explicit filters.
   */
  forTenant(companyId: string): TenantPrisma {
    if (!UUID.test(companyId)) throw new Error('forTenant: companyId must be a UUID');
    return tenantClient(this, companyId);
  }
}
