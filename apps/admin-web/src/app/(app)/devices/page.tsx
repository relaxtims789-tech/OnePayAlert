'use client';

import { Permission, type DeviceCredentialsDto, type DeviceStatus, type Paginated, type PlatformDeviceDto } from '@onepay/shared';
import { Alert, Badge, Button, Card, EmptyState, ErrorState, Field, Input, Modal, Pagination, Segmented, Table, TableSkeleton, Td, Th, useToast, cn, type Tone } from '@onepay/ui';
import { api } from '@onepay/web-core/client';
import { dateTime } from '@onepay/web-core/format';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Plus, Search, Speaker } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { PageHeader } from '@/components/common';
import { errorText, useCan, useErrorToast } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';

const PAGE_SIZE = 25;
const TONE: Record<DeviceStatus, Tone> = { UNASSIGNED: 'neutral', ACTIVE: 'success', DISABLED: 'failed' };
const SERIAL = /^[A-Z0-9][A-Z0-9-]{4,31}$/;

function CopyValue({ label, value, testId }: { label: string; value: string; testId: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-ink-2">{label}</p>
      <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2">
        <code className="min-w-0 flex-1 text-sm break-all" data-testid={testId}>
          {value}
        </code>
        <button
          type="button"
          className="rounded-lg p-1.5 text-ink-2 hover:bg-white"
          aria-label={label}
          onClick={() => {
            void navigator.clipboard?.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
        </button>
      </div>
    </div>
  );
}

export default function DevicesPage() {
  const { t, locale } = useI18n();
  const can = useCan();
  const canManage = can(Permission.PLATFORM_DEVICES_MANAGE);
  const qc = useQueryClient();
  const { show } = useToast();
  const toastError = useErrorToast();
  const [status, setStatus] = useState<DeviceStatus | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [registering, setRegistering] = useState(false);
  const [serial, setSerial] = useState('');
  const [model, setModel] = useState('OPA-SB1');
  const [formError, setFormError] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<DeviceCredentialsDto | null>(null);
  const [rotating, setRotating] = useState<PlatformDeviceDto | null>(null);

  useEffect(() => {
    const h = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(h);
  }, [search]);
  useEffect(() => setPage(1), [status, q]);

  const params = { page, pageSize: PAGE_SIZE, status: status === 'ALL' ? undefined : status, search: q || undefined };
  const list = useQuery({
    queryKey: ['platform-devices', params],
    queryFn: () => api.get<Paginated<PlatformDeviceDto>>('platform/devices', params),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ['platform-devices'] });

  const register = useMutation({
    mutationFn: () => api.post<DeviceCredentialsDto>('platform/devices', { serialNumber: serial, model }),
    onSuccess: (c) => {
      setRegistering(false);
      setCredentials(c);
      void refresh();
    },
    onError: (e) => setFormError(errorText(e, t)),
  });
  const rotate = useMutation({
    mutationFn: (d: PlatformDeviceDto) => api.post<DeviceCredentialsDto>(`platform/devices/${d.id}/rotate-secret`),
    onSuccess: (c) => {
      setRotating(null);
      setCredentials(c);
    },
    onError: toastError,
  });
  const toggle = useMutation({
    mutationFn: (d: PlatformDeviceDto) => api.patch<PlatformDeviceDto>(`platform/devices/${d.id}`, { disabled: d.status !== 'DISABLED' }),
    onSuccess: (d) => {
      show({ tone: 'success', title: t(d.status === 'DISABLED' ? 'devices.disabledDone' : 'devices.enabledDone', { serial: d.serialNumber }) });
      void refresh();
    },
    onError: toastError,
  });

  const total = list.data?.total ?? 0;
  const first = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const last = Math.min(page * PAGE_SIZE, total);

  return (
    <>
      <PageHeader
        title={t('devices.title')}
        subtitle={t('devices.subtitle')}
        actions={
          canManage ? (
            <Button
              icon={<Plus className="size-4" />}
              onClick={() => {
                setSerial('');
                setFormError(null);
                setRegistering(true);
              }}
              data-testid="register-device"
            >
              {t('devices.register')}
            </Button>
          ) : null
        }
      />
      <Card>
        <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-center">
          <Segmented
            value={status}
            onChange={setStatus}
            ariaLabel={t('common.status')}
            options={[
              { value: 'ALL', label: t('devices.all') },
              { value: 'UNASSIGNED', label: t('devices.UNASSIGNED') },
              { value: 'ACTIVE', label: t('devices.ACTIVE') },
              { value: 'DISABLED', label: t('devices.DISABLED') },
            ]}
          />
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
            <Input type="search" className="pl-9" placeholder={t('devices.search')} aria-label={t('devices.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        {list.isPending ? (
          <TableSkeleton cols={6} />
        ) : list.isError ? (
          <ErrorState title={t('common.somethingWrong')} message={errorText(list.error, t)} onRetry={() => void list.refetch()} retryLabel={t('common.retry')} />
        ) : list.data.items.length === 0 ? (
          <EmptyState icon={<Speaker className="size-6" />} title={t('devices.empty')} />
        ) : (
          <>
            <Table className={list.isFetching ? 'opacity-70 transition-opacity' : undefined}>
              <thead>
                <tr>
                  <Th>{t('devices.serial')}</Th>
                  <Th>{t('devices.merchant')}</Th>
                  <Th>{t('common.status')}</Th>
                  <Th>{t('devices.connection')}</Th>
                  <Th>{t('devices.lastSeen')}</Th>
                  {canManage ? <Th className="text-right">{t('common.actions')}</Th> : null}
                </tr>
              </thead>
              <tbody data-testid="devices-table">
                {list.data.items.map((d) => (
                  <tr key={d.id}>
                    <Td>
                      <p className="font-medium">{d.serialNumber}</p>
                      <p className="text-xs text-ink-3">
                        {d.model}
                        {d.firmware ? ` · ${d.firmware}` : ''}
                        {d.name ? ` · ${d.name}` : ''}
                      </p>
                    </Td>
                    <Td>
                      {d.companyId ? (
                        <Link href={`/merchants/${d.companyId}`} className="font-medium text-brand hover:underline">
                          {d.companyName}
                        </Link>
                      ) : (
                        <span className="text-ink-3">—</span>
                      )}
                    </Td>
                    <Td>
                      <Badge tone={TONE[d.status]}>{t(`deviceStatus.${d.status}`)}</Badge>
                    </Td>
                    <Td>
                      <span className={cn('inline-flex items-center gap-1.5 text-sm', d.online ? 'text-success' : 'text-ink-3')}>
                        <span className={cn('size-2 rounded-full', d.online ? 'bg-success' : 'bg-ink-3')} aria-hidden />
                        {d.online ? t('devices.online') : t('devices.offline')}
                        {d.batteryPct !== null ? <span className="text-ink-3"> · {d.batteryPct}%</span> : null}
                      </span>
                    </Td>
                    <Td className="whitespace-nowrap text-ink-2">{d.lastSeenAt ? dateTime(d.lastSeenAt, locale) : '—'}</Td>
                    {canManage ? (
                      <Td className="text-right whitespace-nowrap">
                        <Button variant="ghost" size="sm" onClick={() => setRotating(d)}>
                          {t('devices.rotate')}
                        </Button>
                        <Button variant="ghost" size="sm" loading={toggle.isPending && toggle.variables?.id === d.id} onClick={() => toggle.mutate(d)}>
                          {d.status === 'DISABLED' ? t('devices.enable') : t('devices.disable')}
                        </Button>
                      </Td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={total}
              onPage={setPage}
              labels={{ previous: t('common.previous'), next: t('common.next'), summary: t('common.pageSummary', { from: first, to: last, total }) }}
            />
          </>
        )}
      </Card>

      <Modal
        open={registering}
        onClose={() => setRegistering(false)}
        title={t('devices.registerTitle')}
        closeLabel={t('common.close')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRegistering(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" form="register-form" loading={register.isPending} disabled={!SERIAL.test(serial) || model.trim().length < 2}>
              {t('devices.register')}
            </Button>
          </>
        }
      >
        <form
          id="register-form"
          className="space-y-4"
          noValidate
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            setFormError(null);
            register.mutate();
          }}
        >
          <Field label={t('devices.serial')} hint={t('devices.serialHint')}>
            {(p) => <Input {...p} autoComplete="off" placeholder="SBX-000123" value={serial} onChange={(e) => setSerial(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''))} />}
          </Field>
          <Field label={t('devices.model')}>{(p) => <Input {...p} value={model} onChange={(e) => setModel(e.target.value)} />}</Field>
          {formError ? <Alert tone="error">{formError}</Alert> : null}
        </form>
      </Modal>

      <Modal
        open={!!credentials}
        onClose={() => setCredentials(null)}
        title={t('devices.credentialsTitle')}
        closeLabel={t('common.close')}
        footer={<Button onClick={() => setCredentials(null)}>{t('devices.saved')}</Button>}
      >
        {credentials ? (
          <div className="space-y-3">
            <Alert tone="warning">{t('devices.credentialsText')}</Alert>
            <CopyValue label={t('devices.mqttUsername')} value={credentials.mqttUsername} testId="mqtt-username" />
            <CopyValue label={t('devices.mqttPassword')} value={credentials.mqttPassword} testId="mqtt-password" />
            {credentials.claimCode ? <CopyValue label={t('devices.claimCode')} value={credentials.claimCode} testId="claim-code" /> : null}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={!!rotating}
        onClose={() => setRotating(null)}
        title={rotating ? t('devices.rotateTitle', { serial: rotating.serialNumber }) : ''}
        closeLabel={t('common.close')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRotating(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" loading={rotate.isPending} onClick={() => rotating && rotate.mutate(rotating)}>
              {t('devices.rotate')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">{t('devices.rotateText')}</p>
      </Modal>
    </>
  );
}
