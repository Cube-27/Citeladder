import type { ReactNode } from 'react';

import type { IconGlyph } from '@/lib/icons';
import { TEXT_TONE_CLASS, type TextTone } from '@/components/ui/text-role';
import { cn } from '@/lib/utils';

const ICON_SIZE = {
  text: 'my-0.75 size-3.5',
  field: 'my-0.5 size-4',
} as const;

export function Icon({
  icon: Glyph,
  label,
  tone,
  size = 'text',
  muted = false,
  dim = false,
  flipOnOpen = false,
  flip,
  revealOnHover = false,
  className,
}: Readonly<{
  icon: IconGlyph;
  label?: string;
  tone?: TextTone;
  size?: keyof typeof ICON_SIZE;
  muted?: boolean;
  dim?: boolean;
  flipOnOpen?: boolean;
  flip?: boolean;
  revealOnHover?: boolean;
  className?: string;
}>) {
  return (
    <Glyph
      data-icon=""
      className={cn(
        ICON_SIZE[size],
        'shrink-0',
        tone && TEXT_TONE_CLASS[tone],
        muted && 'opacity-muted',
        dim && 'opacity-dim',
        flipOnOpen &&
          'transition-transform group-data-[state=open]:rotate-180 motion-reduce:transition-none',
        flip !== undefined && 'transition-transform',
        flip && 'rotate-180',
        revealOnHover && 'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100',
        className,
      )}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
    />
  );
}

export function LineMark({ children }: Readonly<{ children: ReactNode }>) {
  return <span className="h-body-line flex shrink-0 items-center">{children}</span>;
}

export function TitleMark({ children }: Readonly<{ children: ReactNode }>) {
  return <span className="h-title-line flex items-center">{children}</span>;
}
