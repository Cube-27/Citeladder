import { Card } from '@/components/ui/card';
import { FigureStrip, type FigureSegment } from '@/components/ui/figure-strip';
import { StepChart, type TrendEvent } from '@/components/ui/step-chart';
import { textRole } from '@/components/ui/typography';

import {
  BRANDS,
  TREND,
  TREND_EVENTS,
  WEEKS,
  WIN_ANSWERS,
  type Brand,
  type BrandSentiment,
} from './demo-data';
import { ScreenMenuButton, ScreenPageHeader, ScreenSidebar } from './screen-app';
import {
  ScreenChartCard,
  ScreenDelta,
  ScreenSite,
  ScreenTable,
  ScreenTableCard,
  ScreenTabs,
  type ScreenColumn,
} from './screen-parts';
import { percent } from './visibility-demo';

const FILTERS = ['Latest run', 'All engines', 'All markets', 'All topics'] as const;
const METRICS = ['Visibility', 'Share of voice', 'Position', 'Win rate', 'Sentiment'];

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
/** Each week's start: 8 Sep 2026 onwards, so the axis and the event marks share real time. */
const WEEK_TIMES = WEEKS.map((_, index) => Date.UTC(2026, 8, 8) + index * WEEK_MS);

const winRate = (brand: Brand) => percent((brand.wins / WIN_ANSWERS) * 100);
const signed = (net: number) => (net > 0 ? `+${net}` : `${net}`);

const OWN = BRANDS.find((brand) => brand.own === true);
if (!OWN) throw new Error('The demo dataset needs its own brand.');
/** Where the demo brand ranks by visibility, and the brand just ahead: computed, as the app does. */
const AHEAD = BRANDS.filter((brand) => brand.visibility > OWN.visibility);
const RANK = AHEAD.length + 1;

function sentimentValue(sentiment: BrandSentiment): string {
  switch (sentiment.kind) {
    case 'value':
      return signed(sentiment.net);
    case 'too_few':
      return 'Too few classified';
    default: {
      const unhandled: never = sentiment;
      return unhandled;
    }
  }
}

const FIGURES: readonly FigureSegment[] = [
  {
    key: 'visibility',
    label: 'Visibility',
    value: percent(OWN.visibility),
    delta: <ScreenDelta change={OWN.change} />,
  },
  { key: 'sentiment', label: 'Sentiment', value: sentimentValue(OWN.sentiment) },
  { key: 'position', label: 'Position', value: OWN.position.toFixed(1) },
  { key: 'win_rate', label: 'Win rate', value: winRate(OWN) },
  {
    key: 'sov',
    label: 'Share of voice',
    value: percent(OWN.shareOfVoice),
    delta: <ScreenDelta change={{ value: 1.9, unit: ' pp' }} />,
  },
];

const EVENTS: readonly TrendEvent[] = TREND_EVENTS.map((event) => ({
  key: event.label,
  timestamp: WEEK_TIMES[event.week] ?? 0,
  label: `${WEEKS[event.week] ?? ''} · ${event.label}`,
  kind: event.kind,
}));

/** "Your brand over time": the demo brand's visibility against the three tracked brands, with what changed. */
function BrandTrend() {
  return (
    <StepChart
      label="Visibility over time"
      name="You"
      data={WEEKS.map((week, index) => {
        const value = TREND.acme[index] ?? null;
        return {
          label: `${week} 2026 · ${value === null ? '' : percent(value)}`,
          axisLabel: week,
          value,
          timestamp: WEEK_TIMES[index] ?? 0,
        };
      })}
      series={[
        { label: 'Northwind', identity: 'northwind.io', values: TREND.northwind },
        { label: 'Lumen', identity: 'lumen.app', values: TREND.lumen },
        { label: 'Fathom Labs', identity: 'fathomlabs.com', values: TREND.fathom },
      ]}
      events={EVENTS}
      eventLegend
      yMin={0}
      yMax={50}
      yFormat={(value) => `${value}%`}
      format={percent}
    />
  );
}

const COMPETITOR_COLUMNS: readonly ScreenColumn<Brand>[] = [
  { header: 'Brand', cell: (brand) => <ScreenSite label={brand.name} /> },
  { header: 'Visibility', width: 'xs', numeric: true, cell: (brand) => percent(brand.visibility) },
  {
    header: 'Share of voice',
    width: 'sm',
    numeric: true,
    cell: (brand) => percent(brand.shareOfVoice),
  },
  { header: 'Position', width: 'xs', numeric: true, cell: (brand) => brand.position.toFixed(1) },
  { header: 'Win rate', width: 'xs', numeric: true, cell: winRate },
  {
    header: 'Sentiment',
    width: 'lg',
    numeric: true,
    cell: ({ sentiment }) =>
      sentiment.kind === 'value' ? (
        <>
          {signed(sentiment.net)}
          <span className="text-ink-muted">{` · ${sentiment.classified}`}</span>
        </>
      ) : (
        <span className="text-ink-muted">{sentimentValue(sentiment)}</span>
      ),
  },
  {
    header: 'Change',
    width: 'xs',
    numeric: true,
    cell: (brand) => <ScreenDelta change={brand.change} />,
  },
];

/**
 * The home page's first product view: Brand → Insights inside the app's own
 * chrome, as the app and the approved navigation mockup draw it. The lede
 * (where you rank, the five key figures), your brand over time with its
 * event marks, then you and your competitors, cut by the frame's foot.
 */
export function ScreenAppInsights() {
  return (
    <div className="cl-screen cl-screen--app cl-screen--app-overview">
      <ScreenSidebar active="Insights" />
      <div className="cl-app-main">
        <ScreenPageHeader title="Insights" />
        <div className="cl-app-bands">
          <span className="cl-app-filters">
            {FILTERS.map((filter) => (
              <ScreenMenuButton key={filter}>{filter}</ScreenMenuButton>
            ))}
          </span>
        </div>
        <div className="cl-app-content">
          <Card>
            <div className="cl-app-lede">
              <p className={textRole('caption')}>
                412 answers from 120 prompts on 4 engines, week of 27 Oct – 2 Nov 2026
              </p>
              <p className={textRole('title')}>{`You're #${RANK} in AI visibility`}</p>
              {AHEAD.at(-1) && (
                <p className={textRole('body', 'text-ink-2')}>
                  {`${AHEAD.at(-1)?.name} is named more often.`}
                </p>
              )}
            </div>
            <FigureStrip segments={FIGURES} />
          </Card>
          <ScreenChartCard
            title="Your brand over time"
            controls={
              <>
                <ScreenTabs items={METRICS.map((label) => ({ label }))} selected="Visibility" />
                <ScreenMenuButton>Focus: All brands</ScreenMenuButton>
              </>
            }
            footnote="You and the 3 tracked brands named most often in the latest period; use Focus to plot one on its own. A marker shows when work went live, not that it changed these rates."
          >
            <BrandTrend />
          </ScreenChartCard>
          <ScreenTableCard title="You and your competitors" meta="This week, by visibility">
            <ScreenTable
              caption="You and your competitors this week"
              rows={BRANDS}
              rowKey={(brand) => brand.name}
              own={(brand) => brand.own === true}
              columns={COMPETITOR_COLUMNS}
            />
          </ScreenTableCard>
        </div>
      </div>
    </div>
  );
}
