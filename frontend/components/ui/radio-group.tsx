'use client';

import type { ReactNode } from 'react';
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import { Check } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Tooltip } from './tooltip';
import { buttonVariants } from '@/components/ui/button-variants';

export type RadioOption<T extends string> = {
  value: T;
  label: ReactNode;
  disabled?: boolean;
  description?: ReactNode;
  groupLabel?: string;
};

export function RadioGroup<T extends string>({
  value,
  onValueChange,
  options,
  ariaLabel,
  className,
  variant = 'standard',
}: Readonly<{
  value: T;
  onValueChange: (value: T) => void;
  options: readonly RadioOption<T>[];
  ariaLabel: string;
  className?: string;
  /**
   * `row` is the ruled-list answer: one full-width row per option, hung
   * between hairlines. For questions whose options are sentences rather than
   * words — a wrapping row of chips turns one long label into a two-line box
   * beside a set of small ones, and the set stops reading as a set.
   */
  variant?: 'standard' | 'chip' | 'row';
}>) {
  if (variant === 'row') {
    return (
      <RadioGroupPrimitive.Root
        value={value}
        onValueChange={(next) => onValueChange(next as T)}
        aria-label={ariaLabel}
        data-radio-variant="row"
        className={cn('border-line divide-line grid divide-y border-y', className)}
      >
        {options.map((option) => (
          <RadioRow key={option.value} option={option} />
        ))}
      </RadioGroupPrimitive.Root>
    );
  }
  return (
    <RadioGroupPrimitive.Root
      value={value}
      onValueChange={(next) => onValueChange(next as T)}
      aria-label={ariaLabel}
      data-radio-variant={variant}
      className={cn(
        variant === 'chip' ? 'flex flex-wrap items-center gap-2' : 'grid gap-2',
        className,
      )}
    >
      {variant === 'chip' ? (
        <RadioChips options={options} />
      ) : (
        options.map((option) => (
          <label
            key={option.value}
            className="type-body text-ink inline-flex min-h-[var(--control-md)] items-center gap-2"
          >
            <RadioGroupPrimitive.Item
              value={option.value}
              disabled={option.disabled}
              className="focus-ring group border-line-control bg-surface enabled:hover:border-ink-muted enabled:active:bg-surface-sunken data-[state=checked]:border-ink disabled:bg-surface-sunken disabled:text-ink-muted disabled:border-line data-[state=checked]:disabled:border-line grid size-4 shrink-0 place-items-center rounded-full border"
            >
              <RadioGroupPrimitive.Indicator>
                <span className="bg-ink group-disabled:bg-ink-muted block size-2 rounded-full" />
              </RadioGroupPrimitive.Indicator>
            </RadioGroupPrimitive.Item>
            <span className={cn(option.disabled && 'text-ink-muted')}>{option.label}</span>
          </label>
        ))
      )}
    </RadioGroupPrimitive.Root>
  );
}

/** One option of a `row` group: the label, and the mark that answers it. */
function RadioRow<T extends string>({ option }: Readonly<{ option: RadioOption<T> }>) {
  return (
    <RadioGroupPrimitive.Item
      value={option.value}
      disabled={option.disabled}
      className="group focus-ring enabled:hover:bg-surface-sunken enabled:active:bg-surface-sunken data-[state=checked]:bg-surface-sunken data-[state=checked]:enabled:hover:bg-surface-sunken data-[state=checked]:disabled:bg-surface-sunken text-ink type-control disabled:bg-surface-sunken disabled:text-ink-muted disabled:border-line data-[state=checked]:disabled:border-line flex min-h-[var(--menu-item-height)] w-full items-center justify-between gap-3 rounded-md px-2 text-left disabled:cursor-not-allowed"
    >
      <span className="min-w-0">{option.label}</span>
      <span
        aria-hidden
        className="border-line group-data-[state=checked]:border-ink group-disabled:border-line group-data-[state=checked]:group-disabled:border-line grid size-4 shrink-0 place-items-center rounded-full border"
      >
        <RadioGroupPrimitive.Indicator>
          <span className="bg-ink group-disabled:bg-ink-muted block size-2 rounded-full" />
        </RadioGroupPrimitive.Indicator>
      </span>
    </RadioGroupPrimitive.Item>
  );
}

function RadioChips<T extends string>({
  options,
}: Readonly<{ options: readonly RadioOption<T>[] }>) {
  const grouped = options.some((option) => option.groupLabel);
  if (!grouped) return options.map((option) => <RadioChip key={option.value} option={option} />);

  const groups = new Map<string, RadioOption<T>[]>();
  for (const option of options) {
    const label = option.groupLabel ?? '';
    groups.set(label, [...(groups.get(label) ?? []), option]);
  }
  return [...groups.entries()].map(([label, groupOptions]) => (
    <div key={label} className="flex w-full flex-wrap items-center gap-2">
      <span className="type-label w-20 shrink-0">{label}</span>
      {groupOptions.map((option) => (
        <RadioChip key={option.value} option={option} />
      ))}
    </div>
  ));
}

function RadioChip<T extends string>({ option }: Readonly<{ option: RadioOption<T> }>) {
  const item = (
    <RadioGroupPrimitive.Item
      value={option.value}
      disabled={option.disabled}
      // A chip the user clicks is a control: the 32px secondary button face.
      className={cn(
        buttonVariants({ variant: 'secondary' }),
        'data-[state=checked]:bg-surface-sunken data-[state=checked]:text-ink data-[state=checked]:enabled:hover:bg-surface-sunken data-[state=checked]:disabled:bg-surface-sunken data-[state=checked]:disabled:text-ink-muted disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-muted disabled:border-line data-[state=checked]:disabled:border-line',
      )}
    >
      <span aria-hidden className="grid size-3.5 shrink-0 place-items-center">
        <RadioGroupPrimitive.Indicator>
          <Check className="size-3.5" />
        </RadioGroupPrimitive.Indicator>
      </span>
      <span>{option.label}</span>
    </RadioGroupPrimitive.Item>
  );
  return option.description ? <Tooltip content={option.description}>{item}</Tooltip> : item;
}
