import type { UseQueryResult } from '@tanstack/react-query';
import { useState } from 'react';

import type { VisibilityMatrix } from '@citeladder/contracts/visibility-matrix';
import { Absence } from '@/components/ui/absence';
import { RankLegend, RankTable } from '@/components/ui/heat-table';
import { Stack } from '@/components/ui/layout';
import { Section, SectionDescription, SectionHeader, SectionTitle } from '@/components/ui/section';
import { Select } from '@/components/ui/select';
import { MATRIX_DIMENSIONS, RANKING_DIMENSIONS } from '@/lib/config/visibility';
import { formatRate } from '@/lib/visibility/dashboard';
import { AxisLabel, matrixBodyState, useAxisText } from './matrix-parts';

type RankingDimension = (typeof RANKING_DIMENSIONS)[number]['value'];

/**
 * Insights → Top rankings (W6): in each segment, the five tracked brands
 * named most often, as the read ranks them. A segment the selection never
 * asked reads "Not run"; your brand's chip takes the accent wash.
 */
export function TopRankings({ query }: Readonly<{ query: UseQueryResult<VisibilityMatrix> }>) {
  const [by, setBy] = useState<RankingDimension>('topic');
  const axisText = useAxisText();
  const data = query.data;
  const segments = data ? axisText(data.axes, by) : [];
  return (
    <Section aria-labelledby="insights-rankings">
      <SectionHeader
        actions={
          <Select
            ariaLabel="Rank by"
            value={by}
            options={RANKING_DIMENSIONS}
            onValueChange={setBy}
          />
        }
      >
        <SectionTitle id="insights-rankings">Top rankings</SectionTitle>
        <SectionDescription>Leading brands in each segment, by visibility</SectionDescription>
      </SectionHeader>
      <Stack>
        {matrixBodyState(query, 'rankings') ??
          (data ? (
            <RankTable
              labelledBy="insights-rankings"
              corner={MATRIX_DIMENSIONS.find((option) => option.value === by)?.label ?? by}
              places={5}
              rows={segments.map((text, i) => ({
                key: `${by}-${i}`,
                header: <AxisLabel axes={data.axes} dimension={by} index={i} text={text} />,
                chips: (data.rankings[by][i] ?? []).map((leader) => ({
                  key: `${leader.is_brand}:${leader.name}`,
                  name: leader.name,
                  detail: formatRate(leader.mention_rate),
                  own: leader.is_brand,
                })),
                empty: <Absence state="not_run" label="Not run" />,
              }))}
            />
          ) : null)}
        <RankLegend />
      </Stack>
    </Section>
  );
}
