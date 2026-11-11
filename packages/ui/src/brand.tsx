import { cn } from './cn';

/** One PayAlert mark: a payment "ping" inside a rounded tile. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cn('size-9', className)} aria-hidden>
      <defs>
        <linearGradient id="opa-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1670D5" />
          <stop offset="1" stopColor="#0759B8" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill="url(#opa-g)" />
      <circle cx="20" cy="20" r="6.5" fill="none" stroke="#fff" strokeWidth="3" />
      <path d="M9.5 20a10.5 10.5 0 0 1 10.5-10.5M30.5 20A10.5 10.5 0 0 1 20 30.5" fill="none" stroke="#fff" strokeOpacity=".55" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="20" cy="20" r="2.2" fill="#fff" />
    </svg>
  );
}

export function Logo({ className, tagline }: { className?: string; tagline?: string }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <LogoMark />
      <div className="leading-tight">
        <p className="text-[15px] font-bold tracking-tight text-ink">
          One <span className="text-brand">PayAlert</span>
        </p>
        {tagline ? <p className="text-[11px] text-ink-3">{tagline}</p> : null}
      </div>
    </div>
  );
}
