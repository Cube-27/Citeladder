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

export function Icon({
  icon: Glyph,
  label,
  tone,
  muted = false,
  className,
}: Readonly<{
  icon: IconGlyph | BrandGlyph;
  label?: string;
  tone?: TextTone;
  muted?: boolean;
  className?: string;
}>) {
  return (
    <Glyph
      data-icon=""
      className={cn(
        'my-0.75 size-3.5 shrink-0',
        toneClass(tone),
        muted && 'opacity-muted',
        className,
      )}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
    />
  );
}
