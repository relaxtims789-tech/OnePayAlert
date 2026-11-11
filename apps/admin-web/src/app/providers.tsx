'use client';

import type { Locale } from '@onepay/shared';
import { ToastProvider } from '@onepay/ui';
import { ApiError } from '@onepay/web-core/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { I18nProvider } from '@/lib/i18n';

export function Providers({ locale, children }: { locale: Locale; children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <I18nProvider initialLocale={locale}>
        <ToastProvider>{children}</ToastProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}
