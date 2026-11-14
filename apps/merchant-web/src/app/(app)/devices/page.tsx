'use client';

import { Permission, type DeviceDto, type DeviceTestResultDto, type Locale } from '@onepay/shared';
import { Alert, Badge, Button, Card, EmptyState, ErrorState, Field, Input, Modal, Select, Skeleton, useToast, cn } from '@onepay/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BatteryMedium, Plus, Radio, Settings2, Signal, Speaker, Trash2, Volume2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { PageHeader } from '@/components/page-header';
import { api } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { errorText, useCan, useErrorToast, useOutletOptions } from '@/lib/hooks';
import { LOCALE_LABELS, useI18n } from '@/lib/i18n';

type Draft = { serialNumber: string; claimCode: string; name: string; outletId: string; locale: Locale; volume: number; announceReported: boolean };
const emptyDraft = (locale: Locale): Draft => ({ serialNumber: '', claimCode: '', name: '', outletId: '', locale, volume: 80, announceReported: true });

export default function DevicesPage() {
  const { t, locale } = useI18n();
  const can = useCan();
  const qc = useQueryClient();
  const { show } = useToast();
  const toastError = useErrorToast();
  const canManage = can(Permission.DEVICE_MANAGE);
  const [mode, setMode] = useState<'add' | DeviceDto | null>(null);
  const [removing, setRemoving] = useState<DeviceDto | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft(locale));
  const [formError, setFormError] = useState<string | null>(null);

  const devices = useQuery({ queryKey: ['devices'], queryFn: () => api.get<DeviceDto[]>('devices'), refetchInterval: 60_000 });
  const outlets = useOutletOptions(can(Permission.OUTLET_READ));
  const outletName = (id: string | null) => (id ? (outlets.data?.find((o) => o.id === id)?.name ?? '—') : t('devices.allOutlets'));
  const label = (d: DeviceDto) => d.name ?? d.serialNumber;
  const refresh = () => qc.invalidateQueries({ queryKey: ['devices'] });

  const save = useMutation({
    mutationFn: () =>
      mode === 'add'
        ? api.post<DeviceDto>('devices/claim', {
            serialNumber: draft.serialNumber,
            claimCode: draft.claimCode,
            name: draft.name || undefined,
            outletId: draft.outletId || undefined,
            locale: draft.locale,
          })
        : api.patch<DeviceDto>(`devices/${(mode as DeviceDto).id}`, {
            name: draft.name.trim() || null,
            outletId: draft.outletId || null,
            locale: draft.locale,
            volume: draft.volume,
            announceReported: draft.announceReported,
          }),
    onSuccess: async () => {
      show({ tone: 'success', title: mode === 'add' ? t('devices.added') : t('devices.saved') });
      setMode(null);
      await refresh();
      await qc.invalidateQueries({ queryKey: ['billing'] });
    },
    onError: (e) => setFormError(errorText(e, t)),
  });
  const test = useMutation({
    mutationFn: (d: DeviceDto) => api.post<DeviceTestResultDto>(`devices/${d.id}/test`),
    onSuccess: (r, d) =>
      show(
        !r.sent
          ? { tone: 'error', title: t('devices.testNotSent') }
          : r.online
            ? { tone: 'success', title: t('devices.testSent', { name: label(d) }) }
            : { tone: 'info', title: t('devices.testOffline', { name: label(d) }) },
      ),
    onError: toastError,
  });
  const remove = useMutation({
    mutationFn: (d: DeviceDto) => api.del(`devices/${d.id}`),
    onSuccess: async () => {
      show({ tone: 'success', title: t('devices.removed') });
      setRemoving(null);
      await refresh();
      await qc.invalidateQueries({ queryKey: ['billing'] });
    },
    onError: toastError,
  });

  function open(target: 'add' | DeviceDto) {
    setFormError(null);
    setDraft(
      target === 'add'
        ? emptyDraft(locale)
        : { serialNumber: target.serialNumber, claimCode: '', name: target.name ?? '', outletId: target.outletId ?? '', locale: target.locale, volume: target.volume, announceReported: target.announceReported },
    );
    setMode(target);
  }

  const outletSelect = (props: { id: string }) => (
    <Select {...props} value={draft.outletId} onChange={(e) => setDraft({ ...draft, outletId: e.target.value })}>
      <option value="">{t('devices.allOutlets')}</option>
      {outlets.data?.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </Select>
  );

  return (
    <>
      <PageHeader
        title={t('devices.title')}
        subtitle={t('devices.subtitle')}
        actions={
          canManage ? (
            <Button icon={<Plus className="size-4" />} onClick={() => open('add')} data-testid="add-device">
              {t('devices.add')}
            </Button>
          ) : null
        }
      />
      {!canManage ? <Alert className="mb-4">{t('devices.readOnly')}</Alert> : null}

      {devices.isPending ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-56" />
          ))}
        </div>
      ) : devices.isError ? (
        <Card>
          <ErrorState title={t('common.somethingWrong')} message={errorText(devices.error, t)} onRetry={() => void devices.refetch()} retryLabel={t('common.retry')} />
        </Card>
      ) : devices.data.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Speaker className="size-6" />}
            title={t('devices.empty')}
            description={t('devices.emptyHint')}
            action={
              canManage ? (
                <Button icon={<Plus className="size-4" />} onClick={() => open('add')}>
                  {t('devices.add')}
                </Button>
              ) : null
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="devices">
          {devices.data.map((d) => (
            <Card key={d.id} className="flex flex-col p-5" data-testid="device-card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-ink">{label(d)}</p>
                  <p className="text-xs text-ink-3">
                    {d.serialNumber} · {d.model}
                  </p>
                </div>
                {d.status === 'DISABLED' ? (
                  <Badge tone="failed">{t('devices.disabled')}</Badge>
                ) : (
                  <span
                    className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium', d.online ? 'bg-success-50 text-success' : 'bg-surface text-ink-2')}
                    data-testid="device-online"
                    data-online={d.online}
                  >
                    <span className={cn('size-2 rounded-full', d.online ? 'bg-success' : 'bg-ink-3')} aria-hidden />
                    {d.online ? t('devices.online') : t('devices.offline')}
                  </span>
                )}
              </div>
              <dl className="mt-4 grid flex-1 grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <dt className="text-ink-3">{t('common.outlet')}</dt>
                <dd className="text-right font-medium text-ink">{outletName(d.outletId)}</dd>
                <dt className="text-ink-3">{t('devices.language')}</dt>
                <dd className="text-right font-medium text-ink">{LOCALE_LABELS[d.locale]}</dd>
                <dt className="flex items-center gap-1 text-ink-3">
                  <Volume2 className="size-3.5" aria-hidden />
                  {t('devices.volume')}
                </dt>
                <dd className="text-right font-medium text-ink tabular-nums">{d.volume}%</dd>
                {d.batteryPct !== null ? (
                  <>
                    <dt className="flex items-center gap-1 text-ink-3">
                      <BatteryMedium className="size-3.5" aria-hidden />
                      {t('devices.battery')}
                    </dt>
                    <dd className="text-right font-medium text-ink tabular-nums">{d.batteryPct}%</dd>
                  </>
                ) : null}
                {d.signalDbm !== null ? (
                  <>
                    <dt className="flex items-center gap-1 text-ink-3">
                      <Signal className="size-3.5" aria-hidden />
                      {t('devices.signal')}
                    </dt>
                    <dd className="text-right font-medium text-ink tabular-nums">{d.signalDbm} dBm</dd>
                  </>
                ) : null}
              </dl>
              <p className="mt-3 text-xs text-ink-3">
                {d.lastSeenAt ? t('devices.lastSeen', { time: dateTime(d.lastSeenAt, locale) }) : t('devices.neverSeen')}
                {d.firmware ? ` · ${t('devices.firmware')} ${d.firmware}` : ''}
              </p>
              {canManage && d.status !== 'DISABLED' ? (
                <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
                  <Button size="sm" icon={<Radio className="size-4" />} loading={test.isPending && test.variables?.id === d.id} onClick={() => test.mutate(d)} data-testid="test-device">
                    {t('devices.test')}
                  </Button>
                  <Button size="sm" variant="secondary" icon={<Settings2 className="size-4" />} onClick={() => open(d)}>
                    {t('devices.edit')}
                  </Button>
                  <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => setRemoving(d)}>
                    {t('devices.remove')}
                  </Button>
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={mode !== null}
        onClose={() => setMode(null)}
        title={mode === 'add' ? t('devices.addTitle') : t('devices.editTitle')}
        description={mode === 'add' ? t('devices.addHint') : undefined}
        closeLabel={t('common.close')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setMode(null)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" form="device-form" loading={save.isPending} disabled={mode === 'add' && (!draft.serialNumber.trim() || !draft.claimCode.trim())}>
              {mode === 'add' ? t('devices.add') : t('common.save')}
            </Button>
          </>
        }
      >
        <form
          id="device-form"
          className="space-y-4"
          noValidate
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            setFormError(null);
            save.mutate();
          }}
        >
          {mode === 'add' ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('devices.serial')}>
                {(p) => <Input {...p} autoComplete="off" placeholder="SBX-000123" value={draft.serialNumber} onChange={(e) => setDraft({ ...draft, serialNumber: e.target.value.toUpperCase() })} />}
              </Field>
              <Field label={t('devices.claimCode')}>
                {(p) => <Input {...p} autoComplete="off" placeholder="K7QF-2M9X" value={draft.claimCode} onChange={(e) => setDraft({ ...draft, claimCode: e.target.value.toUpperCase() })} />}
              </Field>
            </div>
          ) : null}
          <Field label={t('devices.name')}>
            {(p) => <Input {...p} maxLength={80} placeholder={t('devices.namePlaceholder')} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('devices.outlet')}>{(p) => outletSelect(p)}</Field>
            <Field label={t('devices.language')}>
              {(p) => (
                <Select {...p} value={draft.locale} onChange={(e) => setDraft({ ...draft, locale: e.target.value as Locale })}>
                  {(['km', 'en', 'zh'] as const).map((l) => (
                    <option key={l} value={l}>
                      {LOCALE_LABELS[l]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          {mode !== 'add' ? (
            <Field label={`${t('devices.volume')}: ${draft.volume}%`}>
              {(p) => (
                <input
                  {...p}
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  className="w-full accent-[#0759B8]"
                  value={draft.volume}
                  onChange={(e) => setDraft({ ...draft, volume: Number(e.target.value) })}
                />
              )}
            </Field>
          ) : null}
          {mode !== 'add' ? (
            <label className="flex items-start gap-2.5 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-[#0759B8]"
                checked={draft.announceReported}
                onChange={(e) => setDraft({ ...draft, announceReported: e.target.checked })}
                data-testid="announce-reported"
              />
              <span>
                <span className="block text-ink">{t('devices.announceReported')}</span>
                <span className="block text-xs text-ink-3">{t('devices.announceReportedHint')}</span>
              </span>
            </label>
          ) : null}
          {formError ? <Alert tone="error">{formError}</Alert> : null}
        </form>
      </Modal>

      <Modal
        open={!!removing}
        onClose={() => setRemoving(null)}
        title={removing ? t('devices.removeTitle', { name: label(removing) }) : ''}
        closeLabel={t('common.close')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemoving(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => removing && remove.mutate(removing)}>
              {t('devices.remove')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-2">{t('devices.removeText')}</p>
      </Modal>
    </>
  );
}
