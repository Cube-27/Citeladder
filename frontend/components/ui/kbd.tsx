import { cn } from '@/lib/utils';

// The website keeps its `surface` cap with the `rule` ring.
const CAP =
  'bg-well text-ink-2 inline-flex h-5 min-w-5 items-center justify-center rounded-mark px-1 type-data-sm whitespace-nowrap normal-case [[data-public-surface]_&]:bg-surface [[data-public-surface]_&]:border [[data-public-surface]_&]:border-rule';

/**
 * Kbd — a keyboard key chip in the mono face: `well` with no border, 20px
 * tall, 12/16 `ink-2`. One key as `children` ("⌘K", "Esc"), or `keys`
 * for a combination drawn as separate chips. Never on an `ink` fill: a
 * tooltip prints its shortcut as plain mono text instead.
 */
export function Kbd({
  children,
  keys,
  className,
}: Readonly<{ children?: string; keys?: readonly string[]; className?: string }>) {
  if (keys && keys.length > 1) {
    return (
      <span className={cn('inline-flex items-center gap-1', className)}>
        {keys.map((key) => (
          <kbd key={key} className={CAP}>
            {key}
          </kbd>
        ))}
      </span>
    );
  }
  return <kbd className={cn(CAP, className)}>{keys?.[0] ?? children}</kbd>;
}
