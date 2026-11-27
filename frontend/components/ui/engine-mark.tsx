import type { ReactNode } from 'react';

import { BrandMark, type BrandMarkPlacement } from '@/components/ui/brand-mark';
import { EngineShapes } from '@/components/ui/engine-glyph';
import { ENGINE_SVG, type EngineKey } from '@/components/ui/engine-svg';
import { useEngineCatalog } from '@/lib/providers/engines';
import { cn } from '@/lib/utils';

export type { EngineKey } from '@/components/ui/engine-svg';

export function engineMarkKey(engine: string): EngineKey | null {
  if (engine.startsWith('chatgpt')) return 'chatgpt';
  if (engine.startsWith('gemini')) return 'gemini';
  if (engine === 'claude') return 'claude';
  if (engine === 'google_ai_overview' || engine === 'google_ai_mode') return 'google';
  return null;
}

export function EngineBrandMark({
  engine,
  placement = 'inline',
}: Readonly<{ engine: string; placement?: 'inline' | 'row' }>) {
  const key = engineMarkKey(engine);
  return key ? <GlyphMark glyph={key} placement={placement} /> : null;
}

export function GlyphMark({
  glyph,
  placement = 'inline',
}: Readonly<{ glyph: EngineKey; placement?: BrandMarkPlacement }>) {
  return (
    <BrandMark kind="glyph" glyph={glyph} placement={placement}>
      <EngineShapes engine={glyph} brand />
    </BrandMark>
  );
}

export function engineOptionMark(engine: string): ReactNode {
  return engineMarkKey(engine) ? <EngineBrandMark engine={engine} /> : undefined;
}

const PLACEMENT = { inline: 'size-4', row: 'size-5' } as const;

export function EngineMark({
  engine,
  placement = 'row',
  brand = false,
  className,
}: Readonly<{
  engine: EngineKey;
  placement?: keyof typeof PLACEMENT;
  brand?: boolean;
  className?: string;
}>) {
  return (
    <svg
      {...ENGINE_SVG}
      data-engine-mark={engine}
      className={cn('shrink-0 fill-current', PLACEMENT[placement], className)}
    >
      <EngineShapes engine={engine} brand={brand} />
    </svg>
  );
}

export function EngineCell({ engine }: Readonly<{ engine: string }>) {
  const label = useEngineCatalog().label(engine);
  if (!engineMarkKey(engine)) return <>{label}</>;
  return (
    <span title={label} className="inline-flex items-center">
      <EngineBrandMark engine={engine} />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function EngineStack({ engines }: Readonly<{ engines: readonly string[] }>) {
  const { label } = useEngineCatalog();
  const names = engines.map(label).join(', ');
  const marks = [...new Set(engines.flatMap((engine) => engineMarkKey(engine) ?? []))];
  const unmarked = engines.filter((engine) => !engineMarkKey(engine)).map(label);
  return (
    <span title={names} className="inline-flex items-center gap-1.5">
      {marks.length ? (
        <span aria-hidden className="inline-flex items-center -space-x-1">
          {marks.map((key) => (
            <span key={key} className="bg-panel ring-panel inline-flex rounded-full ring-2">
              <GlyphMark glyph={key} />
            </span>
          ))}
        </span>
      ) : null}
      {unmarked.length ? <span aria-hidden>{unmarked.join(', ')}</span> : null}
      <span className="sr-only">{names}</span>
    </span>
  );
}
