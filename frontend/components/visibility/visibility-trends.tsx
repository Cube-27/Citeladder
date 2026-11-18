import type { UseQueryResult } from '@tanstack/react-query';
import { FilterChoice } from '@/components/ui/filter-bar';
import { SegmentedControl } from '@/components/ui/tabs';
import { useDisplayTimeZone } from '@/lib/display-timezone';
import { Delta } from '@/components/ui/delta';
import { Stack } from '@/components/ui/layout';
import { InfoHint } from '@/components/ui/info-hint';
import { StateBlock } from '@/components/ui/state-block';
import { StepChart, type TrendEvent } from '@/components/ui/step-chart';
import { RankedBrandMark } from '@/components/visibility/ranked-brand-mark';
import { textRole } from '@/components/ui/typography';
import type {
  NetSentiment,
  RankingRow,
  Visibility,
  VisibilityTrendPoint,
} from '@citeladder/contracts';
import { formatPositionExact, formatRate } from '@/lib/visibility/dashboard';
import { sentimentFigureValue } from '@/lib/visibility/perception';
import {
  brandStanding,
  orderByVisibility,
  standingHeadline,
  winRateAbsence,
} from '@/lib/visibility/ranking';
import { useEngineCatalog } from '@/lib/providers/engines';
import {
  toChartPoints,
  toCompetitorSeries,
  toNamedChartPoints,
  toTrendEvents,
  trendAxis,
} from '@/lib/visibility/trends';
import { observationLabel } from '@/lib/visibility/vocabulary';
import { coverageSummary } from '@/lib/visibility/coverage';
import { availabilityLabel, formatCount, formatDisplayDate } from '@/lib/format';
import {
  PERCEPTION_MIN_CLASSIFIED,
  SHARE_OF_VOICE_HINT,
  VISIBILITY_METRICS,
  WIN_RATE_HINT,
} from '@/lib/config/visibility';
import { optionalStringUrlCodec, stringUrlCodec, useUrlState } from '@/lib/navigation/url-state';
import { Notice, readErrorProps } from '@/components/ui/notice';
import {
  Section,
  SectionContent,
  SectionDescription,
  SectionHeader,
  SectionTitle,
} from '@/components/ui/section';
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
  // An average, not a rank: the mean place an answer names you in. Runs measured
  // before mention offsets were persisted have none, and the figure is omitted.
  const position = brand?.avg_position ?? selected.avg_position ?? null;
  const segments: FigureSegment[] = [
    {
      key: 'visibility',
      label: 'Visibility',
      marker: <InfoHint label="Visibility">The share of answers that name your brand.</InfoHint>,
      ...rate('visibility', selected.visibility_rate),
    },
    ...(brand?.sentiment == null ? [] : [sentimentFigure(brand.sentiment)]),
    ...(position == null
      ? []
      : [
          {
            key: 'avg_position',
            label: 'Position',
            marker: (
              <InfoHint label="Position">
                Where your brand tends to appear among the brands you track, averaged over the
                answers that name you. A brand an answer names that you do not track is not counted.
              </InfoHint>
            ),
            value: formatPositionExact(position),
          },
        ]),
    winRateSegment(brand, unmeasured),
    {
      key: 'sov',
      label: 'Share of voice',
      marker: <InfoHint label="Share of voice">{SHARE_OF_VOICE_HINT}</InfoHint>,
      ...rate('sov', brand?.share_of_voice),
    },
  ];
  return <FigureStrip segments={segments} />;
}

/** Net sentiment with the classified count beneath; below the minimum it is too few, never zero. */
function sentimentFigure(sentiment: NetSentiment): FigureSegment {
  return {
    key: 'sentiment',
    label: 'Sentiment',
    marker: (
      <InfoHint label="Sentiment">
        {`Positive minus negative mentions of your brand, as a share of the classified ones, from −100 to +100. Shows from ${PERCEPTION_MIN_CLASSIFIED} classified mentions.`}
      </InfoHint>
    ),
    ...sentimentFigureValue(sentiment),
    delta: `${sentiment.classified} of ${sentiment.mentions} classified`,
  };
}

/** Win rate (AV-7): of the answers naming a brand you track, the share naming yours first. */
function winRateSegment(brand: RankingRow | undefined, unmeasured: string | null): FigureSegment {
  const answers = brand?.win_answers ?? null;
  const rate = brand?.win_rate ?? null;
  return {
    key: 'win_rate',
    label: 'Win rate',
    marker: <InfoHint label="Win rate">{WIN_RATE_HINT}</InfoHint>,
    value: unmeasured ?? (rate === null ? null : formatRate(rate)),
    missingLabel: availabilityLabel(winRateAbsence(brand)),
    delta: answers ? (
      <span className={textRole('caption')}>
        {`Named first in ${formatCount(brand?.win_count ?? 0)} of ${formatCount(answers)}`}
      </span>
    ) : null,
  };
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
        <SectionDescription>
          How your metrics change run by run, with the events that moved them
        </SectionDescription>
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

/** The failed read, the loading chart, no runs in the window, or the line chart. */
function TrendBody({ query, ...chart }: TrendBodyProps) {
  // No data yet is loading, never an empty chart; retained data stays while it refetches.
  if (query.isPending)
    return (
      <StateBlock
        kind="loading"
        label="Loading the history…"
        shape={{ kind: 'chart', keyed: true }}
      />
    );
  if (query.isError)
    return (
      <Notice
        kind="read"
        {...readErrorProps(query)}
        title="Couldn't load the history"
        fallback="Check your connection and try again."
      />
    );
  if (!query.data.length)
    return <StateBlock kind="empty" inline message="No runs in this period." />;
  return <HistoryLineChart points={query.data} busy={query.isFetching} {...chart} />;
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
  const { label: engineLabel } = useEngineCatalog();
  const metricLabel =
    VISIBILITY_METRICS.find((item) => item.value === metric)?.label ?? 'Visibility';
  // Focusing the tracked brand is its OWN series, which the projection
  // publishes directly; a competitor's comes from the rankings.
  const focusedIsBrand = focused !== null && focused === brandName;
  const base =
    focused === null || focusedIsBrand
      ? toChartPoints(points, metric, timeZone)
      : toNamedChartPoints(points, metric, focused, timeZone);
  // One focused brand means one line.
  const competitors = focused === null ? toCompetitorSeries(points, metric) : [];
  const axis = trendAxis(metric, [
    base.map((point) => point.value),
    ...competitors.map((line) => line.values),
  ]);
  const chartPoints = base.map((point) => ({
    ...point,
    value: axis.plot(point.value),
    label: `${point.dateLabel} · ${axis.format(point.value)}`,
    axisLabel: point.label,
  }));
  const events = toTrendEvents(points, { timeZone, engineLabel });
  return (
    <Stack aria-busy={busy}>
      <StepChart
        label={`${metricLabel} over time`}
        name={focused ?? 'You'}
        mark={
          <RankedBrandMark
            rows={points.at(-1)?.rankings}
            name={focused === null || focusedIsBrand ? null : focused}
          />
        }
        data={chartPoints}
        series={competitors.map((line) => ({
          ...line,
          mark: <RankedBrandMark rows={points.at(-1)?.rankings} name={line.label} />,
          values: line.values.map(axis.plot),
        }))}
        events={events}
        eventLegend
        yMin={axis.yMin}
        yMax={axis.yMax}
        yFormat={axis.tick}
        format={(plotted) => axis.format(axis.unplot(plotted))}
        lonePoint="plot"
      />
      <p className={textRole('caption')}>{trendCaption(points.length, events)}</p>
    </Stack>
  );
}

function trendCaption(runs: number, events: readonly TrendEvent[]): string {
  if (runs === 1) return 'The trend appears after the next comparable run.';
  return events.some((event) => event.kind === 'action')
    ? 'Lines break between runs that are not comparable; a marker shows when work went live, not that it changed these rates.'
    : 'Lines break between runs that are not comparable.';
}
