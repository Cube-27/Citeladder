import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export type EngineKey = 'chatgpt' | 'claude' | 'gemini' | 'google';

export const ENGINE_SVG = {
  'aria-hidden': true,
  focusable: 'false',
  viewBox: '0 0 24 24',
  fillRule: 'evenodd',
} as const;

const GLYPH_SIZE = {
  text: 'size-3.5',
  inline: 'size-4',
  row: 'size-5',
  header: 'size-6',
  card: 'size-7',
  feature: 'size-9',
} as const;

export type GlyphSize = keyof typeof GLYPH_SIZE;

const GLYPH_FLOW = { block: 'block', item: 'shrink-0' } as const;

export function EngineFrame({
  engine,
  size,
  flow,
  children,
}: Readonly<{
  engine: EngineKey;
  size: GlyphSize;
  flow: keyof typeof GLYPH_FLOW;
  children: ReactNode;
}>) {
  return (
    <svg
      {...ENGINE_SVG}
      data-engine-mark={engine}
      className={cn(GLYPH_FLOW[flow], 'fill-current', GLYPH_SIZE[size])}
    >
      {children}
    </svg>
  );
}
