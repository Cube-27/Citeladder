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
        'bg-mkt-ink text-mkt-surface grid size-8 shrink-0 place-items-center rounded-md',
        className,
      )}
    >
      <svg viewBox="0 0 18 18" fill="none" className="size-4">
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
        'font-mkt-display text-mkt-ink text-mkt-mark inline-flex items-center gap-2.5',
        className,
      )}
    >
      <BrandMark />
      Searchify
    </span>
  );
}
