'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { cn } from './cn';
import { Button, Card, Skeleton } from './primitives';

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'brand',
  loading,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: 'brand' | 'success' | 'pending' | 'failed';
  loading?: boolean;
}) {
  const iconTone = {
    brand: 'bg-brand-50 text-brand',
    success: 'bg-success-50 text-success',
    pending: 'bg-pending-50 text-pending',
    failed: 'bg-failed-50 text-failed',
  }[tone];
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-ink-2">{label}</p>
        {icon ? <div className={cn('grid size-9 shrink-0 place-items-center rounded-xl', iconTone)}>{icon}</div> : null}
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-8 w-32" />
      ) : (
        <p className="mt-2 text-2xl font-semibold tracking-tight text-ink tabular-nums">{value}</p>
      )}
      {hint ? <p className="mt-1 text-xs text-ink-3">{hint}</p> : null}
    </Card>
  );
}

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('w-full overflow-x-auto', className)}>
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">{children}</table>
    </div>
  );
}

export function Th({ className, ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      className={cn('border-b border-line bg-surface/60 px-4 py-3 text-xs font-semibold tracking-wide text-ink-2 uppercase', className)}
      {...rest}
    />
  );
}

export function Td({ className, ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('border-b border-line/70 px-4 py-3 align-middle text-ink', className)} {...rest} />;
}

export function TableSkeleton({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-3 p-5" aria-busy="true">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex gap-4">
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton key={c} className="h-5 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
  labels,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
  labels: { previous: string; next: string; summary: string };
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 text-sm text-ink-2">
      <span>{labels.summary}</span>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)} icon={<ChevronLeft className="size-4" />}>
          {labels.previous}
        </Button>
        <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          {labels.next}
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}

/** Segmented control for small option sets (date presets, tabs). */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
  ariaLabel,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className={cn('inline-flex flex-wrap rounded-xl bg-surface p-1', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
            o.value === value ? 'bg-white text-brand shadow-sm' : 'text-ink-2 hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
