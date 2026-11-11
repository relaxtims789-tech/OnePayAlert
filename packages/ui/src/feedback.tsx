'use client';

import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from './cn';
import { Button } from './primitives';

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      {icon ? <div className="mb-3 grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand">{icon}</div> : null}
      <p className="font-semibold text-ink">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-sm text-ink-2">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title,
  message,
  onRetry,
  retryLabel,
  className,
}: {
  title: ReactNode;
  message?: ReactNode;
  onRetry?: () => void;
  retryLabel?: ReactNode;
  className?: string;
}) {
  return (
    <div role="alert" className={cn('flex flex-col items-center justify-center px-6 py-10 text-center', className)}>
      <div className="mb-3 grid size-12 place-items-center rounded-2xl bg-failed-50 text-failed">
        <AlertTriangle className="size-6" aria-hidden />
      </div>
      <p className="font-semibold text-ink">{title}</p>
      {message ? <p className="mt-1 max-w-sm text-sm text-ink-2">{message}</p> : null}
      {onRetry ? (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
          {retryLabel ?? 'Retry'}
        </Button>
      ) : null}
    </div>
  );
}

export function Alert({ tone = 'info', children, className }: { tone?: 'info' | 'warning' | 'error' | 'success'; children: ReactNode; className?: string }) {
  const styles = {
    info: 'bg-info-50 text-brand border-brand-100',
    warning: 'bg-pending-50 text-orange-800 border-orange-200',
    error: 'bg-failed-50 text-failed border-red-200',
    success: 'bg-success-50 text-green-800 border-green-200',
  }[tone];
  const Icon = { info: Info, warning: AlertTriangle, error: XCircle, success: CheckCircle2 }[tone];
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cn('flex gap-2.5 rounded-xl border px-3.5 py-3 text-sm', styles, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Accessible modal dialog: focus moves in, Escape closes, background scroll is locked. */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  closeLabel = 'Close',
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  closeLabel?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const first = panel.current?.querySelector<HTMLElement>('input,select,textarea,button:not([data-close])');
    (first ?? panel.current)?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;
  const width = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' }[size];
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={cn(
          'relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl bg-white shadow-pop sm:rounded-3xl',
          width,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-ink">{title}</h2>
            {description ? <p className="mt-0.5 text-sm text-ink-2">{description}</p> : null}
          </div>
          <button
            data-close
            type="button"
            onClick={onClose}
            className="-mr-1 rounded-lg p-1.5 text-ink-3 hover:bg-surface hover:text-ink"
            aria-label={closeLabel}
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3.5">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

type ToastTone = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  tone: ToastTone;
  title: ReactNode;
  description?: ReactNode;
}
interface ToastApi {
  show: (t: Omit<ToastItem, 'id'>) => void;
}
const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const show = useCallback((t: Omit<ToastItem, 'id'>) => {
    const id = nextId.current++;
    setItems((prev) => [...prev.slice(-3), { ...t, id }]);
    setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== id)), 5000);
  }, []);
  const api = useMemo(() => ({ show }), [show]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-4 sm:items-end">
        {items.map((t) => {
          const Icon = t.tone === 'success' ? CheckCircle2 : t.tone === 'error' ? XCircle : Info;
          return (
            <div
              key={t.id}
              role={t.tone === 'error' ? 'alert' : 'status'}
              className="pointer-events-auto flex w-full max-w-sm gap-3 rounded-2xl border border-line bg-white px-4 py-3 shadow-pop"
            >
              <Icon
                className={cn('mt-0.5 size-5 shrink-0', t.tone === 'success' ? 'text-success' : t.tone === 'error' ? 'text-failed' : 'text-brand')}
                aria-hidden
              />
              <div className="min-w-0 text-sm">
                <p className="font-medium text-ink">{t.title}</p>
                {t.description ? <p className="mt-0.5 text-ink-2">{t.description}</p> : null}
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
