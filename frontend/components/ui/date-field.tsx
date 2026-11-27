import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu';
import { useId, useState } from 'react';

import { Calendar } from '@/components/ui/calendar';
import { fieldLabelId } from '@/components/ui/field';
import { FIELD_BOX } from '@/components/ui/input';
import { MENU_PANEL } from '@/components/ui/menu';
import { CalendarDays } from '@/lib/icons';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui/icon';

export function DateField({
  value,
  onChange,
  min,
  max,
  id,
  'aria-describedby': describedBy,
  'aria-invalid': ariaInvalid,
  invalid = false,
  disabled = false,
  className,
}: Readonly<{
  value: string;
  onChange: (iso: string) => void;
  min?: string;
  max?: string;
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  invalid?: boolean;
  disabled?: boolean;
  className?: string;
}>) {
  const [open, setOpen] = useState(false);
  const openId = useId();
  const labelId = fieldLabelId(id);
  const isInvalid = invalid || ariaInvalid === true;
  return (
    <div
      className={cn(
        'focus-frame flex items-center gap-2 pe-1',
        FIELD_BOX,
        disabled && 'cursor-not-allowed opacity-disabled',
        className,
      )}
    >
      <input
        id={id}
        type="text"
        inputMode="numeric"
        placeholder="YYYY-MM-DD"
        aria-describedby={describedBy}
        aria-invalid={isInvalid || undefined}
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="text-body text-ink placeholder:text-ink-placeholder min-w-0 flex-1 self-stretch bg-transparent tabular-nums disabled:cursor-not-allowed"
      />
      <DropdownPrimitive.Root open={open} onOpenChange={setOpen}>
        <DropdownPrimitive.Trigger asChild>
          <button
            type="button"
            aria-labelledby={`${labelId} ${openId}`}
            disabled={disabled}
            className="focus-ring text-ink-2 enabled:hover:text-ink not-data-[state=open]:enabled:hover:overlay-hover data-[state=open]:overlay-pressed data-[state=open]:text-ink rounded-mark hit-area size-target inline-flex shrink-0 items-center justify-center transition-colors"
          >
            <Icon icon={CalendarDays} size="flush" />
            <span id={openId} hidden>
              open calendar
            </span>
          </button>
        </DropdownPrimitive.Trigger>
        <DropdownPrimitive.Portal>
          <DropdownPrimitive.Content
            align="end"
            sideOffset={6}
            collisionPadding={8}
            className={cn(MENU_PANEL, 'p-2')}
          >
            <Calendar
              value={value}
              min={min}
              max={max}
              labelledBy={labelId}
              onSelect={(iso) => {
                onChange(iso);
                setOpen(false);
              }}
            />
          </DropdownPrimitive.Content>
        </DropdownPrimitive.Portal>
      </DropdownPrimitive.Root>
    </div>
  );
}
