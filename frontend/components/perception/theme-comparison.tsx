import { useId } from 'react';

import type { ProbeMarketValue } from '@citeladder/contracts/probes';

import { entityKey } from '@/components/perception/brand-radar';
import { HeatScale, HeatTable, type HeatValue } from '@/components/ui/heat-table';
import { Inline } from '@/components/ui/layout';
import { Section, SectionDescription, SectionHeader, SectionTitle } from '@/components/ui/section';
import { StateBlock } from '@/components/ui/state-block';
import { YouTag } from '@/components/ui/table';

type Theme = ProbeMarketValue['themes'][number];
type Entity = Theme['entities'][number];

function cell(theme: Theme, entity: Entity): HeatValue {
  const own = theme.entities.find((item) => entityKey(item) === entityKey(entity));
  if (!own?.named) return { kind: 'void', state: 'none', label: 'Not named' };
  const rank = 1 + theme.entities.filter((item) => item.score > own.score).length;
  return { kind: 'value', text: String(own.score), detail: `#${rank}`, tint: own.score / 100 };
}

export function ThemeComparison({ themes }: Readonly<{ themes: readonly Theme[] }>) {
  const titleId = useId();
  const roster = themes[0]?.entities ?? [];
  return (
    <Section aria-labelledby={titleId}>
      <SectionHeader>
        <SectionTitle id={titleId}>Brand comparison by theme</SectionTitle>
        <SectionDescription>
          Position score each brand earns when AI is asked about a theme, not about one brand
        </SectionDescription>
      </SectionHeader>
      {themes.length ? (
        <>
          <HeatTable
            labelledBy={titleId}
            corner="Theme"
            columns={roster.map((entity) => ({
              key: entityKey(entity),
              header: (
                <Inline as="span" className="justify-center">
                  {entity.name}
                  {entity.kind === 'brand' ? <YouTag /> : null}
                </Inline>
              ),
            }))}
            rows={themes.map((theme) => ({
              key: theme.theme_id,
              header: theme.theme,
              cells: roster.map((entity) => cell(theme, entity)),
            }))}
          />
          <HeatScale note="100 when named first, 10 less per place" />
        </>
      ) : (
        <StateBlock kind="empty" inline message="No theme answers." />
      )}
    </Section>
  );
}
