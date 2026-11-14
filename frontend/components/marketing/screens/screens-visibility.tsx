import { Badge } from '@/components/ui/badge';
import { BrandMark } from '@/components/ui/brand-mark';
import { Card } from '@/components/ui/card';
import { chartPercent } from '@/components/ui/chart';
import { Citation } from '@/components/ui/citation';
import { EngineMark } from '@/components/ui/engine-mark';
import { Meter } from '@/components/ui/meter';
import { Rungs } from '@/components/ui/rungs';
import { Sparkline } from '@/components/ui/sparkline';

import {
  ANSWER_SOURCES,
  CHECKED,
  CITED_DOMAINS,
  ENGINE_NAMES,
  ENGINE_ROWS,
  KPIS,
  PAGE_RETRIEVALS,
  PROMPTS,
} from './demo-data';
import {
  ScreenCard,
  ScreenChartCard,
  ScreenCols,
  ScreenEngineMarks,
  ScreenStack,
  ScreenStat,
  ScreenTableCard,
  ScreenTabs,
} from './screen-parts';
import { Vignette, VignetteBar, VignetteRows, fourRows } from './screen-vignette';
import { BrandTable, VisibilityTrend, percent } from './visibility-demo';
import './screen-vignette.css';
import './screen-app.css';

function Cite({ index }: Readonly<{ index: number }>) {
  const source = ANSWER_SOURCES.find((entry) => entry.index === index);
  return source ? <Citation index={source.index} domain={source.domain} own={source.own} /> : null;
}

/** One engine's answer to one prompt: the brand passage highlighted, each claim with its source. */
export function ScreenAnswer() {
  return (
    <Vignette
      title="Best product analytics for startups"
      meta={`ChatGPT · ${CHECKED}`}
      badge={<Badge tone="accent">Named 1st of 3</Badge>}
    >
      <div className="cl-vig-panel">
        <p>
          <strong>Acme Analytics</strong> is{' '}
          <mark className="cl-mark">the easiest place to start</mark>, with a free tier and session
          replay in one plan. <Cite index={1} />
        </p>
        <p>
          <strong>Northwind</strong> suits teams that already run a data warehouse.{' '}
          <Cite index={4} />
        </p>
        <p>
          <strong>Lumen</strong> is built for mobile apps. <Cite index={3} />
        </p>
        <p>
          Reviewers rate Acme highest for setup time. <Cite index={2} />
        </p>
        <div className="cl-vig-foot">
          <Rungs level={3} showLabel />
          <span className="cl-vig-muted">4 sources</span>
        </div>
      </div>
    </Vignette>
  );
}

/**
 * The AI Visibility overview, a full app layout at 1200 × 704 scaled to fit
 * its frame: the KPI row, the trend against competitors and the brand ranking.
 */
export function ScreenVisibility() {
  return (
    <div className="cl-screen cl-screen--visibility">
      <Card>
        <div className="cl-screen-kpis">
          {KPIS.map((kpi) => (
            <div key={kpi.label} className="cl-screen-kpi">
              <ScreenStat label={kpi.label} value={kpi.value} unit={kpi.unit} change={kpi.change} />
              <Sparkline values={kpi.spark} tone="accent" />
            </div>
          ))}
        </div>
      </Card>
      <ScreenCols>
        <ScreenChartCard
          title="Visibility over time"
          controls={
            <ScreenTabs
              items={[{ label: '4 weeks' }, { label: '8 weeks' }, { label: '12 weeks' }]}
              selected="8 weeks"
            />
          }
          footnote="412 answers to 120 prompts across 4 engines, week of 27 Oct – 2 Nov 2026"
        >
          <VisibilityTrend height="lg" />
        </ScreenChartCard>
        <ScreenStack>
          <ScreenTableCard title="Brands">
            <BrandTable />
          </ScreenTableCard>
          <ScreenCard title="Acme Analytics by engine">
            <div className="cl-screen-meters">
              {ENGINE_ROWS.map((row) => (
                <Meter
                  key={row.engine}
                  label={ENGINE_NAMES[row.engine]}
                  value={row.visibility}
                  valueLabel={percent(row.visibility)}
                  tone="accent"
                />
              ))}
            </div>
          </ScreenCard>
        </ScreenStack>
      </ScreenCols>
    </div>
  );
}

/** Every citation this week, across every domain. */
const CITATIONS = CITED_DOMAINS.reduce((total, domain) => total + domain.value, 0);
/** The bars scale to the most-cited domain. */
const TOP_CITED = Math.max(1, ...CITED_DOMAINS.map((domain) => domain.value));

/**
 * Cited sources: the four domains answers cite most, each with its share of
 * every citation and its citation count, your own site named.
 */
export function ScreenSources() {
  return (
    <Vignette
      title="Cited domains"
      meta={`${CITATIONS.toLocaleString('en-US')} citations this week`}
      badge={<Badge tone="accent">Owned 20.3%</Badge>}
    >
      <VignetteRows
        label="Citations by domain this week"
        ordered
        rows={fourRows(
          CITED_DOMAINS.filter((domain) => domain.other !== true),
          (domain) => ({
            key: domain.label,
            lead: <BrandMark name={domain.label} />,
            label: domain.label,
            secondary: `${domain.own ? 'Your site · ' : ''}${chartPercent(domain.value, CITATIONS)} of citations`,
            extra: <VignetteBar share={domain.value / TOP_CITED} />,
            value: domain.value,
          }),
        )}
      />
    </Vignette>
  );
}

/** The prompts the card lists: short buyer questions with a spread of results. */
const PROMPT_ROWS = [0, 1, 3, 5].flatMap((index) => PROMPTS[index] ?? []);

/** The tracked prompts: which engines name the brand for each, and its visibility. */
export function ScreenPrompts() {
  return (
    <Vignette
      title="Prompts"
      meta="120 tracked · 412 answers this week"
      badge={<Badge>4 engines</Badge>}
    >
      <VignetteRows
        label="Tracked prompts"
        rows={fourRows(PROMPT_ROWS, (row) => ({
          key: row.prompt,
          label: row.prompt,
          secondary: row.topic,
          extra: <ScreenEngineMarks on={row.engines} />,
          value: `${row.visibility}%`,
        }))}
      />
    </Vignette>
  );
}

/** The retrieval bars scale to the engine that fetched the page most. */
const TOP_RETRIEVALS = Math.max(1, ...PAGE_RETRIEVALS.map((row) => row.retrievals));

/** One of your cited pages: which engines fetched it and how often each cited it. */
export function ScreenCitedUrl() {
  return (
    <Vignette
      title="acme.com/pricing"
      meta="74 citations this week · 14.8% citation rate"
      badge={<Badge tone="accent">Your page</Badge>}
    >
      <VignetteRows
        label="Retrievals and citations of acme.com/pricing by engine"
        rows={fourRows(PAGE_RETRIEVALS, (row) => ({
          key: row.engine,
          lead: <EngineMark engine={row.engine} />,
          label: ENGINE_NAMES[row.engine],
          secondary: `${row.retrievals} retrievals`,
          extra: <VignetteBar share={row.retrievals / TOP_RETRIEVALS} />,
          value: `${row.citations} cited`,
        }))}
      />
    </Vignette>
  );
}
