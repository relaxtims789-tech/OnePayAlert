'use client';

import { Card, ErrorState } from '@onepay/ui';
import { useI18n } from '@/lib/i18n';

/** Catches rendering errors inside the signed-in area so one broken page never blanks the app. */
export default function AppError({ reset }: { error: Error; reset: () => void }) {
  const { t } = useI18n();
  return (
    <Card>
      <ErrorState title={t('common.somethingWrong')} message={t('common.networkError')} onRetry={reset} retryLabel={t('common.retry')} />
    </Card>
  );
}
