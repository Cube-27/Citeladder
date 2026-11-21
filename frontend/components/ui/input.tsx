import type { ComponentPropsWithoutRef, ReactNode, Ref } from 'react';

import { Icon } from '@/components/ui/icon';
import type { IconGlyph } from '@/lib/icons';
import { cn } from '@/lib/utils';

/**
 * The field's edge (Input, SearchField, ChipInput, Textarea, DateField, the
 * composer): `panel` with a 1px `rule` edge that takes `control-line` on hover
 * and focus, where the focus ring joins it; an invalid field turns its edge
 * negative (globals.css `.focus-input`/`.focus-frame`).
 */
export const FIELD_EDGE =
  'bg-panel border border-rule hover:border-control-line [[data-public-surface]_&]:shadow-edge';

const FIELD_SHAPE =
  'type-body min-h-[var(--control-md)] w-full rounded-control px-3 text-ink transition-[background-color,border-color,outline-color] duration-[var(--motion-fast)]';

/** A form field's box: FIELD_EDGE, the control radius, at least `control-md` tall. */
export const FIELD_BOX = `${FIELD_EDGE} ${FIELD_SHAPE}`;

/**
 * A select or filter trigger (Select, FilterTrigger): a secondary button's
 * face (`raised`, `rule` edge, `raised-2` on hover or open) on the field's
 * shape. The website keeps its layered `.face`.
 */
export const TRIGGER_BOX = `face bg-raised border border-rule hover:bg-raised-2 data-[state=open]:bg-raised-2 ${FIELD_SHAPE}`;

/**
 * A field fills its column (`fill`) unless its role is narrower: `quantity`
 * is a small count beside the control that acts on it (4rem, centred,
 * tabular figures), so every quantity picker reads at one width.
 */
const inputWidths = {
  fill: '',
  quantity: 'w-16 text-center tabular-nums',
} as const;

/**
 * Input — the single-line text field. One form: 28px. Leading and trailing
 * content (a mono affix such as "https://", an icon, the end button) sits
 * inside the same frame.
 */
export function Input({
  className,
  containerClassName,
  startContent,
  endContent,
  endContentFlush = false,
  width = 'fill',
  ref,
  ...props
}: Readonly<
  Omit<ComponentPropsWithoutRef<'input'>, 'size' | 'width'> & {
    /** The field's width role; see `inputWidths`. */
    width?: keyof typeof inputWidths;
    /** Leading content inside the field box. */
    startContent?: ReactNode;
    /** Trailing content inside the field box. */
    endContent?: ReactNode;
    /** Let an interactive trailing target own most of the box's end padding. */
    endContentFlush?: boolean;
    /** Layout for the box; `className` continues to target the native input. */
    containerClassName?: string;
    ref?: Ref<HTMLInputElement>;
  }
>) {
  if (!startContent && !endContent) {
    // A bare field is its own box, so an adorned and a bare field given the
    // same layout render the same height.
    return (
      <input
        ref={ref}
        className={cn(
          'focus-input',
          FIELD_BOX,
          'placeholder:text-ink-2 disabled:cursor-not-allowed disabled:opacity-60',
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
      data-disabled={props.disabled || String(props['aria-disabled']) === 'true' || undefined}
      className={cn(
        'focus-frame flex items-center gap-2',
        FIELD_BOX,
        props.disabled && 'cursor-not-allowed opacity-60',
        endContentFlush && 'pe-1',
        containerClassName,
      )}
    >
      {startContent ? (
        <span className="type-caption flex shrink-0 items-center whitespace-nowrap tabular-nums">
          {startContent}
        </span>
      ) : null}
      <input
        ref={ref}
        className={cn(
          'placeholder:text-ink-2 type-body min-w-0 flex-1 self-stretch bg-transparent disabled:cursor-not-allowed',
          className,
        )}
        {...props}
      />
      {endContent ? (
        <span className="type-caption flex shrink-0 items-center whitespace-nowrap tabular-nums">
          {endContent}
        </span>
      ) : null}
    </div>
  );
}

/**
 * FieldEndButton — the one icon target at a field's end (clear a search,
 * reveal a password): SearchField's clear face, a 24px square (the minimum
 * target; its tap area 44 for touch) with the 16px glyph, `ink-2` until
 * hovered, its focus ring 1px out.
 * Pass it as an `Input`'s `endContent`. `label` is its accessible name.
 */
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
      className="focus-ring text-ink-2 enabled:hover:overlay-hover enabled:hover:text-ink rounded-mark hit-area grid size-[var(--target-min)] shrink-0 place-items-center transition-colors"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
    >
      <Icon icon={icon} />
    </button>
  );
}
