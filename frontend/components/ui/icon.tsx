import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Icon — a glyph at the product's one icon size, 16px.
 *
 * Feature screens used to size their lucide glyphs at 12, 14 and 16 beside
 * the same 14px text, so an arrow next to a caption looked different from the
 * same arrow next to a label. The atom has one form: the caller picks the
 * glyph and, through `className`, its ink — never its size. Decorative by
 * default; pass `label` when the glyph alone carries meaning.
 */
export function Icon({
  icon: Glyph,
  label,
  className,
}: Readonly<{ icon: LucideIcon; label?: string; className?: string }>) {
  return (
    <Glyph
      className={cn('size-4 shrink-0', className)}
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
export function Dot({ className }: Readonly<{ className?: string }>) {
  return (
    <span className={cn('inline-block size-1.5 shrink-0 rounded-full', className)} aria-hidden />
  );
}
