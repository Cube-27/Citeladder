import type { ReactNode } from 'react';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';

import { Minus } from '@/lib/icons';
import { cn } from '@/lib/utils';

type VisibleCheckboxLabel = Exclude<ReactNode, null | undefined | boolean>;

type AccessibleCheckbox =
  | { label: VisibleCheckboxLabel; description?: ReactNode; 'aria-label'?: never }
  | { label?: never; description?: never; 'aria-label': string };

type CheckboxProps = AccessibleCheckbox & {
  checked: boolean | 'indeterminate';
  onCheckedChange: (checked: boolean | 'indeterminate') => void;
  disabled?: boolean;
  box?: keyof typeof BOX;
  nested?: boolean;
  id?: string;
  name?: string;
  required?: boolean;
  'aria-describedby'?: string;
};

const BOX = { wide: 'desktop:col-span-2', shrink: 'min-w-0', fill: 'min-w-0 flex-1' } as const;

const CHECK_BOX =
  'check-box press press-check isolate focus-ring bg-panel border-control-edge text-on-primary data-[state=checked]:border-primary data-[state=indeterminate]:border-primary hit-area grid size-check shrink-0 place-items-center rounded-mark border disabled:cursor-not-allowed';

const CHECK_STROKE = 3;
const DRAWN_LENGTH = 1;

function CheckMark({ on }: Readonly<{ on: boolean }>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={CHECK_STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-3"
      aria-hidden
    >
      <path
        pathLength={DRAWN_LENGTH}
        strokeDasharray={DRAWN_LENGTH}
        data-drawn={on || undefined}
        className="check-draw"
        d="M5 12l5 5l10 -10"
      />
    </svg>
  );
}

const CHECK_TARGET = 'inline-flex size-target shrink-0 items-center justify-center';

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
      <CheckboxPrimitive.Indicator forceMount className="grid place-items-center">
        {checked === 'indeterminate' ? (
          <Minus className="size-3 stroke-3" aria-hidden />
        ) : (
          <CheckMark on={checked === true} />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export function Checkbox({
  checked,
  onCheckedChange,
  label,
  description,
  disabled,
  box,
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

  const className = box && BOX[box];
  const control = (
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
    return <span className={cn(CHECK_TARGET, className)}>{control}</span>;
  }

  return (
    <label
      className={cn(
        'text-ink inline-flex cursor-pointer items-start gap-2 app:gap-3',
        disabled && 'cursor-not-allowed opacity-disabled',
        nested && 'ms-6',
        className,
      )}
    >
      <span className={cn(CHECK_TARGET, '-my-0.5 target-hit-fine')}>{control}</span>
      <span className="flex min-w-0 flex-col">
        <span className="text-body text-ink">{label}</span>
        {description != null ? <span className="text-body text-ink-2">{description}</span> : null}
      </span>
    </label>
  );
}
