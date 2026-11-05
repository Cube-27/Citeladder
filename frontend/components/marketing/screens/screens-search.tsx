import { Badge } from '@/components/ui/badge';
import { EngineMark } from '@/components/ui/engine-mark';

import {
  ENGINE_NAMES,
  ENGINE_ROWS,
  KEYWORDS,
  THEMES,
  WEEKLY_CLICKS,
  WEEKLY_REFERRALS,
  WEEKS,
} from './demo-data';
import { ScreenDelta } from './screen-parts';
import {
  Vignette,
  VignetteBar,
  VignetteChart,
  VignetteRows,
  VignetteStats,
  fourRows,
} from './screen-vignette';

const count = (value: number) => value.toLocaleString('en-US');

/** Keyword Research: keywords the domain ranks for, with position, volume and intent. */
export function ScreenKeywords() {
  return (
    <Vignette
      title="Ranked keywords"
      meta="acme.com on google.com, United States"
      badge={<Badge>1,284 keywords</Badge>}
    >
      <VignetteRows
        label="Keywords acme.com ranks for"
        rows={fourRows(KEYWORDS.slice(2, 6), (row) => ({
          key: row.keyword,
          label: row.keyword,
          secondary: `${count(row.volume)} searches a month · ${row.page}`,
          extra: <Badge>{row.intent}</Badge>,
          value: `#${row.position}`,
        }))}
      />
    </Vignette>
  );
}

/** Search Demand: Search Console clicks, CTR and position, and weekly clicks. */
export function ScreenDemand() {
  return (
    <Vignette
      title="Google Search"
      meta="acme.com · last 28 days"
      badge={<Badge>Search Console</Badge>}
    >
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
      <VignetteChart
        label="Weekly clicks from Google Search, acme.com"
        weeks={WEEKS}
        values={WEEKLY_CLICKS}
        ticks={[600, 800, 1000]}
        format={count}
      />
    </Vignette>
  );
}

/** AI referrals: GA4 sessions that AI assistants sent, and the weekly trend. */
export function ScreenReferrals() {
  return (
    <Vignette
      title="Sessions from AI assistants"
      meta="acme.com · last 28 days"
      badge={<Badge>Google Analytics 4</Badge>}
    >
      <VignetteStats
        stats={[
          { label: 'Sessions', value: '1,846', change: { value: 41, unit: '%', precision: 0 } },
          { label: 'Share of sessions', value: '3.0%', change: { value: 0.8, unit: ' pts' } },
          { label: 'Key events', value: '65', change: { value: 12, precision: 0 } },
        ]}
      />
      <VignetteChart
        label="Weekly sessions from AI assistants, acme.com"
        weeks={WEEKS}
        values={WEEKLY_REFERRALS}
        ticks={[200, 400, 600]}
        format={count}
      />
    </Vignette>
  );
}

/** Perception: how engines describe the brand, theme by theme. */
export function ScreenPerception() {
  return (
    <Vignette
      title="Brand perception"
      meta="Acme Analytics · themes in 412 answers"
      badge={<Badge tone="positive">Net sentiment +46</Badge>}
    >
      <VignetteRows
        label="Themes in answers about Acme Analytics"
        rows={fourRows(THEMES, (row) => ({
          key: row.theme,
          label: row.theme,
          secondary: `${row.positive} positive · ${row.negative} negative`,
          extra: <VignetteBar share={row.positive / (row.positive + row.negative)} />,
          value: <Badge tone={row.tone === 'Positive' ? 'positive' : 'neutral'}>{row.tone}</Badge>,
        }))}
      />
    </Vignette>
  );
}

/** Engines: the brand's visibility on each engine and its change this week. */
export function ScreenEngines() {
  return (
    <Vignette
      title="Visibility by engine"
      meta="Acme Analytics · change vs last week"
      badge={<Badge>27 Oct – 2 Nov</Badge>}
    >
      <VignetteRows
        label="Visibility by engine this week"
        rows={fourRows(ENGINE_ROWS, (row) => ({
          key: row.engine,
          lead: <EngineMark engine={row.engine} />,
          label: ENGINE_NAMES[row.engine],
          secondary: <ScreenDelta change={row.change} />,
          extra: <VignetteBar share={row.visibility / 100} />,
          value: `${row.visibility.toFixed(1)}%`,
        }))}
      />
    </Vignette>
  );
}
