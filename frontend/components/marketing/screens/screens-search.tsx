import { Badge } from '@/components/ui/badge';
import { Callout } from '@/components/ui/callout';
import { ChartCard } from '@/components/ui/chart';
import { TrendChart } from '@/components/ui/trend-chart';

import {
  ENGINE_ROWS,
  KEYWORDS,
  QUERIES,
  REFERRAL_PAGES,
  REFERRAL_SOURCES,
  THEMES,
  THIS_WEEK,
  WEEKLY_AI_SESSIONS,
  WEEKLY_CLICKS,
  WEEKS,
} from './demo-data';
import {
  ScreenBar,
  ScreenButton,
  ScreenCard,
  ScreenCols,
  ScreenDelta,
  ScreenEngine,
  ScreenMeta,
  ScreenNotedStat,
  ScreenRoot,
  ScreenStat,
  ScreenTable,
  ScreenTableCard,
  ScreenTabs,
  type ScreenColumn,
} from './screen-parts';

const count = (value: number) => value.toLocaleString('en-US');
const points = (values: readonly number[]) =>
  WEEKS.map((week, index) => ({ label: week, value: values[index] ?? null }));

const KEYWORD_COLUMNS: readonly ScreenColumn<(typeof KEYWORDS)[number]>[] = [
  {
    header: 'Keyword',
    cell: (row) => <span className="cl-screen-strong">{row.keyword}</span>,
  },
  { header: 'Position', width: 'sm', numeric: true, cell: (row) => row.position },
  { header: 'Volume', width: 'sm', numeric: true, cell: (row) => count(row.volume) },
  { header: 'Intent', width: 'md', cell: (row) => <Badge>{row.intent}</Badge> },
];

/** The keywords the vignette lists: a spread of positions and intents. */
const KEYWORD_ROWS = KEYWORDS.slice(2, 7);

const QUERY_COLUMNS: readonly ScreenColumn<(typeof QUERIES)[number]>[] = [
  {
    header: 'Query',
    cell: (row) => <span className="cl-screen-strong">{row.query}</span>,
  },
  { header: 'Signal', width: 'lg', cell: (row) => <Badge>{row.signal}</Badge> },
  { header: 'Clicks', width: 'sm', numeric: true, cell: (row) => count(row.clicks) },
  { header: 'Impressions', width: 'md', numeric: true, cell: (row) => count(row.impressions) },
  { header: 'CTR', width: 'xs', numeric: true, cell: (row) => row.ctr },
  { header: 'Position', width: 'sm', numeric: true, cell: (row) => row.position },
];

const REFERRAL_SOURCE_COLUMNS: readonly ScreenColumn<(typeof REFERRAL_SOURCES)[number]>[] = [
  { header: 'Source', cell: (row) => <ScreenEngine engine={row.engine} /> },
  { header: 'Sessions', width: 'sm', numeric: true, cell: (row) => count(row.sessions) },
  { header: 'Engaged', width: 'sm', numeric: true, cell: (row) => row.engaged },
];

const REFERRAL_PAGE_COLUMNS: readonly ScreenColumn<(typeof REFERRAL_PAGES)[number]>[] = [
  {
    header: 'Landing path',
    cell: (row) => <span className="cl-screen-mono">{row.path}</span>,
  },
  { header: 'Sessions', width: 'sm', numeric: true, cell: (row) => count(row.sessions) },
];

const THEME_COLUMNS: readonly ScreenColumn<(typeof THEMES)[number]>[] = [
  {
    header: 'Theme',
    width: 'xl',
    cell: (row) => <span className="cl-screen-strong">{row.theme}</span>,
  },
  { header: 'Tone', width: 'sm', cell: (row) => row.tone },
  { header: 'Positive', width: 'sm', numeric: true, cell: (row) => row.positive },
  { header: 'Negative', width: 'sm', numeric: true, cell: (row) => row.negative },
  {
    header: 'Top quote',
    cell: (row) => <span className="cl-screen-muted">“{row.quote}”</span>,
  },
];

const ENGINE_COLUMNS: readonly ScreenColumn<(typeof ENGINE_ROWS)[number]>[] = [
  { header: 'Engine', cell: (row) => <ScreenEngine engine={row.engine} /> },
  {
    header: 'Visibility',
    width: 'sm',
    numeric: true,
    cell: (row) => `${row.visibility.toFixed(1)}%`,
  },
  {
    header: 'Change',
    width: 'md',
    numeric: true,
    cell: (row) => <ScreenDelta change={row.change} />,
  },
  { header: 'Owned citation rate', width: 'lg', numeric: true, cell: (row) => row.owned },
  { header: 'Avg. position', width: 'md', numeric: true, cell: (row) => row.position },
  { header: 'Answers', width: 'sm', numeric: true, cell: (row) => row.answers },
];

/** Keyword Research: keywords the domain ranks for, with position, volume and intent. */
export function ScreenKeywords() {
  return (
    <ScreenRoot name="keywords" width={640}>
      <ScreenTableCard
        title="Ranked keywords"
        action={<ScreenMeta>1,284 keywords</ScreenMeta>}
        meta="acme.com on google.com, United States · 2 Nov 2026"
      >
        <ScreenTable
          caption="Keywords acme.com ranks for"
          rows={KEYWORD_ROWS}
          rowKey={(row) => row.keyword}
          columns={KEYWORD_COLUMNS}
        />
      </ScreenTableCard>
    </ScreenRoot>
  );
}

/** Search Demand: Search Console clicks over time and the queries behind them. */
export function ScreenDemand() {
  return (
    <ScreenRoot name="demand" width={960}>
      <ChartCard
        title="Search Console"
        controls={
          <ScreenTabs
            items={[{ label: 'Daily' }, { label: 'Weekly' }, { label: 'Monthly' }]}
            selected="Weekly"
          />
        }
        summary={
          <>
            <ScreenStat
              label="Clicks"
              value="3,412"
              change={{ value: 9.8, unit: '%' }}
              period="vs previous"
            />
            <ScreenStat
              label="Impressions"
              value="118.6k"
              change={{ value: 6.1, unit: '%' }}
              period="vs previous"
            />
            <ScreenStat
              label="CTR"
              value="2.9"
              unit="%"
              change={{ value: 0.1, unit: ' pts' }}
              period="vs previous"
            />
            <ScreenStat
              label="Position"
              value="14.2"
              change={{ value: -0.8, policy: 'lower-is-better' }}
              period="vs previous"
            />
          </>
        }
      >
        <TrendChart
          label="Weekly clicks from Google Search, acme.com"
          data={points(WEEKLY_CLICKS)}
          legend={false}
          height={112}
          yMin={600}
          yMax={1000}
          format={count}
          yFormat={count}
        />
      </ChartCard>
      <ScreenTableCard
        title="Top queries"
        action={<ScreenMeta>Last 28 days · 6 Oct – 2 Nov 2026</ScreenMeta>}
      >
        <ScreenTable
          caption="Top Search Console queries"
          rows={QUERIES}
          rowKey={(row) => row.query}
          columns={QUERY_COLUMNS}
        />
      </ScreenTableCard>
    </ScreenRoot>
  );
}

/** AI referrals: GA4 sessions that AI assistants sent, by assistant and landing page. */
export function ScreenReferrals() {
  return (
    <ScreenRoot name="referrals" width={960}>
      <ScreenBar
        start={
          <ScreenTabs
            items={[{ label: 'Overview' }, { label: 'Sources' }, { label: 'Landing pages' }]}
            selected="Overview"
          />
        }
        end={
          <Badge tone="positive" dot>
            GA4 · Synced today, 05:40 UTC
          </Badge>
        }
      />
      <ChartCard
        title="AI-referred sessions"
        summary={
          <>
            <ScreenStat
              label="Sessions"
              value="1,846"
              change={{ value: 41, unit: '%', precision: 0 }}
              period="vs previous 28 days"
            />
            <ScreenStat
              label="Share of GA4 sessions"
              value="3.0"
              unit="%"
              change={{ value: 0.8, unit: ' pts' }}
              period="vs previous"
            />
            <ScreenStat
              label="Key events"
              value="65"
              change={{ value: 19, precision: 0 }}
              period="vs previous"
            />
          </>
        }
      >
        <TrendChart
          label="Weekly sessions referred by AI assistants"
          data={points(WEEKLY_AI_SESSIONS)}
          legend={false}
          height={92}
          yMin={200}
          yMax={600}
        />
      </ChartCard>
      <ScreenCols layout="halves">
        <ScreenTableCard title="AI referral sources">
          <ScreenTable
            caption="Sessions by AI assistant, last 28 days"
            rows={REFERRAL_SOURCES}
            rowKey={(row) => row.engine}
            columns={REFERRAL_SOURCE_COLUMNS}
          />
        </ScreenTableCard>
        <ScreenTableCard title="AI referral landing pages">
          <ScreenTable
            caption="AI-referred sessions by landing page, last 28 days"
            rows={REFERRAL_PAGES}
            rowKey={(row) => row.path}
            columns={REFERRAL_PAGE_COLUMNS}
          />
        </ScreenTableCard>
      </ScreenCols>
    </ScreenRoot>
  );
}

/** Perception: how engines describe the brand, by theme, with verbatim quotes. */
export function ScreenPerception() {
  return (
    <ScreenRoot name="perception" width={960}>
      <ScreenCard
        title="Brand perception"
        action={<ScreenMeta>158 classified mentions this week</ScreenMeta>}
      >
        <div className="cl-screen-pstats">
          <ScreenNotedStat
            label="Net sentiment"
            value="+46"
            note="Mostly positive, up 5 from last week"
          />
          <ScreenNotedStat
            label="Positive"
            value="58"
            unit="%"
            note="92 of 158 classified mentions"
          />
          <ScreenNotedStat
            label="Negative"
            value="12"
            unit="%"
            note="19 of 158 classified mentions"
          />
          <ScreenNotedStat
            label="Recommended"
            value="71"
            unit=" / 158"
            note="Recommended you; 6 advised against"
          />
        </div>
      </ScreenCard>
      <ScreenTableCard
        title="Themes"
        meta="A theme is counted once per answer. Quotes are verbatim."
      >
        <ScreenTable
          caption="What engines say about Acme Analytics, by theme"
          rows={THEMES}
          rowKey={(row) => row.theme}
          columns={THEME_COLUMNS}
        />
      </ScreenTableCard>
    </ScreenRoot>
  );
}

/** Engines: visibility on each engine, Google AI Overviews' own figures, and what moved. */
export function ScreenEngines() {
  return (
    <ScreenRoot name="engines" width={960}>
      <ScreenTableCard title="By engine" action={<ScreenMeta>{THIS_WEEK}</ScreenMeta>}>
        <ScreenTable
          caption="Visibility by engine"
          rows={ENGINE_ROWS}
          rowKey={(row) => row.engine}
          columns={ENGINE_COLUMNS}
        />
      </ScreenTableCard>
      <ScreenCard
        title="Google AI Overviews"
        action={<ScreenMeta>52 of 120 searches showed an overview</ScreenMeta>}
      >
        <div className="cl-screen-pstats">
          <ScreenNotedStat label="Overview shown" value="43.3" unit="%" note="52 of 120 searches" />
          <ScreenNotedStat
            label="Named, when shown"
            value="40.4"
            unit="%"
            note="21 of 52 overviews"
          />
          <ScreenNotedStat
            label="Your site cited"
            value="42.3"
            unit="%"
            note="22 of 52 overviews"
          />
          <ScreenNotedStat
            label="Overall visibility"
            value="17.5"
            unit="%"
            note="21 of 120 searches"
          />
        </div>
      </ScreenCard>
      <Callout
        tone="warning"
        title="Gemini fell 5.8 pts"
        action={<ScreenButton>Ask the Agent</ScreenButton>}
      >
        It stopped citing acme.com/docs/setup after robots.txt restricted Google-Extended on 29 Oct.
      </Callout>
    </ScreenRoot>
  );
}
