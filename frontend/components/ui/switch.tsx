'use client';

import { cn } from '@/lib/utils';

/**
 * A two-state toggle.
 *
 * A native `<button role="switch">` rather than a checkbox or a custom
 * widget: the browser already gives Space and Enter activation, focus, and
 * disabled semantics, so there is no key handler here to get wrong. `aria-checked`
 * carries the state; screen readers announce the change without a live region.
 *
 * This is NOT the segmented control. That primitive is a radiogroup for
 * choosing among peers; this is one binary switch with a label.
 */
export function Switch({
  checked,
  onCheckedChange,
  label,
  describedBy,
  disabled = false,
  className,
}: Readonly<{
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** The accessible name. Rendered by the caller if it should also be visible. */
  label: string;
  describedBy?: string;
  disabled?: boolean;
  className?: string;
}>) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'focus-ring border-mkt-line inline-flex h-6 w-12 shrink-0 items-center rounded-full border',
        'transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60',
        checked ? 'bg-mkt-proof' : 'bg-mkt-wash',
        className,
      )}
    >
      {/* The thumb rests inside the track — it is not a floating surface, so
          it carries no elevation (docs/design.md §4a). */}
      <span
        aria-hidden
        className={cn(
          'bg-mkt-surface border-mkt-line size-4 rounded-full border transition-transform duration-150',
          checked ? 'translate-x-6' : 'translate-x-1',
        )}
      />
    </button>
  );
}
