import { useId, type ReactNode } from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';

import { TRIGGER_BOX } from '@/components/ui/input';
import { MENU_PANEL, menuItemClasses } from '@/components/ui/menu';
import { Check, ChevronDown, ChevronUp } from '@/lib/icons';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui/icon';

const EMPTY_VALUE = '__citeladder_empty_value__';

function shownValue(
  value: string | undefined,
  options: readonly { value: string }[],
): string | undefined {
  if (value === '' && !options.some((option) => option.value === '')) return '';
  return radixValue(value);
}

function radixValue(value: string | undefined): string | undefined {
  return value === '' ? EMPTY_VALUE : value;
}

type SelectOption<T extends string> = {
  value: T;
  label: ReactNode;
  detail?: string;
  description?: string;
  disabled?: boolean;
};

const SELECT_BOX = { fill: 'w-full', pager: 'w-20' } as const;

export type SelectProps<T extends string> = {
  value?: T;
  defaultValue?: T;
  onValueChange?: (value: T) => void;
  options: readonly SelectOption<T>[];
  placeholder?: string;
  ariaLabel: string;
  disabled?: boolean;
  invalid?: boolean;
  numeric?: boolean;
  'aria-invalid'?: boolean;
  box?: keyof typeof SELECT_BOX;
  id?: string;
  required?: boolean;
  'aria-describedby'?: string;
  'aria-labelledby'?: string;
};

export function Select<T extends string>({
  value,
  defaultValue,
  onValueChange,
  options,
  placeholder,
  ariaLabel,
  disabled,
  invalid,
  numeric = false,
  'aria-invalid': ariaInvalid,
  box,
  id,
  required,
  'aria-describedby': ariaDescribedBy,
  'aria-labelledby': ariaLabelledBy,
}: Readonly<SelectProps<T>>) {
  const detailId = useId();
  return (
    <SelectPrimitive.Root
      value={shownValue(value, options)}
      defaultValue={radixValue(defaultValue)}
      onValueChange={(next) => onValueChange?.((next === EMPTY_VALUE ? '' : next) as T)}
      disabled={disabled}
    >
      <SelectPrimitive.Trigger
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        aria-invalid={invalid || ariaInvalid || undefined}
        aria-required={required || undefined}
        id={id}
        className={cn(
          'focus-input press',
          TRIGGER_BOX,
          'data-[placeholder]:text-ink-placeholder flex w-auto min-w-0 items-center justify-between gap-2 text-start disabled:cursor-not-allowed disabled:opacity-disabled',
          box && SELECT_BOX[box],
          numeric && 'tabular-nums',
        )}
      >
        <span className="min-w-0 flex-1 truncate text-start">
          <SelectPrimitive.Value placeholder={placeholder} />
        </span>
        <SelectPrimitive.Icon asChild>
          <ChevronDown
            className="text-ink-2 app:text-ink-placeholder size-3.5 shrink-0"
            aria-hidden
          />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={6}
          collisionPadding={8}
          className={cn(
            MENU_PANEL,
            'max-h-select-max min-w-select-trigger [[data-public-surface]_&]:min-w-select-public',
          )}
        >
          <SelectPrimitive.ScrollUpButton className="text-ink-2 h-control-md flex items-center justify-center">
            <Icon icon={ChevronUp} size="flush" />
          </SelectPrimitive.ScrollUpButton>
          <SelectPrimitive.Viewport>
            {options.map((option, index) => (
              <SelectPrimitive.Item
                key={option.value}
                value={radixValue(option.value) ?? EMPTY_VALUE}
                disabled={option.disabled}
                aria-describedby={option.detail ? `${detailId}-${index}` : undefined}
                className={menuItemClasses({
                  className: cn('pe-8', option.description && 'min-h-12'),
                })}
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">
                    <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                  </span>
                  {option.description ? (
                    <span className="text-caption text-ink-2">{option.description}</span>
                  ) : null}
                </span>
                {option.detail ? (
                  <span
                    id={`${detailId}-${index}`}
                    className="text-caption text-ink-2 ms-auto tabular-nums"
                  >
                    {option.detail}
                  </span>
                ) : null}
                <SelectPrimitive.ItemIndicator className="absolute right-2 inline-flex items-center">
                  <Icon icon={Check} size="flush" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
          <SelectPrimitive.ScrollDownButton className="text-ink-2 h-control-md flex items-center justify-center">
            <Icon icon={ChevronDown} size="flush" />
          </SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
