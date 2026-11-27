import { Badge } from '@/components/ui/badge';
import { EngineMark } from '@/components/ui/engine-mark';

import {
  DEMAND_SIGNALS,
  ENGINE_NAMES,
  ENGINE_ROWS,
  KEYWORDS,
  THEMES,
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

export function ScreenDemand() {
  return (
    <Vignette
      title="Search signals"
      meta="acme.com · Search Console, last 28 days"
      badge={<Badge>18 signals</Badge>}
    >
      <VignetteRows
        label="Search signals, strongest first"
        rows={fourRows(DEMAND_SIGNALS, (row) => ({
          key: row.query,
          label: row.query,
          secondary: row.detail,
          extra: <Badge>{row.signal}</Badge>,
          value: row.figure,
        }))}
      />
    </Vignette>
  );
}

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
          { label: 'Share of sessions', value: '3.0%', change: { value: 0.8, unit: ' pp' } },
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

export function ScreenPerception() {
  return (
    <Vignette
      title="Brand perception"
      meta="Acme Analytics · themes in 412 answers"
      badge={<Badge tone="selected">Net sentiment +46</Badge>}
    >
      <VignetteRows
        label="Themes in answers about Acme Analytics"
        rows={fourRows(THEMES, (row) => ({
          key: row.theme,
          label: row.theme,
          secondary: `${row.positive} positive · ${row.negative} negative`,
          extra: <VignetteBar share={row.positive / (row.positive + row.negative)} />,
          value: <Badge tone="selected">{row.tone}</Badge>,
        }))}
      />
    </Vignette>
  );
}

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
