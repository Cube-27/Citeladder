import type { UseQueryResult } from '@tanstack/react-query';
import { FilterChoice } from '@/components/ui/filter-bar';
import { SegmentedControl } from '@/components/ui/tabs';
import { useDisplayTimeZone } from '@/lib/display-timezone';
import { Delta } from '@/components/ui/delta';
import { Stack } from '@/components/ui/layout';
import { InfoHint } from '@/components/ui/info-hint';
import { StateBlock } from '@/components/ui/state-block';
import { StepChart } from '@/components/ui/step-chart';
import { textRole } from '@/components/ui/typography';
import type { Visibility, VisibilityTrendPoint } from '@citeladder/contracts';
import {
  formatPosition,
  formatPositionExact,
  formatRate,
  formatWholePercent,
} from '@/lib/visibility/dashboard';
import { brandStanding, orderByVisibility, standingHeadline } from '@/lib/visibility/ranking';
import { toChartPoints, toCompetitorSeries, toNamedChartPoints } from '@/lib/visibility/trends';
import { observationLabel } from '@/lib/visibility/vocabulary';
import { coverageSummary } from '@/lib/visibility/coverage';
import { formatDisplayDate, pluralCount } from '@/lib/format';
import { SHARE_OF_VOICE_HINT, VISIBILITY_METRICS } from '@/lib/config/visibility';
import { optionalStringUrlCodec, stringUrlCodec, useUrlState } from '@/lib/navigation/url-state';
import { Notice, readErrorProps } from '@/components/ui/notice';
import { Section, SectionContent, SectionHeader, SectionTitle } from '@/components/ui/section';
import { FigureStrip, type FigureSegment } from '@/components/ui/figure-strip';

type Metric = (typeof VISIBILITY_METRICS)[number]['value'];

const metricCodec = stringUrlCodec(
  VISIBILITY_METRICS.map((item) => item.value),
  'brand_mention_rate',
);

/** The Focus menu's value for the default roster. */
const ALL_BRANDS = '__all__';

/**
 * Insights' lede: what the figures count, where you rank and who is beside
 * you, then the key figures. The rank and names come from the same ranking
 * the Competitors table draws, computed in code.
 */
export function InsightsLede({ selected }: Readonly<{ selected: Visibility }>) {
  const timeZone = useDisplayTimeZone();
  const summary = coverageSummary(selected, (iso) => formatDisplayDate(iso, timeZone));
  const { headline, sub } = standingHeadline(brandStanding(selected.rankings));
  return (
    <Section aria-labelledby="insights-headline">
      <SectionHeader>
        <p className={textRole('caption')}>
          {summary.answers} {summary.change}
        </p>
        <h2 id="insights-headline" className={textRole('title')}>
          {headline}
        </h2>
        {sub ? <p className={textRole('body', 'text-ink-2')}>{sub}</p> : null}
      </SectionHeader>
      <Stack>
        <PooledSelectionNote selected={selected} />
        <HeadlineMetrics selected={selected} />
      </Stack>
    </Section>
  );
}

/**
 * What "All runs in period" actually pooled: runs are only comparable within
 * one frozen configuration, so a period pools the most recent one's runs and
 * says how many it left out.
 */
function PooledSelectionNote({ selected }: Readonly<{ selected: Visibility }>) {
  const groups = selected.configuration_groups;
  if (selected.selection_mode !== 'range' || !groups) return null;
  const total = Object.values(groups).reduce((sum, count) => sum + count, 0);
  const pooled = selected.source_audit_ids?.length ?? 0;
  if (Object.keys(groups).length < 2 || pooled >= total) return null;
  return (
    <Notice tone="info">
      {`Pooled the ${pooled} of ${total} runs in this period that share one measurement setup. The other ${total - pooled} used a different set of models or prompts, so their answers are not comparable with these and are not counted here — open them individually from the measurement menu.`}
    </Notice>
  );
}

function HeadlineMetrics({ selected }: Readonly<{ selected: Visibility }>) {
  const brand = selected.rankings.find((row) => row.is_brand);
  const deltas = selected.comparison?.deltas;
  const unmeasured = observationLabel(selected.counts?.state);
  const rate = (key: string, value: number | null | undefined) => {
    const change = deltas?.[key];
    return {
      value: unmeasured ?? formatRate(value ?? null),
      // No comparable run means no change line; the caption states why once.
      delta: change == null ? null : <Delta value={change} unit=" pp" />,
    };
  };
  // A rank, not a rate: the mean place an answer names you in. Runs measured
  // before mention offsets were persisted have none, and the figure is omitted.
  const position = brand?.avg_position ?? selected.avg_position ?? null;
  const segments: FigureSegment[] = [
    {
      key: 'visibility',
      label: 'Visibility',
      marker: <InfoHint label="Visibility">The share of answers that name your brand.</InfoHint>,
      ...rate('visibility', selected.visibility_rate),
    },
    ...(position == null
      ? []
      : [
          {
            key: 'avg_position',
            label: 'Position',
            marker: (
              <InfoHint label="Position">
                {`Where your brand tends to appear among the brands you track, within the answers that name you, averaged to ${formatPositionExact(position)}. A brand an answer names that you do not track is not counted.`}
              </InfoHint>
            ),
            value: formatPosition(position),
          },
        ]),
    {
      key: 'sov',
      label: 'Share of voice',
      marker: <InfoHint label="Share of voice">{SHARE_OF_VOICE_HINT}</InfoHint>,
      ...rate('sov', brand?.share_of_voice),
    },
  ];
  return <FigureStrip segments={segments} />;
}

/**
 * "Your brand over time": the plotted metric, and Focus to plot one tracked
 * brand alone. Focus is URL-held so a comparison survives a reload; a name
 * this selection never measured falls back to the full roster rather than
 * drawing an empty chart that reads as "measured, scored zero".
 */
export function BrandTrend({
  query,
  selected,
}: Readonly<{
  query: UseQueryResult<VisibilityTrendPoint[], unknown>;
  selected: Visibility;
}>) {
  const [metric, setMetric] = useUrlState('metric', metricCodec);
  const [focused, setFocused] = useUrlState('brand', optionalStringUrlCodec);
  const brands = orderByVisibility(selected.rankings);
  const focusedBrand = brands.some((row) => row.name === focused) ? focused : null;
  return (
    <Section aria-labelledby="insights-trend">
      <SectionHeader
        actions={
          <>
            <SegmentedControl
              ariaLabel="Plotted metric"
              value={metric}
              options={VISIBILITY_METRICS}
              onChange={setMetric}
            />
            <FilterChoice
              label="Focus"
              value={focusedBrand ?? ALL_BRANDS}
              defaultValue={ALL_BRANDS}
              options={[
                { value: ALL_BRANDS, label: 'All brands' },
                ...brands.map((row) => ({ value: row.name, label: row.name })),
              ]}
              onChange={(value) => setFocused(value === ALL_BRANDS ? null : value)}
            />
          </>
        }
      >
        <SectionTitle id="insights-trend">Your brand over time</SectionTitle>
      </SectionHeader>
      <SectionContent>
        <TrendBody
          query={query}
          metric={metric}
          focused={focusedBrand}
          brandName={selected.rankings.find((row) => row.is_brand)?.name ?? null}
        />
      </SectionContent>
    </Section>
  );
}

type TrendBodyProps = Readonly<{
  query: UseQueryResult<VisibilityTrendPoint[], unknown>;
  metric: Metric;
  focused: string | null;
  brandName: string | null;
}>;

/** The failed read, no runs in the window, or the line chart. */
function TrendBody({ query, ...chart }: TrendBodyProps) {
  if (query.isError)
    return (
      <Notice
        kind="read"
        {...readErrorProps(query)}
        title="Couldn't load the history"
        fallback="Check your connection and try again."
      />
    );
  if (query.isSuccess && !query.data.length)
    return <StateBlock kind="empty" inline message="No runs in this period." />;
  return <HistoryLineChart points={query.data ?? []} busy={query.isFetching} {...chart} />;
}

function HistoryLineChart({
  points,
  metric,
  focused,
  brandName,
  busy,
}: Omit<TrendBodyProps, 'query'> &
  Readonly<{ points: readonly VisibilityTrendPoint[]; busy: boolean }>) {
  const timeZone = useDisplayTimeZone();
  const metricLabel =
    VISIBILITY_METRICS.find((item) => item.value === metric)?.label ?? 'Visibility';
  // Focusing the tracked brand is its OWN series, which the projection
  // publishes directly; a competitor's comes from the rankings.
  const focusedIsBrand = focused !== null && focused === brandName;
  const base =
    focused === null || focusedIsBrand
      ? toChartPoints(points, metric, timeZone)
      : toNamedChartPoints(points, metric, focused, timeZone);
  const chartPoints = base.map((point) => ({
    ...point,
    // The values are already whole percent; `formatRate` would scale them again.
    label: `${point.dateLabel} · ${formatWholePercent(point.value)}`,
    axisLabel: point.label,
  }));
  // One focused brand means one line.
  const competitors = focused === null ? toCompetitorSeries(points, metric) : [];
  return (
    <Stack aria-busy={busy}>
      <StepChart
        label={`${metricLabel} over time`}
        name={focused ?? 'You'}
        data={chartPoints}
        series={competitors}
        yMax={100}
        yFormat={(value) => `${Math.round(value)}%`}
      />
      <p className={textRole('caption')}>
        {focused === null && competitors.length
          ? `You and the ${pluralCount(competitors.length, 'tracked brand')} named most often in the latest period; use Focus to plot one on its own. `
          : ''}
        A line breaks where two runs are not comparable, so a run with no comparable run beside it
        shows as a lone mark.
      </p>
    </Stack>
  );
}
