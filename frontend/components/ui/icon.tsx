import type { ReactNode } from 'react';

import type { IconGlyph } from '@/lib/icons';
import { TEXT_TONE_CLASS, type TextTone } from '@/components/ui/text-role';
import { cn } from '@/lib/utils';

const ICON_SIZE = {
  text: 'my-0.75 size-3.5',
  field: 'my-0.5 size-4',
  flush: 'size-3.5',
  control: 'size-4',
  lead: 'size-5',
  feature: 'size-9',
} as const;

const ICON_TONE = { ...TEXT_TONE_CLASS, accent: 'text-accent' } as const;

type IconSize = keyof typeof ICON_SIZE;

const ICON_FLAGS = [
  ['muted', 'opacity-muted'],
  ['dim', 'opacity-[70%]'],
  ['flipOnOpen', 'turn group-data-[state=open]:rotate-180 motion-reduce:transition-none'],
  ['revealOnHover', 'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100'],
  ['turnOnOpen', 'group-open:rotate-90'],
  ['handle', 'cursor-grab'],
  ['appOnly', '[[data-public-surface]_&]:hidden'],
] as const;

type IconFlags = Partial<Record<(typeof ICON_FLAGS)[number][0], boolean>>;

export function Icon({
  icon: Glyph,
  label,
  tone,
  size = 'text',
  flip,
  ...flags
}: Readonly<
  {
    icon: IconGlyph;
    label?: string;
    tone?: TextTone | 'accent';
    size?: IconSize;
    flip?: boolean;
  } & IconFlags
>) {
  return (
    <Glyph
      data-icon=""
      className={cn(
        ICON_SIZE[size],
        'shrink-0',
        tone && ICON_TONE[tone],
        flip !== undefined && 'turn',
        flip && 'rotate-180',
        ICON_FLAGS.map(([name, classes]) => flags[name] && classes),
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
  return <span className="flex h-(--text-title--line-height) items-center">{children}</span>;
}
