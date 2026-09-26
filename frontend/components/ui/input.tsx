import type { ComponentPropsWithoutRef, ReactNode, Ref } from 'react';

import { cn } from '@/lib/utils';

/**
 * Fields use the 36px field role (44px at compact/coarse widths). Plain and
 * adorned inputs share the same inset outline and halo through `focus-input`.
 *
 * The field text is `text-field` (16px in the product, 14px on public
 * surfaces), so what the user types reads as primary text next to the labels
 * above it. The
 * line-height fills the control's content box so a text selection highlights
 * the whole field, not a thin band behind the glyphs.
 *
 * The fill is the shared input surface, so the
 * field reads as an inset well on a white card. The edge is the shared
 * smudged shadow, not a drawn hairline; hover deepens the fuse slightly
 * rather than tinting it accent: accent on hover pre-empts the focus signal,
 * which owns the accent on its own.
 */
export const inputClasses =
  'focus-input h-[var(--field-height)] w-full rounded-[var(--radius-control)] shadow-smudge bg-input px-2.5 text-field text-foreground leading-[calc(var(--field-height)_-_2px)] transition-[box-shadow] placeholder:text-muted hover:shadow-smudge-hover aria-invalid:shadow-smudge-danger disabled:cursor-not-allowed disabled:opacity-50';

/**
 * The composer lift. For the one field that IS the page — a brief box, an
 * agent prompt — where the reader is meant to type before doing anything else.
 * It holds its deeper edge at rest and on hover, so it reads as the surface in
 * front rather than as one more control in a row. Focus still owns the accent.
 */
const raisedClasses = 'shadow-raised hover:shadow-raised';

/**
 * The roomier field used on the standalone auth and onboarding screens, where a
 * form is the whole page rather than one control in a dense table.
 *
 * Large fields use the explicit 44px role.
 */
const inputSizes = {
  md: '',
  compact: 'h-[var(--control-height-sm)] leading-[calc(var(--control-height-sm)_-_2px)]',
  lg: 'h-[var(--field-height-lg)] px-3 leading-[calc(var(--field-height-lg)_-_2px)]',
} as const;

const adornedLineHeights = {
  md: 'leading-[calc(var(--field-height)_-_2px)]',
  compact: 'leading-[calc(var(--control-height-sm)_-_2px)]',
  lg: 'leading-[calc(var(--field-height-lg)_-_2px)]',
} as const;

export function Input({
  className,
  containerClassName,
  startContent,
  endContent,
  endContentFlush = false,
  size = 'md',
  raised = false,
  ref,
  ...props
}: Readonly<
  Omit<ComponentPropsWithoutRef<'input'>, 'size'> & {
    size?: keyof typeof inputSizes;
    /** The composer treatment — for a field that is the point of its screen. */
    raised?: boolean;
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
    return (
      <input
        ref={ref}
        className={cn(inputClasses, inputSizes[size], raised && raisedClasses, className)}
        {...props}
      />
    );
  }

  return (
    <div
      className={cn(
        'focus-frame bg-input has-[[aria-invalid=true]]:shadow-smudge-danger flex h-[var(--field-height)] w-full items-center gap-2 rounded-[var(--radius-control)] px-2.5 shadow-smudge transition-[box-shadow] hover:shadow-smudge-hover',
        size === 'lg' && 'h-[var(--field-height-lg)] px-3',
        size === 'compact' && 'h-[var(--control-height-sm)]',
        raised && raisedClasses,
        props.disabled && 'cursor-not-allowed opacity-50',
        endContentFlush && 'pe-1',
        containerClassName,
      )}
    >
      {startContent ? (
        <span className="text-muted flex shrink-0 items-center">{startContent}</span>
      ) : null}
      <input
        ref={ref}
        className={cn(
          'placeholder:text-muted min-w-0 flex-1 self-stretch bg-transparent text-field text-foreground outline-none disabled:cursor-not-allowed',
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
