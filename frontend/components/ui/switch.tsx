import { cn } from '@/lib/utils';

/**
 * Switch — an on/off control for a setting that takes effect at once: a
 * 40×20 round track, `control-line` off and `ink` on, with a 22×16 pill
 * thumb that slides over 300ms on the fluid ease (globals.css "Switch",
 * HeroUI v3), inside a target at least 24 tall. Focus is the 2px ring
 * around the track.
 *
 * A native `<button role="switch">`: the browser gives Space and Enter,
 * focus and disabled semantics; `aria-checked` carries the state.
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
        'switch-track focus-ring before:absolute before:-inset-y-0.5 before:inset-x-0 before:content-[""]',
        className,
      )}
    >
      <span aria-hidden className="switch-thumb" />
    </button>
  );
}
