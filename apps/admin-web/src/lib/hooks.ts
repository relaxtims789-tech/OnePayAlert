'use client';

import { hasPermissions, Permission, type MeResponse } from '@onepay/shared';
import { useToast } from '@onepay/ui';
import { ApiError, api } from '@onepay/web-core/client';
import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useI18n } from './i18n';

export const keys = {
  me: ['me'] as const,
  overview: ['overview'] as const,
  merchants: (p: unknown) => ['merchants', p] as const,
  merchant: (id: string) => ['merchant', id] as const,
  plans: ['plans'] as const,
  providers: ['providers'] as const,
  audit: (p: unknown) => ['audit', p] as const,
  health: ['health'] as const,
};

export function useMe() {
  return useQuery({ queryKey: keys.me, queryFn: () => api.get<MeResponse>('auth/me'), staleTime: 60_000 });
}

export function useCan() {
  const { data } = useMe();
  return useCallback((...p: Permission[]) => !!data && hasPermissions(data.permissions, p), [data]);
}

/** SUPPORT staff are read-only; SUPER_ADMIN can manage. */
export function useCanManage() {
  const can = useCan();
  return can(Permission.PLATFORM_COMPANIES_MANAGE);
}

export function errorText(err: unknown, t: ReturnType<typeof useI18n>['t']): string {
  if (!(err instanceof ApiError) || err.status === 0) return t('common.networkError');
  if (err.status === 403 && (!err.code || err.code === 'FORBIDDEN')) return t('common.forbidden');
  if (err.status === 404) return t('common.notFound');
  return err.message;
}

export function useErrorToast() {
  const { show } = useToast();
  const { t } = useI18n();
  return useCallback((err: unknown) => show({ tone: 'error', title: t('common.somethingWrong'), description: errorText(err, t) }), [show, t]);
}
