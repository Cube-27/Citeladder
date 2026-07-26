import { cn } from '@/lib/utils';

/**
 * The Searchify mark: a lens with a lit centre — "observe, then show the
 * proof". Geometry is shared verbatim with the app wordmark so the two
 * surfaces stay one brand even though they run different design systems.
 */
export function BrandMark({ className }: Readonly<{ className?: string }>) {
  return (
    <span
      aria-hidden
      className={cn(
        'bg-mkt-ink text-mkt-surface grid size-7.5 shrink-0 place-items-center rounded-[0.5625rem]',
        className,
      )}
    >
      <svg viewBox="0 0 18 18" fill="none" className="size-[1.0625rem]">
        <circle cx="7" cy="7" r="4" stroke="currentColor" strokeWidth="1.6" />
        <path
          d="m10.1 10.1 4.7 4.7"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <circle cx="7" cy="7" r="1.45" className="fill-mkt-proof" />
      </svg>
    </span>
  );
}

/** Mark + wordmark. `as` keeps the single-h1 rule intact on every page. */
export function Wordmark({ className }: Readonly<{ className?: string }>) {
  return (
    <span
      className={cn(
        'font-mkt-display text-mkt-ink inline-flex items-center gap-2.5 text-[1.1875rem] font-bold tracking-[-0.04em]',
        className,
      )}
    >
      <BrandMark />
      Searchify
    </span>
  );
}
