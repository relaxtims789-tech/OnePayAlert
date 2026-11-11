'use client';

import { Card, ErrorState } from '@onepay/ui';
import { useI18n } from '@/lib/i18n';

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  const { t } = useI18n();
  return (
    <Card>
      <ErrorState title={t('common.somethingWrong')} message={t('common.networkError')} onRetry={reset} retryLabel={t('common.retry')} />
    </Card>
  );
}
