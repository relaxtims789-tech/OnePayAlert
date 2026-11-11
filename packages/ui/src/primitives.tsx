'use client';

import { Loader2 } from 'lucide-react';
import {
  forwardRef,
  useId,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import { cn } from './cn';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-hover shadow-sm',
  secondary: 'bg-white text-ink border border-line hover:bg-surface',
  ghost: 'text-ink-2 hover:bg-surface hover:text-ink',
  danger: 'bg-failed text-white hover:bg-red-700',
};
const buttonSizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-5 text-base gap-2',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-xl font-medium transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-60',
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

const fieldBase =
  'w-full rounded-xl border border-line bg-white px-3.5 text-sm text-ink placeholder:text-ink-3 ' +
  'transition-colors focus:border-brand-2 focus:outline-none focus:ring-3 focus:ring-brand-100 ' +
  'disabled:bg-surface disabled:text-ink-3 aria-invalid:border-failed';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} className={cn(fieldBase, 'h-11', className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...rest },
  ref,
) {
  return (
    <select ref={ref} className={cn(fieldBase, 'h-11 pr-8', className)} {...rest}>
      {children}
    </select>
  );
});

export interface FieldProps {
  label: ReactNode;
  error?: string | null;
  hint?: ReactNode;
  children: (props: { id: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }) => ReactNode;
  className?: string;
}

/** Label + control + error/hint, wired for accessibility. */
export function Field({ label, error, hint, children, className }: FieldProps) {
  const id = useId();
  const msgId = `${id}-msg`;
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className="block text-sm font-medium text-ink">
        {label}
      </label>
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': error || hint ? msgId : undefined })}
      {error ? (
        <p id={msgId} className="text-xs text-failed" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={msgId} className="text-xs text-ink-3">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-card border border-line/70 bg-card shadow-card', className)} {...rest} />;
}

export function CardHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3 px-5 pt-5', className)}>
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-sm text-ink-2">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export type Tone = 'success' | 'pending' | 'failed' | 'neutral' | 'brand';
const tones: Record<Tone, string> = {
  success: 'bg-success-50 text-success',
  pending: 'bg-pending-50 text-pending',
  failed: 'bg-failed-50 text-failed',
  neutral: 'bg-surface text-ink-2',
  brand: 'bg-brand-50 text-brand',
};

export function Badge({ tone = 'neutral', className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap', tones[tone], className)}
    >
      {children}
    </span>
  );
}

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <span role="status" className={cn('inline-flex items-center gap-2 text-ink-2', className)}>
      <Loader2 className="size-5 animate-spin text-brand" aria-hidden />
      {label ? <span className="text-sm">{label}</span> : <span className="sr-only">Loading</span>}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-lg bg-line/60', className)} />;
}
