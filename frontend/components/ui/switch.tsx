'use client';

import { cn } from '@/lib/utils';

function switchTrackClass(checked: boolean, disabled: boolean) {
  if (disabled) return 'border-line bg-surface-sunken';
  return checked
    ? 'border-ink bg-ink group-hover:bg-ink-hover group-active:bg-ink-hover'
    : 'border-line-control bg-surface-sunken group-hover:bg-surface-sunken group-active:bg-surface-sunken';
}

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
  const trackStateClass = switchTrackClass(checked, disabled);
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
        'focus-ring group inline-grid min-h-[var(--control-md)] min-w-[var(--control-md)] shrink-0 place-items-center rounded-full',
        'disabled:cursor-not-allowed enabled:hover:bg-surface-sunken enabled:active:bg-surface-sunken',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'relative h-6 w-11 rounded-full border transition-colors duration-[var(--motion-normal)] ease-[var(--ease-standard)]',
          trackStateClass,
        )}
      >
        <span
          className={cn(
            'bg-surface border-line group-disabled:bg-ink-muted group-disabled:border-line absolute top-1/2 left-0.5 size-5 -translate-y-1/2 rounded-full border transition-transform duration-[var(--motion-normal)] ease-[var(--ease-standard)]',
            checked ? 'translate-x-5' : 'translate-x-px',
          )}
        />
      </span>
    </button>
  );
}
