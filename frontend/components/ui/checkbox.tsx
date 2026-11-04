'use client';

import type { ReactNode } from 'react';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check, Minus } from 'lucide-react';

import { cn } from '@/lib/utils';

type VisibleCheckboxLabel = Exclude<ReactNode, null | undefined | boolean>;

type AccessibleCheckbox =
  | { label: VisibleCheckboxLabel; 'aria-label'?: never }
  | { label?: never; 'aria-label': string };

export type CheckboxProps = AccessibleCheckbox & {
  checked: boolean | 'indeterminate';
  onCheckedChange: (checked: boolean | 'indeterminate') => void;
  disabled?: boolean;
  className?: string;
  /** A sub-option of the checkbox above it (a subtopic under its topic). */
  nested?: boolean;
  id?: string;
  name?: string;
  required?: boolean;
  'aria-describedby'?: string;
};

function checkboxStateClass(checked: boolean | 'indeterminate', disabled: boolean | undefined) {
  if (disabled) return 'border-line bg-surface-sunken text-ink-muted';
  return cn(
    'text-on-ink',
    checked ? 'border-ink bg-ink' : 'border-line-control bg-surface group-hover:border-ink-muted',
  );
}

export function Checkbox({
  checked,
  onCheckedChange,
  label,
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

  const boxStateClass = checkboxStateClass(checked, disabled);
  const control = (
    <CheckboxPrimitive.Root
      id={id}
      name={name}
      required={required}
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
      className="focus-ring group enabled:hover:bg-surface-sunken enabled:active:bg-surface-sunken disabled:bg-surface-sunken grid min-h-[var(--control-md)] min-w-[var(--control-md)] shrink-0 place-items-center rounded-md disabled:cursor-not-allowed"
    >
      <span
        className={cn(
          'grid size-4 place-items-center rounded-xs border transition-[background-color,border-color] duration-[var(--motion-fast)]',
          boxStateClass,
        )}
      >
        <CheckboxPrimitive.Indicator>
          {checked === 'indeterminate' ? (
            <Minus className="size-3" aria-hidden />
          ) : (
            <Check className="size-3" aria-hidden />
          )}
        </CheckboxPrimitive.Indicator>
      </span>
    </CheckboxPrimitive.Root>
  );

  if (label == null || typeof label === 'boolean') {
    return <span className={className}>{control}</span>;
  }

  return (
    <label
      className={cn(
        'type-body text-ink inline-flex items-center gap-2',
        // A sub-option sits one checkbox in from its parent, so the tree reads.
        nested && 'ms-6',
        className,
      )}
    >
      {control}
      <span className={cn(disabled && 'text-ink-muted')}>{label}</span>
    </label>
  );
}
