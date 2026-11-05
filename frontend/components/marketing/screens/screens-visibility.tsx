import { Badge } from '@/components/ui/badge';
import { BrandMark } from '@/components/ui/brand-mark';
import { Card } from '@/components/ui/card';
import { ChartCard, chartPercent } from '@/components/ui/chart';
import { Citation } from '@/components/ui/citation';
import { Meter } from '@/components/ui/meter';
import { Rungs } from '@/components/ui/rungs';
import { Sparkline } from '@/components/ui/sparkline';
import { TrendChart } from '@/components/ui/trend-chart';

import {
  ANSWER_SOURCES,
  BRANDS,
  CHECKED,
  CITED_DOMAINS,
  ENGINE_NAMES,
  ENGINE_ROWS,
  KPIS,
  PAGE_RETRIEVALS,
  PROMPTS,
  TREND,
  WEEKS,
} from './demo-data';
import {
  ScreenCard,
  ScreenCols,
  ScreenDelta,
  ScreenEngine,
  ScreenEngineMarks,
  ScreenMeta,
  ScreenRoot,
  ScreenSite,
  ScreenStack,
  ScreenStat,
  ScreenTable,
  ScreenTableCard,
  ScreenTabs,
  type ScreenColumn,
} from './screen-parts';

function Cite({ index }: Readonly<{ index: number }>) {
  const source = ANSWER_SOURCES.find((entry) => entry.index === index);
  return source ? <Citation index={source.index} domain={source.domain} own={source.own} /> : null;
}

/** One engine's answer to one prompt: the brand passage highlighted, each claim with its source. */
export function ScreenAnswer() {
  return (
    <ScreenRoot name="answer" width={640} height={400}>
      <ScreenCard
        eyebrow={`ChatGPT · ${CHECKED}`}
        title="Best product analytics for startups"
        action={<Badge tone="accent">Named 1st of 3</Badge>}
      >
        <div className="cl-screen-answer">
          <p>
            <strong>Acme Analytics</strong> is{' '}
            <mark className="cl-mark">the easiest place to start</mark>, with a free tier and
            session replay in one plan. <Cite index={1} />
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
        </div>
        <div className="cl-screen-answer-foot">
          <Rungs level={3} showLabel />
          <ScreenMeta>4 sources</ScreenMeta>
        </div>
      </ScreenCard>
    </ScreenRoot>
  );
}

const percent = (value: number) => `${value.toFixed(1)}%`;

const BRAND_COLUMNS: readonly ScreenColumn<(typeof BRANDS)[number]>[] = [
  { header: 'Brand', cell: (brand) => <ScreenSite label={brand.name} /> },
  { header: 'Visibility', width: 'sm', numeric: true, cell: (brand) => percent(brand.visibility) },
  {
    header: 'Change',
    width: 'sm',
    numeric: true,
    cell: (brand) => <ScreenDelta change={brand.change} />,
  },
];

const PROMPT_COLUMNS: readonly ScreenColumn<(typeof PROMPTS)[number]>[] = [
  { header: 'Prompt', cell: (row) => <span className="cl-screen-strong">{row.prompt}</span> },
  { header: 'Named by', width: 'md', cell: (row) => <ScreenEngineMarks on={row.engines} /> },
  { header: 'Visibility', width: 'xs', numeric: true, cell: (row) => `${row.visibility}%` },
  {
    header: 'Change',
    width: 'sm',
    numeric: true,
    cell: (row) => <ScreenDelta change={{ value: row.change, unit: ' pts', precision: 0 }} />,
  },
];

/** The prompts the card image lists: short buyer questions with a spread of results. */
const PROMPT_ROWS = [0, 1, 3, 5, 8].flatMap((index) => PROMPTS[index] ?? []);

const RETRIEVAL_COLUMNS: readonly ScreenColumn<(typeof PAGE_RETRIEVALS)[number]>[] = [
  { header: 'Model', cell: (row) => <ScreenEngine engine={row.engine} /> },
  { header: 'Retrievals', width: 'sm', numeric: true, cell: (row) => row.retrievals },
  { header: 'Citations', width: 'sm', numeric: true, cell: (row) => row.citations },
];

/** The AI Visibility overview: the KPI row, the trend against competitors and the brand ranking. */
export function ScreenVisibility() {
  return (
    <ScreenRoot name="visibility" width={1200} height={680}>
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
      <ScreenCols layout="main-aside">
        <ChartCard
          title="Visibility over time"
          controls={
            <ScreenTabs
              items={[{ label: '4 weeks' }, { label: '8 weeks' }, { label: '12 weeks' }]}
              selected="8 weeks"
            />
          }
          footnote="412 answers to 120 prompts across 4 engines, week of 27 Oct – 2 Nov 2026"
        >
          <TrendChart
            label="Visibility by week, Acme Analytics against Northwind and Lumen"
            name="Acme Analytics"
            data={WEEKS.map((week, index) => ({ label: week, value: TREND.acme[index] ?? null }))}
            series={[
              { label: 'Northwind', values: TREND.northwind },
              { label: 'Lumen', values: TREND.lumen },
            ]}
            height={292}
            yMin={0}
            yMax={50}
            yFormat={(value) => `${value}%`}
            format={percent}
          />
        </ChartCard>
        <ScreenStack>
          <ScreenTableCard title="Brands">
            <ScreenTable
              caption="Visibility by brand this week"
              rows={BRANDS}
              rowKey={(brand) => brand.name}
              own={(brand) => brand.own === true}
              columns={BRAND_COLUMNS}
            />
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
    </ScreenRoot>
  );
}

/** Every citation this week, across every domain. */
const CITATIONS = CITED_DOMAINS.reduce((total, domain) => total + domain.value, 0);
/** The four most-cited domains: the card is one focused list, not every domain. */
const TOP_DOMAINS = CITED_DOMAINS.filter((domain) => domain.other !== true).slice(0, 4);

/**
 * Cited sources, as a card vignette: the four domains answers cite most,
 * each with its mark, its share of every citation and its citation count,
 * your own site named. Large type, so it still reads scaled down in a tile.
 */
export function ScreenSources() {
  return (
    <ScreenRoot name="sources" width={480} height={400}>
      <Card className="cl-vignette">
        <div className="cl-vignette-head">
          <p className="cl-vignette-title">Cited domains</p>
          <p className="cl-vignette-sub">{`${CITATIONS.toLocaleString('en-US')} citations this week`}</p>
        </div>
        <ol className="cl-vignette-list" aria-label="Citations by domain this week">
          {TOP_DOMAINS.map((domain) => (
            <li key={domain.label} className="cl-vignette-line">
              <span className="cl-vignette-item">
                <BrandMark name={domain.label} placement="header" />
                <span className="cl-vignette-head">
                  <span>{domain.label}</span>
                  <span className="cl-vignette-sub">
                    {`${domain.own ? 'Your site · ' : ''}${chartPercent(domain.value, CITATIONS)} of citations`}
                  </span>
                </span>
              </span>
              <span className="cl-vignette-figure">{domain.value}</span>
            </li>
          ))}
        </ol>
      </Card>
    </ScreenRoot>
  );
}

/** The tracked prompts: which engines name the brand for each, its visibility and change. */
export function ScreenPrompts() {
  return (
    <ScreenRoot name="prompts" width={640} height={400}>
      <ScreenTableCard title="Prompts" meta="120 tracked · 412 answers this week">
        <ScreenTable
          caption="Tracked prompts"
          rows={PROMPT_ROWS}
          rowKey={(row) => row.prompt}
          columns={PROMPT_COLUMNS}
        />
      </ScreenTableCard>
    </ScreenRoot>
  );
}

/** One of your cited pages: its citation figures and which engines fetched and cited it. */
export function ScreenCitedUrl() {
  return (
    <ScreenRoot name="cited-url" width={640} height={400}>
      <ScreenTableCard
        title="acme.com/pricing"
        action={<Badge tone="accent">Your page</Badge>}
        meta="First cited 14 Sep 2026 · retrieved 128 times this week"
      >
        <div className="cl-screen-statrow">
          <ScreenStat label="Citations" value="74" change={{ value: 9, precision: 0 }} />
          <ScreenStat
            label="Citation rate"
            value="14.8"
            unit="%"
            change={{ value: 1.9, unit: ' pts' }}
          />
          <ScreenStat
            label="Prompts using it"
            value="23"
            unit=" / 120"
            change={{ value: 3, precision: 0 }}
          />
        </div>
        <ScreenTable
          caption="Retrievals and citations of acme.com/pricing by engine"
          rows={PAGE_RETRIEVALS}
          rowKey={(row) => row.engine}
          columns={RETRIEVAL_COLUMNS}
        />
      </ScreenTableCard>
    </ScreenRoot>
  );
}
