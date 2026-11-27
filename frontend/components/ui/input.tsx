import type { ComponentPropsWithoutRef, ReactNode, Ref } from 'react';

import { Icon } from '@/components/ui/icon';
import type { IconGlyph } from '@/lib/icons';
import { cn } from '@/lib/utils';

export const FIELD_EDGE =
  'bg-panel border border-transparent [[data-public-surface]_&]:bg-well app:shadow-field-face app:not-disabled:hover:bg-field-hover';

const FIELD_SHAPE =
  'text-body min-h-control-md w-full rounded-control px-3 text-ink transition-field duration-fast app:duration-fast';

export const FIELD_BOX = `${FIELD_EDGE} ${FIELD_SHAPE}`;

export const TRIGGER_BOX = `face bg-raised border border-transparent [[data-public-surface]_&]:bg-well hover:bg-raised-2 data-[state=open]:bg-raised-2 app:shadow-field-face app:not-disabled:hover:bg-field-hover ${FIELD_SHAPE}`;

const inputWidths = {
  fill: '',
  quantity: 'w-16 text-center tabular-nums',
} as const;

const INPUT_ROOM = {
  none: undefined,
  end: 'pe-9',
  both: 'pe-9 pl-10',
} as const;

export function Input({
  className,
  containerClassName,
  startContent,
  endContent,
  endContentFlush = false,
  width = 'fill',
  room = 'none',
  ref,
  ...props
}: Readonly<
  Omit<ComponentPropsWithoutRef<'input'>, 'size' | 'width'> & {
    width?: keyof typeof inputWidths;
    room?: keyof typeof INPUT_ROOM;
    startContent?: ReactNode;
    endContent?: ReactNode;
    endContentFlush?: boolean;
    containerClassName?: string;
    ref?: Ref<HTMLInputElement>;
  }
>) {
  if (!startContent && !endContent) {
    return (
      <input
        ref={ref}
        className={cn(
          'focus-input',
          FIELD_BOX,
          'placeholder:text-ink-placeholder disabled:cursor-not-allowed disabled:bg-raised-2 disabled:text-ink-2 app:disabled:opacity-disabled',
          inputWidths[width],
          containerClassName,
          className,
          INPUT_ROOM[room],
        )}
        {...props}
      />
    );
  }

  return (
    <div
      data-disabled={props.disabled || String(props['aria-disabled']) === 'true' || undefined}
      className={cn(
        'focus-frame flex items-center gap-2',
        FIELD_BOX,
        props.disabled && 'cursor-not-allowed opacity-disabled',
        endContentFlush && 'pe-1',
        containerClassName,
      )}
    >
      {startContent ? (
        <span className="text-caption text-ink-2 flex shrink-0 items-center whitespace-nowrap tabular-nums">
          {startContent}
        </span>
      ) : null}
      <input
        ref={ref}
        className={cn(
          'placeholder:text-ink-placeholder text-body text-ink min-w-0 flex-1 self-stretch bg-transparent disabled:cursor-not-allowed',
          className,
        )}
        {...props}
      />
      {endContent ? (
        <span className="text-caption text-ink-2 flex shrink-0 items-center whitespace-nowrap tabular-nums">
          {endContent}
        </span>
      ) : null}
    </div>
  );
}

export function FieldEndButton({
  icon,
  label,
  onClick,
  disabled,
}: Readonly<{
  icon: IconGlyph;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}>) {
  return (
    <button
      type="button"
      data-field-end-target=""
      className="focus-ring text-ink-2 enabled:hover:overlay-hover enabled:hover:text-ink rounded-mark hit-area size-target grid shrink-0 place-items-center transition-colors"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
    >
      <Icon icon={icon} />
    </button>
  );
}
