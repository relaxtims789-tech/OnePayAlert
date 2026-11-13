import type { BakongHealthService } from '../khqr/bakong-health.service';
import type { BakongClient } from '../khqr/bakong.client';
import type { EntitlementsService } from '../billing/entitlements.service';
import { ForbiddenException } from '@nestjs/common';
import type { AuditService } from '../audit/audit.service';
import type { TenantUser } from '../common/auth-user';
import type { AppConfig } from '../config/app-config.service';
import type { CryptoService } from '../infra/crypto.service';
import type { PrismaService } from '../prisma/prisma.service';
import { BankConnectionsService } from './bank-connections.service';
import type { IngestionService } from './ingestion.service';

const user = { companyId: 'c1', userId: 'u1', outletIds: [] } as unknown as TenantUser;

function service(isProduction: boolean) {
  const prisma = {
    bankConnection: { findFirst: jest.fn() },
    paymentProvider: {
      findFirst: jest.fn().mockResolvedValue({ id: 'p', isDemo: true, adapterKey: 'SIMULATOR', name: 'Demo' }),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  const config = { allowsSimulatedPayments: !isProduction, get: jest.fn() } as unknown as AppConfig;
  const ingestion = { accept: jest.fn() } as unknown as IngestionService;
  const svc = new BankConnectionsService(
    prisma as unknown as PrismaService,
    {} as CryptoService,
    config,
    {} as AuditService,
    ingestion,
    {} as EntitlementsService,
    { mode: 'simulated', accountExists: async () => null } as unknown as BakongClient,
    { track: <T>(call: () => Promise<T>) => call() } as unknown as BakongHealthService,
  );
  return { svc, prisma, ingestion };
}

describe('BankConnectionsService production guards', () => {
  it('never simulates payments in production', async () => {
    const { svc, prisma, ingestion } = service(true);
    await expect(svc.simulatePayment(user, 'id', { amount: '1.00' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.bankConnection.findFirst).not.toHaveBeenCalled();
    expect(ingestion.accept).not.toHaveBeenCalled();
  });

  it('refuses to create demo connections in production', async () => {
    const { svc } = service(true);
    await expect(
      svc.create(user, { providerId: 'p', displayName: 'Demo', currency: 'USD' }, null),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('hides demo providers from the production catalogue', async () => {
    const { svc, prisma } = service(true);
    await svc.listProviders();
    expect(prisma.paymentProvider.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { isActive: true, isDemo: false } }),
    );
  });
});
