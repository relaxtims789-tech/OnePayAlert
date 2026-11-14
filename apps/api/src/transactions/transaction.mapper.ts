import { assertSafeInteger, type TransactionDto } from '@onepay/shared';
import type { PaymentProvider, Transaction } from '@prisma/client';

export type TransactionWithProvider = Transaction & {
  bankConnection: { provider: Pick<PaymentProvider, 'code'> };
};

export const transactionInclude = {
  bankConnection: { select: { provider: { select: { code: true } } } },
} as const;

/** BigInt minor units → JSON-safe integer (throws instead of silently losing precision). */
export function minorToNumber(v: bigint | null | undefined): number {
  return assertSafeInteger(Number(v ?? 0n));
}

export function toTransactionDto(t: TransactionWithProvider): TransactionDto {
  return {
    id: t.id,
    companyId: t.companyId,
    outletId: t.outletId,
    bankConnectionId: t.bankConnectionId,
    providerCode: t.bankConnection.provider.code,
    providerTxnId: t.providerTxnId,
    direction: t.direction,
    status: t.status,
    amountMinor: minorToNumber(t.amountMinor),
    currency: t.currency,
    payerName: t.payerName,
    payerAccountMasked: t.payerAccountMasked,
    reference: t.reference,
    description: t.description,
    isSimulated: t.isSimulated,
    verification: t.verification,
    occurredAt: t.occurredAt.toISOString(),
    receivedAt: t.receivedAt.toISOString(),
  };
}
