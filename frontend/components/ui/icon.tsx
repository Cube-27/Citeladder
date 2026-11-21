import type { ComponentPropsWithoutRef, ComponentType } from 'react';

import type { IconGlyph } from '@/lib/icons';
import { cn } from '@/lib/utils';

/**
 * What the atom hands a glyph: its box, its ink and its accessible name. A
 * library glyph takes these, and so does a brand glyph (`BrandGlyph`).
 */
type GlyphProps = Readonly<{
  className?: string;
  'aria-hidden'?: true;
  'aria-label'?: string;
  role?: 'img';
  'data-icon'?: '';
}>;

/**
 * A brand's own multi-colour mark drawn as an inline SVG (the Google "G" on
 * Continue with Google): a component that spreads `GlyphProps` onto its
 * `<svg>` and carries its own fills, so `Icon` sizes it like any glyph.
 */
export type BrandGlyph = ComponentType<GlyphProps>;

/**
 * Icon — a glyph at the product's one icon size, 14px: beside 14px text its
 * drawing stands about cap height, never taller than the text.
 *
 * The atom has one form: the caller picks the glyph and, through `className`,
 * its ink — never its size. Decorative by default; pass `label` when the
 * glyph alone carries meaning. A brand glyph takes the same box; its fills
 * are its own.
 *
 * The glyph occupies one 20px body line (3 above and below), so in a row
 * aligned to the top it sits centred on the first line of text beside it
 * without a per-call nudge.
 */
export function Icon({
  icon: Glyph,
  label,
  className,
}: Readonly<{ icon: IconGlyph | BrandGlyph; label?: string; className?: string }>) {
  return (
    <Glyph
      data-icon=""
      className={cn('my-0.75 size-3.5 shrink-0', className)}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
    />
  );
}

/**
 * Dot — the 6px status marker a badge carries, for a live or severity mark
 * beside text that is not a badge (a polling indicator, a list bullet). The
 * caller supplies the fill (`bg-info`) and any motion class; colour is never
 * the only signal, so the text beside it says the same thing.
 */
export function Dot({
  className,
  ...props
}: Readonly<Omit<ComponentPropsWithoutRef<'span'>, 'children'>>) {
  return (
    <span
      {...props}
      className={cn('inline-block size-1.5 shrink-0 rounded-full', className)}
      aria-hidden
    />
  );
}
