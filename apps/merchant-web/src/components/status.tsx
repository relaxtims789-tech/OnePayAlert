'use client';

import type { BankConnectionStatus, TransactionStatus } from '@onepay/shared';
import { Badge, type Tone } from '@onepay/ui';
import { useI18n } from '@/lib/i18n';

const TXN_TONE: Record<TransactionStatus, Tone> = { SUCCESS: 'success', PENDING: 'pending', FAILED: 'failed', REVERSED: 'neutral' };
const CONN_TONE: Record<BankConnectionStatus, Tone> = { ACTIVE: 'success', PENDING: 'pending', ERROR: 'failed', DISCONNECTED: 'neutral' };

export function TxnStatus({ status }: { status: TransactionStatus }) {
  const { t } = useI18n();
  return (
    <Badge tone={TXN_TONE[status]}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {t(`status.${status}`)}
    </Badge>
  );
}

export function ConnectionStatus({ status }: { status: BankConnectionStatus }) {
  const { t } = useI18n();
  return <Badge tone={CONN_TONE[status]}>{t(`connectionStatus.${status}`)}</Badge>;
}

/** A payment read from a bank app notification on a merchant phone, not confirmed by the bank. */
export function FromPhoneBadge() {
  const { t } = useI18n();
  return <Badge tone="neutral">{t('common.fromPhone')}</Badge>;
}

export function DemoBadge() {
  const { t } = useI18n();
  return <Badge tone="pending">{t('common.demo')}</Badge>;
}
