import type { ComponentType } from 'react';

import type { IconGlyph } from '@/lib/icons';
import { toneClass, type TextTone } from '@/components/ui/typography';
import { cn } from '@/lib/utils';

type GlyphProps = Readonly<{
  className?: string;
  'aria-hidden'?: true;
  'aria-label'?: string;
  role?: 'img';
  'data-icon'?: '';
}>;

export type BrandGlyph = ComponentType<GlyphProps>;

const ICON_SIZE = {
  text: 'my-0.75 size-3.5',
  field: 'my-0.5 size-4',
} as const;

export function Icon({
  icon: Glyph,
  label,
  tone,
  size = 'text',
  className,
}: Readonly<{
  icon: IconGlyph | BrandGlyph;
  label?: string;
  tone?: TextTone;
  size?: keyof typeof ICON_SIZE;
  className?: string;
}>) {
  return (
    <Glyph
      data-icon=""
      className={cn(ICON_SIZE[size], 'shrink-0', toneClass(tone), className)}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
    />
  );
}
