'use client';

import { Permission, type PlatformProviderDto } from '@onepay/shared';
import { Badge, Button, Card, ErrorState, Table, TableSkeleton, Td, Th, useToast } from '@onepay/ui';
import { api } from '@onepay/web-core/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/common';
import { errorText, keys, useCan, useErrorToast } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';

export default function ProvidersPage() {
  const { t } = useI18n();
  const can = useCan();
  const canManage = can(Permission.PLATFORM_PROVIDERS_MANAGE);
  const qc = useQueryClient();
  const { show } = useToast();
  const toastError = useErrorToast();

  // The provider catalogue endpoint requires PROVIDERS_MANAGE; read-only staff see a permission message.
  const list = useQuery({
    queryKey: keys.providers,
    queryFn: () => api.get<PlatformProviderDto[]>('platform/payment-providers'),
  });
  const toggle = useMutation({
    mutationFn: (p: PlatformProviderDto) => api.patch(`platform/payment-providers/${p.id}`, { isActive: !p.isActive }),
    onSuccess: () => {
      show({ tone: 'success', title: t('providers.updated') });
      void qc.invalidateQueries({ queryKey: keys.providers });
    },
    onError: toastError,
  });

  return (
    <>
      <PageHeader title={t('providers.title')} subtitle={t('providers.subtitle')} />
      <Card>
        {list.isPending ? (
          <TableSkeleton cols={5} />
        ) : list.isError ? (
          <ErrorState title={t('common.somethingWrong')} message={errorText(list.error, t)} onRetry={() => void list.refetch()} retryLabel={t('common.retry')} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t('common.name')}</Th>
                <Th>{t('providers.type')}</Th>
                <Th>{t('providers.integration')}</Th>
                <Th className="text-right">{t('providers.connections')}</Th>
                <Th>{t('common.status')}</Th>
                {canManage ? <Th className="text-right">{t('common.actions')}</Th> : null}
              </tr>
            </thead>
            <tbody data-testid="providers-table">
              {list.data.map((p) => (
                <tr key={p.id}>
                  <Td>
                    <p className="font-medium">{p.name}</p>
                    <code className="text-xs text-ink-3">{p.code}</code>
                  </Td>
                  <Td className="text-ink-2">{t(`providers.${p.type}`)}</Td>
                  <Td>
                    {p.isDemo ? (
                      <Badge tone="pending">{t('providers.demo')}</Badge>
                    ) : p.integrationAvailable ? (
                      <Badge tone="success">{t('providers.live')}</Badge>
                    ) : (
                      <Badge>{t('providers.awaiting')}</Badge>
                    )}
                  </Td>
                  <Td className="text-right tabular-nums">{p.connectionCount}</Td>
                  <Td>{p.isActive ? <Badge tone="success">{t('common.active')}</Badge> : <Badge>{t('common.inactive')}</Badge>}</Td>
                  {canManage ? (
                    <Td className="text-right">
                      <Button variant="ghost" size="sm" loading={toggle.isPending && toggle.variables?.id === p.id} onClick={() => toggle.mutate(p)}>
                        {p.isActive ? t('providers.disable') : t('providers.enable')}
                      </Button>
                    </Td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
