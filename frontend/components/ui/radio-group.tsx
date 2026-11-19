import type { ReactNode } from 'react';
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';

import { cn } from '@/lib/utils';

export type RadioOption<T extends string> = {
  value: T;
  label: ReactNode;
  disabled?: boolean;
  description?: ReactNode;
};

/**
 * The 16px radio: a 1px `control-line` circle; selected is an `ink` disc with
 * a `surface` centre (an inset 4px ring), so the mark never changes size. Its
 * target is 24×24 (an invisible inset), never under the minimum. Hover
 * darkens an empty circle's edge; a held press scales it to 95%.
 */
const RADIO =
  'radio-dot press [--press:0.95] focus-ring bg-surface border-control-line data-[state=checked]:bg-ink data-[state=checked]:border-ink data-[state=checked]:ring-surface relative size-4 shrink-0 rounded-full border transition-[background-color,border-color,box-shadow] ring-inset before:absolute before:top-1/2 before:left-1/2 before:size-[var(--target-min)] before:-translate-1/2 before:content-[""] data-[state=checked]:ring-4 disabled:cursor-not-allowed';

const LIST_LAYOUT = {
  list: 'flex flex-col gap-3',
  inline: 'flex flex-row flex-wrap gap-x-6 gap-y-2',
} as const;

/**
 * RadioGroup — one choice from two to five options. `list` (default) stacks
 * the options 12px apart; `inline` sets short options on one wrapping row,
 * 24 apart (a form's facet such as Consumers, Businesses, Both); `cards` lays them out as selectable slips
 * (`surface`, a hairline, the control radius, 16px padding) for choices that
 * need a sentence each, the selected slip on the `well` tint with its edge in
 * `ink`, so it never resizes. Arrow keys move and select (Radix).
 */
export function RadioGroup<T extends string>({
  value,
  onValueChange,
  options,
  ariaLabel,
  className,
  variant = 'list',
  columns = 1,
}: Readonly<{
  value: T;
  onValueChange: (value: T) => void;
  options: readonly RadioOption<T>[];
  ariaLabel: string;
  className?: string;
  variant?: 'list' | 'inline' | 'cards';
  /** Cards per row. */
  columns?: 1 | 2 | 3;
}>) {
  return (
    <RadioGroupPrimitive.Root
      value={value}
      onValueChange={(next) => {
        const option = options.find((candidate) => candidate.value === next);
        if (option) onValueChange(option.value);
      }}
      aria-label={ariaLabel}
      data-radio-variant={variant}
      className={cn(
        variant === 'cards'
          ? cn(
              'grid gap-3',
              columns === 2 && 'column-split:grid-cols-2',
              columns === 3 && 'column-split:grid-cols-3',
            )
          : LIST_LAYOUT[variant],
        className,
      )}
    >
      {options.map((option) =>
        variant === 'cards' ? (
          <RadioCard key={option.value} option={option} selected={option.value === value} />
        ) : (
          <label
            key={option.value}
            className={cn(
              'text-ink inline-flex cursor-pointer items-start gap-2',
              option.disabled && 'cursor-not-allowed opacity-60',
            )}
          >
            {/* The 16px circle centres on the 20px first line. */}
            <RadioGroupPrimitive.Item
              value={option.value}
              disabled={option.disabled}
              className={cn(RADIO, 'mt-0.5')}
            />
            {radioText(option)}
          </label>
        ),
      )}
    </RadioGroupPrimitive.Root>
  );
}

/** The option's label (and description), the text that names its radio. */
function radioText<T extends string>(option: RadioOption<T>) {
  return (
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="type-body">{option.label}</span>
      {option.description != null ? (
        <span className="type-body text-ink-2">{option.description}</span>
      ) : null}
    </span>
  );
}

function RadioCard<T extends string>({
  option,
  selected,
}: Readonly<{ option: RadioOption<T>; selected: boolean }>) {
  return (
    <label
      className={cn(
        'text-ink flex cursor-pointer items-start gap-2 rounded-control border p-4 transition-[background-color,border-color]',
        selected ? 'bg-well border-control-line' : 'bg-surface border-rule',
        !selected && !option.disabled && 'hover:overlay-hover',
        option.disabled && 'cursor-not-allowed opacity-60',
      )}
    >
      <RadioGroupPrimitive.Item
        value={option.value}
        disabled={option.disabled}
        className={cn(RADIO, 'mt-0.5')}
      />
      {radioText(option)}
    </label>
  );
}
