import { cn } from '@/lib/utils';

/**
 * Switch — an on/off control for a setting that takes effect at once: a
 * 40×20 round track, `control-line` off and `ink` on, with a 22×16 pill
 * thumb that slides over 300ms on HeroUI v3's fluid ease; hover moves the
 * track a step toward the ground. Inside a target at least 24 tall. Focus
 * is the 2px ring around the track.
 *
 * A native `<button role="switch">`: the browser gives Space and Enter,
 * focus and disabled semantics; `aria-checked` carries the state.
 */
export function Switch({
  id,
  checked,
  onCheckedChange,
  label,
  describedBy,
  disabled = false,
  className,
}: Readonly<{
  /** Lets a visible `<label htmlFor>` toggle the switch. */
  id?: string;
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
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'focus-ring relative inline-flex h-5 w-10 shrink-0 items-center rounded-full transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)] before:absolute before:-inset-y-0.5 before:inset-x-0 before:content-[""] disabled:cursor-not-allowed disabled:opacity-50',
        checked
          ? 'bg-ink not-disabled:hover:bg-ink-hover'
          : 'bg-control-line not-disabled:hover:bg-control-edge',
        className,
      )}
    >
      {/* The thumb's checked shadow is in globals.css. */}
      <span
        aria-hidden
        className={cn(
          'ms-0.5 h-4 w-5.5 rounded-full transition-transform duration-[var(--motion-slide)] ease-[var(--ease-fluid)]',
          checked ? 'bg-on-ink translate-x-3.5' : 'bg-thumb shadow-control',
        )}
      />
    </button>
  );
}
