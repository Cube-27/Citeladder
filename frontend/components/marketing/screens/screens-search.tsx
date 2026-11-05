import { Badge } from '@/components/ui/badge';

import { ENGINE_ROWS, KEYWORDS, REFERRAL_SOURCES, THEMES, WEEKLY_CLICKS, WEEKS } from './demo-data';
import {
  ScreenDelta,
  ScreenEngine,
  ScreenMeta,
  ScreenRoot,
  ScreenTable,
  ScreenTableCard,
  type ScreenColumn,
} from './screen-parts';
import {
  ScreenAreaChart,
  VIGNETTE_PLOT_WIDTH,
  VignetteBar,
  VignetteCard,
  VignetteFigure,
  VignetteRows,
  VignetteStats,
} from './screen-vignette';

const count = (value: number) => value.toLocaleString('en-US');
/** The referral bars scale to the largest source. */
const REFERRAL_TOP = Math.max(1, ...REFERRAL_SOURCES.map((row) => row.sessions));

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

/** Keyword Research: keywords the domain ranks for, with position, volume and intent. */
export function ScreenKeywords() {
  return (
    <ScreenRoot name="keywords" width={640} height={400}>
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
    <ScreenRoot name="demand" width={480} height={360}>
      <VignetteCard title="Google Search" badge={<Badge>Last 28 days</Badge>}>
        <VignetteStats
          stats={[
            { label: 'Clicks', value: '3,412', change: { value: 9.8, unit: '%' } },
            { label: 'CTR', value: '2.9%', change: { value: 0.1, unit: ' pts' } },
            {
              label: 'Avg. position',
              value: '14.2',
              change: { value: -0.8, policy: 'lower-is-better' },
            },
          ]}
        />
        <ScreenAreaChart
          label="Weekly clicks from Google Search, acme.com"
          weeks={WEEKS}
          values={WEEKLY_CLICKS}
          width={VIGNETTE_PLOT_WIDTH}
          height={160}
          ticks={[600, 800, 1000]}
          format={count}
        />
      </VignetteCard>
    </ScreenRoot>
  );
}

/** AI referrals: GA4 sessions that AI assistants sent, by assistant and landing page. */
export function ScreenReferrals() {
  return (
    <ScreenRoot name="referrals" width={480} height={360}>
      <VignetteCard title="Sessions from AI assistants" badge={<Badge>Last 28 days</Badge>}>
        <VignetteFigure
          value="1,846"
          change={{ value: 41, unit: '%', precision: 0 }}
          period="vs previous 28 days"
        />
        <VignetteRows layout="sources" rows={REFERRAL_SOURCES} rowKey={(row) => row.engine}>
          {(row) => (
            <>
              <ScreenEngine engine={row.engine} />
              <VignetteBar share={row.sessions / REFERRAL_TOP} />
              <span className="cl-screen-vnum">{count(row.sessions)}</span>
            </>
          )}
        </VignetteRows>
      </VignetteCard>
    </ScreenRoot>
  );
}

/** Perception: how engines describe the brand, by theme, with verbatim quotes. */
export function ScreenPerception() {
  return (
    <ScreenRoot name="perception" width={480} height={360}>
      <VignetteCard
        title="Brand perception"
        badge={<Badge tone="positive">Net sentiment +46</Badge>}
      >
        <VignetteRows layout="themes" rows={THEMES} rowKey={(row) => row.theme}>
          {(row) => (
            <>
              <span className="cl-screen-strong">{row.theme}</span>
              <span className="cl-screen-muted">{`${row.positive} positive · ${row.negative} negative`}</span>
              <Badge tone={row.tone === 'Positive' ? 'positive' : 'neutral'}>{row.tone}</Badge>
            </>
          )}
        </VignetteRows>
      </VignetteCard>
    </ScreenRoot>
  );
}

/** Engines: visibility on each engine, Google AI Overviews' own figures, and what moved. */
export function ScreenEngines() {
  return (
    <ScreenRoot name="engines" width={480} height={360}>
      <VignetteCard title="Visibility by engine" badge={<Badge>27 Oct – 2 Nov</Badge>}>
        <VignetteRows layout="engines" rows={ENGINE_ROWS} rowKey={(row) => row.engine}>
          {(row) => (
            <>
              <ScreenEngine engine={row.engine} />
              <VignetteBar share={row.visibility / 100} />
              <span className="cl-screen-vnum">{`${row.visibility.toFixed(1)}%`}</span>
              <ScreenDelta change={row.change} />
            </>
          )}
        </VignetteRows>
      </VignetteCard>
    </ScreenRoot>
  );
}
