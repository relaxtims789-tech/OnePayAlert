'use client';

import type { TransactionDto } from '@onepay/shared';
import { cn } from '@onepay/ui';
import { ArrowDownLeft } from 'lucide-react';
import { dateTime, money } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { DemoBadge, TxnStatus } from './status';

/** Compact payment row used by the live feed. */
export function TransactionRow({ txn, fresh, outletName }: { txn: TransactionDto; fresh?: boolean; outletName?: string }) {
  const { locale } = useI18n();
  return (
    <li className={cn('flex items-center gap-3 px-5 py-3.5', fresh && 'animate-flash')} data-testid="feed-item">
      <div
        className={cn(
          'grid size-10 shrink-0 place-items-center rounded-xl',
          txn.status === 'SUCCESS' ? 'bg-success-50 text-success' : txn.status === 'FAILED' ? 'bg-failed-50 text-failed' : 'bg-pending-50 text-pending',
        )}
      >
        <ArrowDownLeft className="size-5" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-ink">
          {txn.payerName ?? txn.reference ?? txn.providerTxnId} {txn.isSimulated ? <DemoBadge /> : null}
        </p>
        <p className="truncate text-xs text-ink-3">
          {dateTime(txn.occurredAt, locale)} · {txn.providerCode}
          {outletName ? ` · ${outletName}` : ''}
        </p>
      </div>
      <div className="text-right">
        <p className={cn('font-semibold tabular-nums', txn.status === 'SUCCESS' ? 'text-success' : 'text-ink')}>
          +{money(txn.amountMinor, txn.currency, locale)}
        </p>
        <div className="mt-0.5">
          <TxnStatus status={txn.status} />
        </div>
      </div>
    </li>
  );
}
