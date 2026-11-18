import type { PerceptionResponse } from '@citeladder/contracts/visibility-perception';
import { useState } from 'react';

import { CompetitorThemes } from '@/components/perception/competitor-themes';
import { PerceptionBreakdown } from '@/components/perception/perception-breakdown';
import { AppGrid } from '@/components/ui/app-grid';
import { DisplayTime } from '@/components/ui/display-time';
import { FigureStrip, type FigureSegment } from '@/components/ui/figure-strip';
import { Stack } from '@/components/ui/layout';
import { Meter } from '@/components/ui/meter';
import { PartDonut } from '@/components/ui/part-donut';
import { Section, SectionContent, SectionStack, TitledSection } from '@/components/ui/section';
import { StateBlock } from '@/components/ui/state-block';
import { SegmentedControl } from '@/components/ui/tabs';
import { StepChart } from '@/components/ui/step-chart';
import { textRole } from '@/components/ui/typography';
import {
  EntityTable,
  NegativeQuotes,
  PerceptionState,
} from '@/components/visibility/visibility-perception';
import { useDisplayTimeZone } from '@/lib/display-timezone';
import { formatDisplayDate } from '@/lib/format';
import {
  coverageLine,
  formatNet,
  formatShare,
  negativeHeadline,
  negativeThemesLine,
  rankThemes,
  sentimentTrend,
  themeLabel,
} from '@/lib/visibility/perception';

/** Themes the "How AI describes you" list shows at most. */
const THEME_LIST_LIMIT = 8;

/**
 * The Perception page's Brand tab: how answers portray the brand. Every figure
 * travels with the coverage it was computed over, and a missing classification
 * is a named state, never a zero. `factFigure` is the pilot's contradicted
 * claims, linking to the Fact-checking tab.
 */
export function PerceptionView({
  data,
  factFigure,
}: Readonly<{ data: PerceptionResponse; factFigure?: FigureSegment }>) {
  if (data.state !== 'value')
    return <PerceptionState state={data.state} reason={data.reason} coverage={data.coverage} />;
  return (
    <SectionStack>
      <Lede data={data} factFigure={factFigure} />
      <AppGrid layout="main-aside">
        <ThemeList themes={data.themes} />
        <SentimentRing data={data} />
      </AppGrid>
      <SentimentTrend trend={data.trend} />
      <AppGrid layout="halves">
        <EntityTable entities={data.entities} />
        <NegativeQuotes quotes={data.negative_quotes} />
      </AppGrid>
      <PerceptionBreakdown data={data} />
      {data.entities.some((entity) => !entity.is_brand) ? (
        <CompetitorThemes entities={data.entities} />
      ) : null}
    </SectionStack>
  );
}

function Lede({
  data,
  factFigure,
}: Readonly<{ data: PerceptionResponse; factFigure?: FigureSegment }>) {
  const score = data.brand?.score;
  const { recommended, coverage } = data;
  const latest = data.trend.at(-1)?.completed_at;
  const segments: FigureSegment[] = [
    {
      key: 'describing',
      label: 'Describing you',
      value: `${coverage.classified} / ${coverage.mentions}`,
      sub: coverageLine(coverage),
    },
    {
      key: 'positive',
      label: 'Positive',
      value: formatShare(score?.positive_share ?? null),
      missingLabel: 'Unavailable',
      sub: score ? `${score.positive} of ${score.classified} classified mentions` : undefined,
    },
    {
      key: 'negative',
      label: 'Negative',
      value: formatShare(score?.negative_share ?? null),
      missingLabel: 'Unavailable',
      sub: score ? `${score.negative} of ${score.classified} classified mentions` : undefined,
    },
    {
      key: 'recommended',
      label: 'Recommended',
      value: formatShare(recommended.rate),
      missingLabel: 'Unavailable',
      sub:
        `${recommended.recommended} of ${recommended.mentioned} answers naming you` +
        (recommended.recommended_against
          ? `; ${recommended.recommended_against} advised against`
          : ''),
    },
  ];
  return (
    <Section>
      <SectionContent>
        <Stack gap="item">
          <Stack gap="tight">
            <p className={textRole('caption', 'text-ink-2')}>
              From your tracked prompts
              {latest ? (
                <>
                  {' · latest run '}
                  <DisplayTime value={latest} dateOnly />
                </>
              ) : null}
            </p>
            <h2 className={textRole('heading')}>
              {negativeHeadline(score) ?? 'How AI describes you'}
            </h2>
            <p className={textRole('body', 'text-ink-2')}>{negativeThemesLine(data.themes)}</p>
          </Stack>
          <FigureStrip
            label="Brand perception"
            segments={factFigure ? [...segments, factFigure] : segments}
          />
        </Stack>
      </SectionContent>
    </Section>
  );
}

type ThemeOrder = 'negative' | 'positive';

function ThemeList({ themes }: Readonly<{ themes: PerceptionResponse['themes'] }>) {
  const [order, setOrder] = useState<ThemeOrder>('negative');
  const ranked = rankThemes(themes, order, THEME_LIST_LIMIT);
  const most = ranked[0]?.[order] ?? 0;
  return (
    <TitledSection
      title="How AI describes you"
      actions={
        <SegmentedControl
          value={order}
          onChange={setOrder}
          ariaLabel="Order themes"
          options={[
            { value: 'negative', label: 'Most negative' },
            { value: 'positive', label: 'Most positive' },
          ]}
        />
      }
    >
      <SectionContent>
        {ranked.length ? (
          <Stack as="ul">
            {ranked.map((theme) => (
              <li key={theme.theme}>
                <Meter
                  label={themeLabel(theme.theme)}
                  value={(theme[order] / most) * 100}
                  valueLabel={`${theme[order]} ${order}`}
                  tone={order === 'negative' ? 'negative' : 'accent'}
                />
              </li>
            ))}
          </Stack>
        ) : (
          <StateBlock kind="empty" inline message={`No ${order} themes in these answers.`} />
        )}
      </SectionContent>
    </TitledSection>
  );
}

function SentimentRing({ data }: Readonly<{ data: PerceptionResponse }>) {
  const score = data.brand?.score;
  return (
    <TitledSection title="How AI judges you">
      <SectionContent>
        {score ? (
          <PartDonut
            label="Sentiment of classified mentions"
            totalLabel="classified mentions"
            total={score.classified}
            parts={[
              { label: 'Positive', value: score.positive },
              { label: 'Neutral', value: score.neutral },
              { label: 'Negative', value: score.negative },
              { label: 'Mixed', value: score.mixed },
            ]}
          />
        ) : (
          <StateBlock kind="empty" inline message="No classified mentions of you." />
        )}
      </SectionContent>
    </TitledSection>
  );
}

function SentimentTrend({ trend }: Readonly<{ trend: PerceptionResponse['trend'] }>) {
  const timeZone = useDisplayTimeZone();
  return (
    <TitledSection
      title="Net sentiment over time"
      description="A break is a run that can’t be compared with the one before."
    >
      <SectionContent>
        {trend.length > 1 ? (
          <StepChart
            label="Net sentiment over time"
            data={sentimentTrend(trend, (iso) => formatDisplayDate(iso, timeZone))}
            yMin={-100}
            yMax={100}
            yFormat={(value) => formatNet(value) ?? ''}
          />
        ) : (
          <StateBlock
            kind="empty"
            inline
            message="Choose All runs in period under Measurement to see sentiment across runs."
          />
        )}
      </SectionContent>
    </TitledSection>
  );
}
