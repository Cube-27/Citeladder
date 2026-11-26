import { useState } from 'react';

import type { ProbeMarketValue } from '@citeladder/contracts/probes';

import { Button } from '@/components/ui/button';
import type { ChartTone } from '@/components/ui/chart';
import { LegendDot, RadarChart } from '@/components/ui/radar-chart';
import { ChartTable } from '@/components/ui/chart-frame';
import { Inline, Stack } from '@/components/ui/layout';
import { StateBlock } from '@/components/ui/state-block';

type Themes = ProbeMarketValue['themes'];
type Entity = Themes[number]['entities'][number];

const RIVAL_TONES = [2, 3, 4] as const satisfies readonly ChartTone[];
const BRAND_TONE: ChartTone = 1;

export const entityKey = (entity: Pick<Entity, 'kind' | 'id' | 'name'>) =>
  `${entity.kind}:${entity.id ?? entity.name}`;

export const rosterKey = (themes: Themes) => (themes[0]?.entities ?? []).map(entityKey).join('|');

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
      <RadarChart
        axes={themes.map((row) => ({ key: row.theme_id, label: row.theme }))}
        shapes={drawn.map(({ entity, tone, brand }) => ({
          key: entityKey(entity),
          values: scores(entity),
          tone,
          lead: brand,
        }))}
      />
      <Inline wrap justify="center">
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
              <LegendDot tone={on ? tone : undefined} />
              {entity.name}
            </Button>
          );
        })}
      </Inline>
    </Stack>
  );
}
