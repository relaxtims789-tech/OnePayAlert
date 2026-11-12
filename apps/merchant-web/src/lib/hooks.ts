'use client';

import { hasPermissions, type MeResponse, type OutletDto, type Paginated, type Permission } from '@onepay/shared';
import { useToast } from '@onepay/ui';
import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import { ApiError, api } from './api';
import { useI18n } from './i18n';

export const queryKeys = {
  me: ['me'] as const,
  outlets: (params?: unknown) => ['outlets', params ?? {}] as const,
  employees: (params?: unknown) => ['employees', params ?? {}] as const,
  connections: ['bank-connections'] as const,
  providers: ['payment-providers'] as const,
  transactions: (params?: unknown) => ['transactions', params ?? {}] as const,
  summary: (params?: unknown) => ['transactions-summary', params ?? {}] as const,
  company: ['company'] as const,
  audit: (page: number) => ['audit', page] as const,
};

export function useMe() {
  return useQuery({ queryKey: queryKeys.me, queryFn: () => api.get<MeResponse>('auth/me'), staleTime: 60_000 });
}

/** Permission check against the active company role (mirrors the API's RBAC matrix). */
export function useCan() {
  const { data } = useMe();
  return useCallback((...perms: Permission[]) => !!data && hasPermissions(data.permissions, perms), [data]);
}

/** All active outlets the user can see (for selects and labels). */
export function useOutletOptions(enabled = true) {
  return useQuery({
    queryKey: queryKeys.outlets({ all: true }),
    queryFn: () => api.get<Paginated<OutletDto>>('outlets', { pageSize: 100 }),
    enabled,
    select: (d) => d.items,
  });
}

/** Translates API errors into a toast in the user's language. */
export function useErrorToast() {
  const { show } = useToast();
  const { t } = useI18n();
  return useCallback(
    (err: unknown) => {
      const e = err instanceof ApiError ? err : null;
      const description =
        !e || e.status === 0
          ? t('common.networkError')
          : e.status === 403 && (!e.code || e.code === 'FORBIDDEN')
            ? t('common.forbidden')
            : e.status === 404
              ? t('common.notFound')
              : e.message;
      show({ tone: 'error', title: t('common.somethingWrong'), description });
    },
    [show, t],
  );
}

export function errorText(err: unknown, t: ReturnType<typeof useI18n>['t']): string {
  if (!(err instanceof ApiError) || err.status === 0) return t('common.networkError');
  // Specific 403s (plan limits, ended subscription) carry their own translated message.
  if (err.status === 403 && (!err.code || err.code === 'FORBIDDEN')) return t('common.forbidden');
  return err.message;
}
