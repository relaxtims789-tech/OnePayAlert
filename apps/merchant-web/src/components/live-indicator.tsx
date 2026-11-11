'use client';

import { cn } from '@onepay/ui';
import { useI18n } from '@/lib/i18n';
import { useRealtime } from '@/lib/realtime';

export function LiveIndicator() {
  const { status } = useRealtime();
  const { t } = useI18n();
  const label = status === 'live' ? t('dashboard.live') : status === 'connecting' ? t('dashboard.connecting') : t('dashboard.offline');
  return (
    <span className="inline-flex items-center gap-2 text-xs font-medium text-ink-2" data-testid="live-status" data-status={status}>
      <span className="relative flex size-2.5">
        {status === 'live' ? <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" /> : null}
        <span
          className={cn(
            'relative inline-flex size-2.5 rounded-full',
            status === 'live' ? 'bg-success' : status === 'connecting' ? 'bg-pending' : 'bg-ink-3',
          )}
        />
      </span>
      {label}
    </span>
  );
}
