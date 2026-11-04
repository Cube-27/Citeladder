import type { ComponentPropsWithoutRef, ReactNode, Ref } from 'react';
import type { LucideIcon } from 'lucide-react';

import { Icon } from '@/components/ui/icon';
import { Pressable } from '@/components/ui/pressable';
import { cn } from '@/lib/utils';

/** Fields share a hairline boundary whose colour shows keyboard focus. */
const inputClasses =
  'focus-input h-[var(--control-md)] w-full rounded-md border border-line-control bg-surface px-3 text-body-sm text-ink leading-[calc(var(--control-md)_-_2px)] transition-[border-color,background-color] placeholder:text-ink-muted enabled:hover:border-ink-muted aria-invalid:border-negative aria-invalid:enabled:hover:border-negative disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-muted disabled:border-line';

/**
 * The roomier field of the public website's forms. The product field —
 * onboarding included — is the 32px `md` everywhere; `lg` is the website's
 * rung only. Account access composes the 44px `FlowInput` (flow-controls.tsx).
 */
const inputSizes = {
  md: '',
  lg: 'h-[var(--control-md)] px-3 leading-[calc(var(--control-md)_-_2px)]',
} as const;

/**
 * A field fills its column (`fill`) unless its role is narrower: `quantity`
 * is a small count beside the control that acts on it (4rem, centred,
 * tabular figures), so every quantity picker reads at one width.
 */
const inputWidths = {
  fill: '',
  quantity: 'w-16 text-center tabular-nums',
} as const;

const adornedLineHeights = {
  md: 'leading-[calc(var(--control-md)_-_2px)]',
  lg: 'leading-[calc(var(--control-md)_-_2px)]',
} as const;

export function Input({
  className,
  containerClassName,
  startContent,
  endContent,
  endContentFlush = false,
  size = 'md',
  width = 'fill',
  ref,
  ...props
}: Readonly<
  Omit<ComponentPropsWithoutRef<'input'>, 'size' | 'width'> & {
    size?: keyof typeof inputSizes;
    /** The field's width role; see `inputWidths`. */
    width?: keyof typeof inputWidths;
    /** Leading content rendered inside the shared input frame. */
    startContent?: ReactNode;
    /** Trailing content rendered inside the shared input frame. */
    endContent?: ReactNode;
    /** Let an interactive trailing target own most of the frame's end padding. */
    endContentFlush?: boolean;
    /** Layout for the frame; `className` continues to target the native input. */
    containerClassName?: string;
    ref?: Ref<HTMLInputElement>;
  }
>) {
  if (!startContent && !endContent) {
    // A bare field is its own frame, so the frame's layout applies to it too:
    // an adorned and a bare field given the same frame render the same height.
    return (
      <input
        ref={ref}
        className={cn(
          inputClasses,
          inputSizes[size],
          inputWidths[width],
          containerClassName,
          className,
        )}
        {...props}
      />
    );
  }

  return (
    <div
      className={cn(
        'focus-frame bg-surface has-[[aria-invalid=true]]:border-negative has-[[aria-invalid=true]]:has-[:enabled]:hover:border-negative flex h-[var(--control-md)] w-full items-center gap-2 rounded-md px-3 border border-line-control transition-[border-color,background-color] has-[:enabled]:hover:border-ink-muted',
        size === 'lg' && 'h-[var(--control-md)] px-3',
        props.disabled && 'cursor-not-allowed bg-surface-sunken text-ink-muted border-line',
        endContentFlush && 'pe-1',
        containerClassName,
      )}
    >
      {startContent ? (
        <span className="text-ink-muted flex shrink-0 items-center">{startContent}</span>
      ) : null}
      <input
        ref={ref}
        className={cn(
          'placeholder:text-ink-muted min-w-0 flex-1 self-stretch bg-transparent text-body-sm text-ink disabled:cursor-not-allowed disabled:text-ink-muted',
          // Match the frame's control height so selections fill the pill.
          adornedLineHeights[size],
          className,
        )}
        {...props}
      />
      {endContent ? <span className="flex shrink-0 items-center">{endContent}</span> : null}
    </div>
  );
}

/**
 * FieldEndButton — the one icon target at a field's end (clear a search,
 * reveal a password): the field's height less its 2px inset, the control
 * radius, the neutral hover and pressed tints and the 16px `Icon`. Pass it as
 * an `Input`'s `endContent` with `endContentFlush`, so the target owns the
 * frame's end padding. `label` is its accessible name.
 */
export function FieldEndButton({
  icon,
  label,
  onClick,
  disabled,
}: Readonly<{
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}>) {
  return (
    <Pressable
      data-field-end-target=""
      className="text-ink-muted enabled:hover:bg-surface-sunken enabled:hover:text-ink enabled:active:bg-surface-sunken grid size-[var(--field-end-target)] place-items-center"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
    >
      <Icon icon={icon} />
    </Pressable>
  );
}
