import type { ReactNode } from 'react';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';

import { Minus } from '@/lib/icons';
import { cn } from '@/lib/utils';

type VisibleCheckboxLabel = Exclude<ReactNode, null | undefined | boolean>;

type AccessibleCheckbox =
  | { label: VisibleCheckboxLabel; description?: ReactNode; 'aria-label'?: never }
  | { label?: never; description?: never; 'aria-label': string };

export type CheckboxProps = AccessibleCheckbox & {
  checked: boolean | 'indeterminate';
  onCheckedChange: (checked: boolean | 'indeterminate') => void;
  disabled?: boolean;
  className?: string;
  /** A child of a "select all" checkbox above it, indented by `space-6`. */
  nested?: boolean;
  id?: string;
  name?: string;
  required?: boolean;
  'aria-describedby'?: string;
};

/**
 * The 16px box: a field's face (`panel`, `rule` edge, `control-line` on
 * hover), radius 4; checked and indeterminate are an `ink` fill with an
 * `on-ink` check or dash. The fill scales in and the check draws itself; a held
 * press scales the box to 92% (the fill is in globals.css). It is drawn
 * centred in a 24×24 target (`CHECK_TARGET`), so the target is never under
 * 24. Shared with the table's row checkbox.
 */
const CHECK_BOX =
  'check-box press [--press:0.92] isolate focus-ring bg-panel border-rule enabled:data-[state=unchecked]:hover:border-control-line text-on-ink data-[state=checked]:border-ink data-[state=indeterminate]:border-ink hit-area grid size-4 shrink-0 place-items-center rounded-mark border disabled:cursor-not-allowed';

/** Draws the check over 150ms, 15ms after the fill starts (HeroUI v3). */
const CHECK_DRAW = 'stroke-dashoffset 150ms linear 15ms';

/** Tabler's check on a unit path length, so its stroke draws on and off. */
function CheckMark({ on }: Readonly<{ on: boolean }>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-3"
      aria-hidden
    >
      <path
        pathLength={1}
        strokeDasharray={1}
        style={{ strokeDashoffset: on ? 0 : 1, transition: CHECK_DRAW }}
        d="M5 12l5 5l10 -10"
      />
    </svg>
  );
}

/** The 24×24 box the 16px control centres in, on the first 20px text line. */
const CHECK_TARGET = 'inline-flex size-[var(--target-min)] shrink-0 items-center justify-center';

function Box({
  checked,
  onCheckedChange,
  disabled,
  id,
  name,
  required,
  ariaLabel,
  ariaDescribedBy,
}: Readonly<{
  checked: boolean | 'indeterminate';
  onCheckedChange: (checked: boolean | 'indeterminate') => void;
  disabled?: boolean;
  id?: string;
  name?: string;
  required?: boolean;
  ariaLabel?: string;
  ariaDescribedBy?: string;
}>) {
  return (
    <CheckboxPrimitive.Root
      id={id}
      name={name}
      required={required}
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
      className={CHECK_BOX}
    >
      {/* Always mounted, so the check can draw on and off. */}
      <CheckboxPrimitive.Indicator forceMount className="grid place-items-center">
        {checked === 'indeterminate' ? (
          <Minus className="size-3 [stroke-width:3]" aria-hidden />
        ) : (
          <CheckMark on={checked === true} />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

/**
 * Checkbox — the 16px box in its 24px target with a label (`body`) and an
 * optional description below it in `ink-2`. The whole row is the click
 * target; focus is the 2px ring on the box. Disabled is 60%, with the reason
 * in the description.
 */
export function Checkbox({
  checked,
  onCheckedChange,
  label,
  description,
  disabled,
  className,
  nested = false,
  id,
  name,
  required,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
}: Readonly<CheckboxProps>) {
  if ((label == null || typeof label === 'boolean') && !ariaLabel) {
    throw new Error('Checkbox requires a visible label or aria-label.');
  }

  const box = (
    <Box
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      id={id}
      name={name}
      required={required}
      ariaLabel={ariaLabel}
      ariaDescribedBy={ariaDescribedBy}
    />
  );

  if (label == null || typeof label === 'boolean') {
    return <span className={cn(CHECK_TARGET, className)}>{box}</span>;
  }

  return (
    <label
      className={cn(
        'text-ink inline-flex cursor-pointer items-start gap-2',
        disabled && 'cursor-not-allowed opacity-60',
        nested && 'ms-6',
        className,
      )}
    >
      {/* The label row is the tap target, so the box's own area stays 24 and never covers a stacked neighbour. */}
      <span className={cn(CHECK_TARGET, '-my-0.5 [--target-hit:var(--target-min)]')}>{box}</span>
      <span className="flex min-w-0 flex-col">
        <span className="type-body">{label}</span>
        {description != null ? <span className="type-body text-ink-2">{description}</span> : null}
      </span>
    </label>
  );
}
