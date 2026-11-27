import { useState } from 'react';

import { ENGINE_SVG, EngineShapes, type EngineKey } from '@/components/ui/engine-glyph';
import { brandInitials } from '@/lib/brand/initials';
import { brandMarkSources } from '@/lib/brand/mark-sources';
import { cn } from '@/lib/utils';

const PLACEMENT = {
  text: {
    pixels: 14,
    box: 'size-3.5 rounded-mark text-caption-strong',
    image: 'size-3.5',
    glyph: 'block size-3.5 fill-current',
  },
  inline: {
    pixels: 16,
    box: 'size-4 rounded-mark text-caption-strong',
    image: 'size-4',
    glyph: 'block size-4 fill-current',
  },
  row: {
    pixels: 20,
    box: 'size-5 rounded-mark text-caption',
    image: 'size-5',
    glyph: 'block size-5 fill-current',
  },
  header: {
    pixels: 24,
    box: 'bg-panel size-10 rounded-control text-heading',
    image: 'size-6',
    glyph: 'block size-6 fill-current',
  },
} as const;

export type BrandMarkPlacement = keyof typeof PLACEMENT;

type LogoSource = Readonly<{
  kind?: 'logo';
  name: string;
  logoUrl?: string | null;
  websiteUrl?: string | null;
  entity?: 'brand' | 'site';
}>;

type GlyphSource = Readonly<{ kind: 'glyph'; glyph: EngineKey }>;

export function BrandMark(
  props: Readonly<(LogoSource | GlyphSource) & { placement?: BrandMarkPlacement }>,
) {
  const placement = props.placement ?? 'row';
  const spec = PLACEMENT[placement];
  return (
    <span
      aria-hidden
      data-brand-mark={placement}
      className={cn(
        'grid shrink-0 place-items-center',
        props.kind === 'glyph' ? spec.image : ['overflow-hidden', spec.box],
      )}
    >
      {props.kind === 'glyph' ? (
        <svg {...ENGINE_SVG} data-engine-mark={props.glyph} className={spec.glyph}>
          <EngineShapes engine={props.glyph} brand />
        </svg>
      ) : (
        <LogoImage source={props} placement={placement} />
      )}
    </span>
  );
}

function LogoImage({
  source: { name, logoUrl, websiteUrl, entity = 'brand' },
  placement,
}: Readonly<{ source: LogoSource; placement: BrandMarkPlacement }>) {
  const [failed, setFailed] = useState<Record<string, true>>({});
  const spec = PLACEMENT[placement];
  const src = brandMarkSources({ logoUrl, websiteUrl, pixels: spec.pixels }).find(
    (candidate) => !failed[candidate],
  );
  const [letter = '?'] = brandInitials(name.replace(/^www\./u, ''));
  if (src)
    return (
      <img
        key={src}
        src={src}
        alt=""
        width={spec.pixels}
        height={spec.pixels}
        className={cn('block object-contain', spec.image, placement !== 'header' && 'rounded-mark')}
        onError={() => setFailed((prev) => ({ ...prev, [src]: true }))}
      />
    );
  return (
    <span
      className={cn(
        'grid place-items-center font-emphasis uppercase',
        entity === 'site'
          ? 'border-control-line text-ink-2 rounded-mark border'
          : 'bg-mark-ink text-on-ink',
        placement === 'header' ? 'size-full' : spec.image,
      )}
    >
      {letter}
    </span>
  );
}
