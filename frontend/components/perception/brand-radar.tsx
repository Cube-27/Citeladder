import { useState } from 'react';

import type { ProbeMarketValue } from '@citeladder/contracts/probes';

import { Button } from '@/components/ui/button';
import { chartFill, chartStroke, type ChartTone } from '@/components/ui/chart';
import { ChartTable } from '@/components/ui/chart-frame';
import { Inline, Stack } from '@/components/ui/layout';
import { StateBlock } from '@/components/ui/state-block';
import { cn } from '@/lib/utils';

type Themes = ProbeMarketValue['themes'];
type Entity = Themes[number]['entities'][number];

const CX = 200;
const CY = 150;
const RADIUS = 105;
const LABEL_RADIUS = 1.1;
const LABEL_SIZE = 7;
const LABEL_BASELINE = 2.5;
const RINGS = [25, 50, 75, 100];
const RIVAL_TONES = [2, 3, 4] as const satisfies readonly ChartTone[];
const BRAND_TONE: ChartTone = 1;

export const entityKey = (entity: Pick<Entity, 'kind' | 'id' | 'name'>) =>
  `${entity.kind}:${entity.id ?? entity.name}`;

function point(index: number, count: number, value: number) {
  const angle = -Math.PI / 2 + (index * 2 * Math.PI) / count;
  const reach = (RADIUS * value) / 100;
  return [CX + Math.cos(angle) * reach, CY + Math.sin(angle) * reach] as const;
}

function anchorOf(x: number) {
  if (Math.abs(x - CX) < 1) return 'middle';
  return x > CX ? 'start' : 'end';
}

export const rosterKey = (themes: Themes) => (themes[0]?.entities ?? []).map(entityKey).join('|');

const polygon = (values: readonly number[]) =>
  values.map((value, index) => point(index, values.length, value).join(',')).join(' ');

export function BrandRadar({ themes }: Readonly<{ themes: Themes }>) {
  const roster = themes[0]?.entities ?? [];
  const rivals = roster.filter((entity) => entity.kind === 'competitor');
  const [shown, setShown] = useState<readonly string[]>(() =>
    rivals.slice(0, 2).map((entity) => entityKey(entity)),
  );
  const [showBrand, setShowBrand] = useState(true);
  if (themes.length < 3)
    return <StateBlock kind="empty" inline message="Needs three themes or more." />;
  const scores = (entity: Entity) =>
    themes.map(
      (row) => row.entities.find((item) => entityKey(item) === entityKey(entity))?.score ?? 0,
    );
  const drawn = [
    ...rivals.flatMap((entity) => {
      const slot = shown.indexOf(entityKey(entity));
      const tone = RIVAL_TONES[slot];
      return tone === undefined ? [] : [{ entity, tone, brand: false }];
    }),
    ...roster
      .filter((entity) => entity.kind === 'brand' && showBrand)
      .map((entity) => ({ entity, tone: BRAND_TONE, brand: true })),
  ];
  const toggle = (entity: Entity) => {
    if (entity.kind === 'brand') return setShowBrand((on) => !on);
    const key = entityKey(entity);
    setShown((keys) => (keys.includes(key) ? keys.filter((item) => item !== key) : [...keys, key]));
  };
  const toneOf = (entity: Entity) =>
    entity.kind === 'brand' ? BRAND_TONE : RIVAL_TONES[shown.indexOf(entityKey(entity))];
  return (
    <Stack gap="item">
      <ChartTable
        label="Brand shape: position score per theme"
        columns={themes.map((row) => row.theme)}
        rows={roster.map((entity) => ({
          name: entity.name,
          values: scores(entity).map(String),
        }))}
        notes={[]}
      />
      <svg aria-hidden focusable="false" viewBox="0 0 400 300" className="block h-auto w-full">
        {RINGS.map((ring) => (
          <polygon
            key={ring}
            points={polygon(themes.map(() => ring))}
            className="stroke-rule fill-none"
          />
        ))}
        {themes.map((row, index) => {
          const [x, y] = point(index, themes.length, 100);
          const [lx, ly] = point(index, themes.length, 100 * LABEL_RADIUS);
          return (
            <g key={row.theme_id}>
              <line x1={CX} y1={CY} x2={x} y2={y} className="stroke-rule" />
              <text
                x={lx}
                y={ly + LABEL_BASELINE}
                textAnchor={anchorOf(lx)}
                fontSize={LABEL_SIZE}
                className="fill-ink-2"
              >
                {row.theme}
              </text>
            </g>
          );
        })}
        {drawn.map(({ entity, tone, brand }) => (
          <polygon
            key={entityKey(entity)}
            points={polygon(scores(entity))}
            className={cn(chartStroke(tone), chartFill(tone))}
            fillOpacity={brand ? 0.28 : 0.12}
            strokeWidth={brand ? 2 : 1.25}
          />
        ))}
      </svg>
      <Inline className="flex-wrap justify-center">
        {roster.map((entity) => {
          const tone = toneOf(entity);
          const on = entity.kind === 'brand' ? showBrand : tone !== undefined;
          return (
            <Button
              key={entityKey(entity)}
              variant="quiet"
              aria-pressed={on}
              disabled={!on && entity.kind === 'competitor' && shown.length >= RIVAL_TONES.length}
              onClick={() => toggle(entity)}
            >
              <svg aria-hidden width={8} height={8} viewBox="0 0 8 8" className="shrink-0">
                <circle
                  cx={4}
                  cy={4}
                  r={4}
                  className={on && tone ? chartFill(tone) : 'fill-rule'}
                />
              </svg>
              {entity.name}
            </Button>
          );
        })}
      </Inline>
    </Stack>
  );
}
