import type { UseQueryResult } from '@tanstack/react-query';

import type { VisibilityMatrix } from '@citeladder/contracts/visibility-matrix';
import { Absence } from '@/components/ui/absence';
import { BrandMark } from '@/components/ui/brand-mark';
import { RankLegend, RankTable } from '@/components/ui/heat-table';
import { Stack } from '@/components/ui/layout';
import { Section, SectionDescription, SectionHeader, SectionTitle } from '@/components/ui/section';
import { Select } from '@/components/ui/select';
import { MATRIX_DIMENSIONS, RANKING_DIMENSIONS } from '@/lib/config/visibility';
import { stringUrlCodec, useUrlState } from '@/lib/navigation/url-state';
import { formatRate } from '@/lib/visibility/dashboard';
import { READING_LABELS } from '@/lib/visibility/matrix';
import { AxisLabel, matrixBodyState, useAxisText } from './matrix-parts';

const byCodec = stringUrlCodec(
  RANKING_DIMENSIONS.map((option) => option.value),
  'topic',
);

/**
 * Insights → Top rankings (W6): in each segment, the five tracked brands
 * named most often, as the read ranks them. A segment the selection never
 * asked reads "Not run", one whose topic the run never recorded is left out;
 * your brand's chip takes the accent wash.
 */
export function TopRankings({ query }: Readonly<{ query: UseQueryResult<VisibilityMatrix> }>) {
  const [by, setBy] = useUrlState('rankings_by', byCodec);
  const axisText = useAxisText();
  const data = query.data;
  const segments = data ? axisText(data.axes, by) : [];
  // A segment whose topic the run never recorded has no ranking to show, so it is left out.
  const rows = data
    ? segments.flatMap((text, i) => {
        const ranking = data.rankings[by][i];
        if (ranking?.kind === 'not_recorded') return [];
        return [
          {
            key: `${by}-${i}`,
            header: <AxisLabel axes={data.axes} dimension={by} index={i} text={text} />,
            chips: (ranking?.kind === 'measured' ? ranking.leaders : []).map((leader) => ({
              key: `${leader.is_brand}:${leader.name}`,
              mark: (
                <BrandMark
                  name={leader.name}
                  logoUrl={leader.logo_url}
                  websiteUrl={leader.website_url}
                  placement="inline"
                />
              ),
              name: leader.name,
              detail: formatRate(leader.mention_rate),
              own: leader.is_brand,
            })),
            empty: <Absence state="not_run" label={READING_LABELS.not_run} />,
          },
        ];
      })
    : [];
  function body() {
    if (!data) return null;
    if (segments.length > 0 && rows.length === 0)
      return <Absence state="unavailable" label={READING_LABELS.not_recorded} />;
    return (
      <RankTable
        labelledBy="insights-rankings"
        corner={MATRIX_DIMENSIONS.find((option) => option.value === by)?.label ?? by}
        places={5}
        rows={rows}
      />
    );
  }
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
        {matrixBodyState(query, 'rankings') ?? body()}
        <RankLegend />
      </Stack>
    </Section>
  );
}
