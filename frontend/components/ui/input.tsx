import type { ComponentPropsWithoutRef, ReactNode, Ref } from 'react';

import { cn } from '@/lib/utils';

/**
 * Fields use the 36px field role (44px at compact/coarse widths). Plain and
 * adorned inputs share the same inset outline and halo through `focus-input`.
 *
 * The field text is `text-sm` (14/20), the product body default, so what the
 * user types reads as primary body text next to the labels above it. The
 * line-height fills the control's content box so a text selection highlights
 * the whole field, not a thin band behind the glyphs.
 *
 * The fill is the shared input surface, so the
 * field reads as an inset well on a white card. Hover deepens the
 * hairline to border-strong rather than tinting it accent: accent on hover
 * pre-empts the focus signal, which owns the accent on its own.
 */
export const inputClasses =
  'focus-input h-[var(--field-height)] w-full rounded-[var(--radius-control)] border border-border-strong bg-input px-2.5 text-sm text-foreground leading-[calc(var(--field-height)_-_2px)] transition-[border-color,box-shadow] placeholder:text-muted hover:border-border-bold aria-invalid:border-danger disabled:cursor-not-allowed disabled:opacity-50';

/**
 * The roomier field used on the standalone auth and onboarding screens, where a
 * form is the whole page rather than one control in a dense table.
 *
 * Large fields use the explicit 44px role.
 */
const inputSizes = {
  md: '',
  lg: 'h-[var(--field-height-lg)] px-3 leading-[calc(var(--field-height-lg)_-_2px)]',
} as const;

export function Input({
  className,
  containerClassName,
  startContent,
  endContent,
  size = 'md',
  ref,
  ...props
}: Readonly<
  Omit<ComponentPropsWithoutRef<'input'>, 'size'> & {
    size?: keyof typeof inputSizes;
    /** Leading content rendered inside the shared input frame. */
    startContent?: ReactNode;
    /** Trailing content rendered inside the shared input frame. */
    endContent?: ReactNode;
    /** Layout for the frame; `className` continues to target the native input. */
    containerClassName?: string;
    ref?: Ref<HTMLInputElement>;
  }
>) {
  if (!startContent && !endContent) {
    return <input ref={ref} className={cn(inputClasses, inputSizes[size], className)} {...props} />;
  }

  return (
    <div
      className={cn(
        'focus-frame border-border-strong bg-input has-[[aria-invalid=true]]:border-danger flex h-[var(--field-height)] w-full items-center gap-2 rounded-[var(--radius-control)] border px-2.5 transition-[border-color,box-shadow] hover:border-border-bold',
        size === 'lg' && 'h-[var(--field-height-lg)] px-3',
        props.disabled && 'cursor-not-allowed opacity-50',
        containerClassName,
      )}
    >
      {startContent ? (
        <span className="text-muted flex shrink-0 items-center">{startContent}</span>
      ) : null}
      <input
        ref={ref}
        className={cn(
          'placeholder:text-muted min-w-0 flex-1 self-stretch bg-transparent text-sm text-foreground outline-none disabled:cursor-not-allowed',
          // Match the frame's control height so selections fill the pill.
          size === 'lg'
            ? 'leading-[calc(var(--field-height-lg)_-_2px)]'
            : 'leading-[calc(var(--field-height)_-_2px)]',
          className,
        )}
        {...props}
      />
      {endContent ? <span className="flex shrink-0 items-center">{endContent}</span> : null}
    </div>
  );
}
