import type { ComponentType, ReactNode } from 'react';

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
  dim = false,
  muted = false,
  className,
}: Readonly<{
  icon: IconGlyph | BrandGlyph;
  label?: string;
  tone?: TextTone;
  dim?: boolean;
  muted?: boolean;
  className?: string;
}>) {
  return (
    <Glyph
      data-icon=""
      className={cn(
        'my-0.75 size-3.5 shrink-0',
        toneClass(tone),
        dim && 'opacity-dim',
        muted && 'opacity-muted',
        className,
      )}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
    />
  );
}

export function TitleMark({ children }: Readonly<{ children: ReactNode }>) {
  return <span className="h-title-line flex items-center">{children}</span>;
}
