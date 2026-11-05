import { ExternalLink, Plus, Sparkles } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { BarList } from '@/components/ui/bar-list';
import { BrandMark } from '@/components/ui/brand-mark';
import { Card } from '@/components/ui/card';
import { ChartCard } from '@/components/ui/chart';
import { Citation } from '@/components/ui/citation';
import { Meter } from '@/components/ui/meter';
import { Passage } from '@/components/ui/passage';
import { Rungs } from '@/components/ui/rungs';
import { SearchField } from '@/components/ui/search-field';
import { Sparkline } from '@/components/ui/sparkline';
import { Switch } from '@/components/ui/switch';
import { TrendChart } from '@/components/ui/trend-chart';

import {
  ANSWER_SOURCES,
  BRANDS,
  CHECKED,
  CITED_DOMAINS,
  ENGINE_NAMES,
  ENGINE_ROWS,
  KPIS,
  OWN_PAGES,
  PAGE_RETRIEVALS,
  PROMPTS,
  THIS_WEEK,
  TREND,
  WEEKS,
} from './demo-data';
import {
  ScreenBar,
  ScreenButton,
  ScreenCard,
  ScreenCols,
  ScreenDelta,
  ScreenEngine,
  ScreenEngineMarks,
  ScreenMeta,
  ScreenNote,
  ScreenRoot,
  ScreenSite,
  ScreenStack,
  ScreenStat,
  ScreenTable,
  ScreenTableCard,
  ScreenTabs,
  type ScreenColumn,
} from './screen-parts';

/** A still's controls are drawn, never wired. */
const still = () => undefined;

const ENGINE_TABS = Object.values(ENGINE_NAMES).map((label) => ({ label }));
/** The brands the answer names, in the order it names them; Acme is the tracked brand. */
const ANSWER_BRANDS = ['Acme Analytics', 'Northwind', 'Lumen'] as const;

function Cite({ index }: Readonly<{ index: number }>) {
  const source = ANSWER_SOURCES.find((entry) => entry.index === index);
  return source ? <Citation index={source.index} domain={source.domain} own={source.own} /> : null;
}

/** One engine answer to one prompt, the brand passage highlighted, with its brands and sources. */
export function ScreenAnswer() {
  return (
    <ScreenRoot name="answer" width={960}>
      <ScreenBar
        start={<ScreenTabs items={ENGINE_TABS} selected="ChatGPT" />}
        end={<ScreenMeta>{CHECKED}</ScreenMeta>}
      />
      <ScreenCols layout="main-side">
        <ScreenCard eyebrow="Prompt" title="Best product analytics for startups">
          <div className="cl-screen-answer">
            <p>For an early-stage team, three tools come up most often.</p>
            <p>
              <strong>Acme Analytics</strong> is{' '}
              <mark className="cl-mark">
                the easiest place to start: a free tier up to 10,000 events a month
              </mark>{' '}
              and funnels, retention and session replay in one plan. <Cite index={1} />
            </p>
            <p>
              <strong>Northwind</strong> suits teams that already run a data warehouse.{' '}
              <Cite index={4} />
            </p>
            <p>
              <strong>Lumen</strong> is built for mobile apps, with a plan for small teams.{' '}
              <Cite index={3} />
            </p>
            <p>
              Reviewers rate Acme highest for setup time. <Cite index={2} />
            </p>
          </div>
          <div className="cl-screen-answer-foot">
            <Rungs level={3} showLabel />
            <Badge tone="accent">Named 1st of 3 brands</Badge>
            <ScreenMeta>4 sources</ScreenMeta>
          </div>
        </ScreenCard>
        <ScreenStack>
          <ScreenCard title="Brands in this answer">
            <ol className="cl-screen-rank">
              {ANSWER_BRANDS.map((name, index) => (
                <li key={name} className="cl-screen-rank-row">
                  <span className="cl-screen-rank-n">#{index + 1}</span>
                  <ScreenSite label={name} />
                  <Badge tone={index === 0 ? 'accent' : 'neutral'}>
                    {index === 0 ? 'You' : 'Competitor'}
                  </Badge>
                </li>
              ))}
            </ol>
          </ScreenCard>
          <ScreenCard title="Sources">
            <ul className="cl-screen-cites">
              {ANSWER_SOURCES.map((source) => (
                <li key={source.index}>
                  <Citation {...source} />
                </li>
              ))}
            </ul>
          </ScreenCard>
        </ScreenStack>
      </ScreenCols>
    </ScreenRoot>
  );
}

const percent = (value: number) => `${value.toFixed(1)}%`;

const BRAND_COLUMNS: readonly ScreenColumn<(typeof BRANDS)[number]>[] = [
  { header: 'Brand', cell: (brand) => <ScreenSite label={brand.name} /> },
  { header: 'Visibility', width: 'sm', numeric: true, cell: (brand) => percent(brand.visibility) },
  {
    header: 'Change',
    width: 'md',
    numeric: true,
    cell: (brand) => <ScreenDelta change={brand.change} />,
  },
];

const OWN_PAGE_COLUMNS: readonly ScreenColumn<(typeof OWN_PAGES)[number]>[] = [
  { header: 'Page', cell: (page) => <span className="cl-screen-mono">{page.path}</span> },
  { header: 'Citations', width: 'sm', numeric: true, cell: (page) => page.citations },
];

const PROMPT_COLUMNS: readonly ScreenColumn<(typeof PROMPTS)[number]>[] = [
  { header: 'Prompt', cell: (row) => <span className="cl-screen-strong">{row.prompt}</span> },
  {
    header: 'Topic',
    width: 'lg',
    cell: (row) => <span className="cl-screen-muted">{row.topic}</span>,
  },
  { header: 'Named by', width: 'md', cell: (row) => <ScreenEngineMarks on={row.engines} /> },
  { header: 'Visibility', width: 'sm', numeric: true, cell: (row) => `${row.visibility}%` },
  { header: 'Owned citations', width: 'md', numeric: true, cell: (row) => row.owned },
  { header: 'Avg. mention position', width: 'lg', numeric: true, cell: (row) => row.position },
  {
    header: 'Change',
    width: 'sm',
    numeric: true,
    cell: (row) => <ScreenDelta change={{ value: row.change, unit: ' pts', precision: 0 }} />,
  },
  {
    header: 'Enabled',
    width: 'xs',
    cell: (row) => <Switch checked onCheckedChange={still} label={`Enabled: ${row.prompt}`} />,
  },
];

const RETRIEVAL_COLUMNS: readonly ScreenColumn<(typeof PAGE_RETRIEVALS)[number]>[] = [
  { header: 'Model', cell: (row) => <ScreenEngine engine={row.engine} /> },
  { header: 'Retrievals', width: 'sm', numeric: true, cell: (row) => row.retrievals },
  { header: 'Citations', width: 'sm', numeric: true, cell: (row) => row.citations },
];

/** The AI Visibility overview: the KPI row, the trend against competitors and the brand ranking. */
export function ScreenVisibility() {
  return (
    <ScreenRoot name="visibility" width={1200}>
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

/** Cited sources: the domains answers cite and the share each holds, beside your own pages. */
export function ScreenSources() {
  return (
    <ScreenRoot name="sources" width={960}>
      <ScreenBar
        start={
          <ScreenTabs
            items={[
              { label: 'All sources', count: 186 },
              { label: 'Your pages', count: 4 },
              { label: 'Third-party', count: 182 },
            ]}
            selected="All sources"
          />
        }
        end={<ScreenMeta>{THIS_WEEK}</ScreenMeta>}
      />
      <ScreenCols layout="main-side">
        <ScreenCard title="Cited domains" action={<Badge>1,046 citations in 412 answers</Badge>}>
          <BarList
            label="Citations by domain this week"
            header={['Domain', 'Citations', 'Share']}
            items={CITED_DOMAINS.map((domain) => ({
              ...domain,
              mark: domain.other ? undefined : <BrandMark name={domain.label} placement="inline" />,
            }))}
          />
        </ScreenCard>
        <ScreenStack>
          <Card>
            <ScreenStat
              label="Owned citation rate"
              value="29.4"
              unit="%"
              change={{ value: 2.6, unit: ' pts' }}
            />
            <ScreenNote>121 of 412 answers cite an acme.com page</ScreenNote>
          </Card>
          <ScreenTableCard title="Your cited pages" meta="acme.com: 212 citations across 4 pages">
            <ScreenTable
              caption="Citations of acme.com pages this week"
              rows={OWN_PAGES}
              rowKey={(page) => page.path}
              columns={OWN_PAGE_COLUMNS}
            />
          </ScreenTableCard>
        </ScreenStack>
      </ScreenCols>
    </ScreenRoot>
  );
}

/** The tracked prompts table: who each prompt names, your visibility, citations and change. */
export function ScreenPrompts() {
  return (
    <ScreenRoot name="prompts" width={1200}>
      <ScreenBar
        start={
          <>
            <ScreenTabs
              items={[
                { label: 'Active', count: 120 },
                { label: 'Archived', count: 8 },
              ]}
              selected="Active"
            />
            <div className="cl-screen-search">
              <SearchField
                value=""
                onValueChange={still}
                placeholder="Search prompts"
                aria-label="Search prompts"
              />
            </div>
          </>
        }
        end={
          <>
            <ScreenButton icon={Sparkles}>Generate prompts</ScreenButton>
            <ScreenButton variant="primary" icon={Plus}>
              Add prompt
            </ScreenButton>
          </>
        }
      />
      <ScreenTableCard
        title="Prompts"
        action={<ScreenMeta>412 answers this week · {CHECKED}</ScreenMeta>}
        meta="Visibility is the share of this week’s answers that name Acme Analytics."
        pages="1–10 of 120 prompts"
      >
        <ScreenTable
          caption="Tracked prompts"
          rows={PROMPTS}
          rowKey={(row) => row.prompt}
          columns={PROMPT_COLUMNS}
        />
      </ScreenTableCard>
    </ScreenRoot>
  );
}

/** One of your cited pages: its citation figures, which engines fetched it, and where it was quoted. */
export function ScreenCitedUrl() {
  return (
    <ScreenRoot name="cited-url" width={960}>
      <div className="cl-screen-head">
        <div className="cl-screen-head-copy">
          <ScreenMeta>Cited sources / acme.com / /pricing</ScreenMeta>
          <span className="cl-screen-title">Pricing</span>
          <ScreenNote>
            acme.com/pricing · first cited 14 Sep 2026 · {CHECKED.toLowerCase()}
          </ScreenNote>
        </div>
        <div className="cl-screen-bar-side">
          <Badge tone="accent">Your page</Badge>
          <ScreenButton icon={ExternalLink}>Open page</ScreenButton>
        </div>
      </div>
      <div className="cl-screen-statrow">
        <Card>
          <ScreenStat label="Citations" value="74" change={{ value: 9, precision: 0 }} />
        </Card>
        <Card>
          <ScreenStat
            label="Citation rate"
            value="14.8"
            unit="%"
            change={{ value: 1.9, unit: ' pts' }}
          />
        </Card>
        <Card>
          <ScreenStat
            label="Prompts using it"
            value="23"
            unit=" / 120"
            change={{ value: 3, precision: 0 }}
          />
        </Card>
      </div>
      <ScreenCols layout="halves">
        <ScreenTableCard
          title="Retrievals by AI model"
          meta="Retrieved 128 times, cited 74 times this week"
        >
          <ScreenTable
            caption="Retrievals and citations of acme.com/pricing by engine"
            rows={PAGE_RETRIEVALS}
            rowKey={(row) => row.engine}
            columns={RETRIEVAL_COLUMNS}
          />
        </ScreenTableCard>
        <ScreenCard title="Quoted in answers">
          <ScreenStack>
            <div className="cl-screen-quote">
              <ScreenNote>ChatGPT · Mixpanel alternatives with a free tier</ScreenNote>
              <Passage highlight="a free tier up to 10,000 events a month">
                Acme Analytics has a free tier up to 10,000 events a month, and its Startup plan
                adds session replay for $49 a month.
              </Passage>
            </div>
            <div className="cl-screen-quote">
              <ScreenNote>Claude · Best product analytics for startups</ScreenNote>
              <Passage highlight="the cheapest of the three for teams under 10,000 monthly events">
                On price, Acme Analytics is the cheapest of the three for teams under 10,000 monthly
                events.
              </Passage>
            </div>
          </ScreenStack>
        </ScreenCard>
      </ScreenCols>
    </ScreenRoot>
  );
}
