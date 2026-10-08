import { Check, ChevronLeft, ChevronRight, Info, LayoutGrid, Link2 } from 'lucide-react';

import { EngineLogo } from '../primitives/engine-logo';
import { Favicon, Pill, PanelHead } from './product-view-parts';

/** Measurement views: visibility, answers, sources, referrals and commerce. Synthetic records only. */

/* Visibility per audit run; the last point is the latest run. Rows are in
   the table's order (highest visibility first), with the own brand marked. */
const BRANDS = [
  {
    name: 'Zernovelle',
    own: true,
    series: 1,
    points: [38, 41, 47, 52, 55, 61, 64],
    position: 1,
    share: 31,
    citations: 29,
  },
  {
    name: 'Brelovanta',
    series: 2,
    points: [62, 61, 60, 60, 59, 59, 58],
    position: 2,
    share: 28,
    citations: 22,
  },
  {
    name: 'Flevorynth',
    series: 3,
    points: [33, 36, 38, 39, 42, 41, 42],
    position: 3,
    share: 20,
    citations: 14,
  },
  {
    name: 'Quorivale',
    series: 4,
    points: [30, 29, 27, 28, 26, 27, 27],
    position: 4,
    share: 13,
    citations: 9,
  },
  {
    name: 'Tessmark',
    series: 5,
    points: [14, 15, 17, 16, 18, 17, 18],
    position: 5,
    share: 8,
    citations: 6,
  },
] as const;

const RUN_DATES = ['Jul 8', 'Jul 22', 'Aug 5', 'Aug 19', 'Sep 2', 'Sep 16', 'Sep 30'] as const;

const CHART_W = 520;
const CHART_H = 160;
const chartX = (index: number) => (index * CHART_W) / (RUN_DATES.length - 1);
const chartY = (value: number) => CHART_H - (value / 100) * CHART_H;

const KPIS = [
  ['Visibility', '64%', '+26 pp'],
  ['Share of voice', '31%', '+9 pp'],
  ['Owned citation rate', '29%', '+11 pp'],
] as const;

export function VisibilityView() {
  return (
    <div className="pv-view">
      <div className="pv-stats">
        {KPIS.map(([label, value, delta]) => (
          <div key={label} className="pv-stat">
            <span className="pv-stat-label">
              {label}
              <Info className="size-3" aria-hidden />
            </span>
            <span className="pv-stat-value">
              <strong>{value}</strong>
              <span className="pv-delta" data-direction="up">
                {delta}
              </span>
            </span>
          </div>
        ))}
      </div>
      <p className="pv-meta">
        Based on 168 of 168 expected answers across 4 engines. Change compares with the run on Jul
        8.
      </p>
      <div className="pv-split pv-split-chart">
        <div className="pv-panel">
          <div className="pv-panel-head pv-panel-head-center">
            <span className="pv-panel-title pv-card-title">Over time</span>
            <span className="pv-button pv-button-quiet">Visibility</span>
          </div>
          <div className="pv-plot">
            <span className="pv-plot-y" aria-hidden>
              <span>100%</span>
              <span>50%</span>
              <span>0%</span>
            </span>
            <svg
              className="pv-chart"
              viewBox={`0 0 ${CHART_W} ${CHART_H}`}
              preserveAspectRatio="none"
              aria-hidden
            >
              {[0, 50, 100].map((tick) => (
                <line key={tick} x1="0" x2={CHART_W} y1={chartY(tick)} y2={chartY(tick)} />
              ))}
              {BRANDS.map((brand) => (
                <g
                  key={brand.name}
                  data-series={brand.series}
                  data-own={'own' in brand || undefined}
                >
                  <polyline
                    points={brand.points
                      .map((value, i) => `${chartX(i)},${chartY(value)}`)
                      .join(' ')}
                  />
                  <line
                    className="pv-chart-end"
                    x1={CHART_W}
                    x2={CHART_W}
                    y1={chartY(brand.points.at(-1)!)}
                    y2={chartY(brand.points.at(-1)!)}
                  />
                </g>
              ))}
            </svg>
            <span className="pv-plot-x" aria-hidden>
              {RUN_DATES.map((date) => (
                <span key={date}>{date}</span>
              ))}
            </span>
          </div>
          <div className="pv-legend">
            {BRANDS.map((brand) => (
              <span key={brand.name} data-series={brand.series}>
                {'own' in brand ? 'You' : brand.name}
              </span>
            ))}
          </div>
          <p className="sr-only">
            Example trend: Zernovelle rises from 38% to 64% visibility across seven runs while
            Brelovanta slips to 58%.
          </p>
        </div>
        <div className="pv-panel pv-panel-flush">
          <div className="pv-card-head">
            <span className="pv-panel-title pv-card-title">Brand and competitors</span>
            <span className="pv-meta">How often each brand is named, across the same answers.</span>
          </div>
          <table className="pv-table pv-table-brands">
            <thead>
              <tr>
                <th scope="col">Brand</th>
                <th scope="col">Visibility</th>
                <th scope="col">Position</th>
                <th scope="col">Share of voice</th>
                <th scope="col">Citations</th>
              </tr>
            </thead>
            <tbody>
              {BRANDS.map((brand) => (
                <tr key={brand.name} data-own={'own' in brand || undefined}>
                  <td>
                    <span className="pv-domain">
                      <Favicon letter={brand.name[0]} tone={'own' in brand ? 'owned' : 'neutral'} />
                      {brand.name}
                      {'own' in brand && <span className="pv-you">You</span>}
                    </span>
                  </td>
                  <td>{brand.points.at(-1)}%</td>
                  <td>#{brand.position}</td>
                  <td>{brand.share}%</td>
                  <td>{brand.citations}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="pv-pager">
            <span className="pv-meta">1–5 of 5 brands</span>
            <span className="pv-pager-buttons" aria-hidden>
              <span className="pv-button pv-button-quiet">
                <ChevronLeft className="size-3" />
                Prev
              </span>
              <span className="pv-button pv-button-quiet">
                Next
                <ChevronRight className="size-3" />
              </span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AnswerView() {
  return (
    <div className="pv-view">
      <div className="pv-answer-meta">
        <span className="pv-engine">
          <EngineLogo engine="openai" className="size-3.5" />
          ChatGPT
        </span>
        <span className="pv-meta">Tracked prompt · Comparison stage · Sep 19</span>
      </div>
      <p className="pv-prompt">Which workflow platforms support multi-team operations?</p>
      <div className="pv-answer">
        <p>
          Platforms in this category include <mark>Zernovelle</mark>, Brelovanta and Flevorynth.
          Zernovelle’s documentation describes shared workflows and configurable approval stages
          <sup>1</sup>. An independent comparison lists cross-team coordination as a deciding
          criterion<sup>2</sup>.
        </p>
      </div>
      <div className="pv-chip-row">
        <Pill tone="accent">
          <Check className="size-3" aria-hidden /> Brand mentioned · position 1
        </Pill>
        <Pill tone="accent">
          <Link2 className="size-3" aria-hidden /> Owned source cited
        </Pill>
      </div>
      <div className="pv-panel">
        <PanelHead title="Cited sources" meta="2 references" />
        <ul className="pv-list">
          <li>
            <Favicon letter="Z" tone="owned" />
            <span className="pv-list-main">
              <span>Platform documentation</span>
              <span className="pv-meta">zernovelle.example/platform</span>
            </span>
            <Pill tone="owned">Owned</Pill>
          </li>
          <li>
            <Favicon letter="F" tone="editorial" />
            <span className="pv-list-main">
              <span>Workflow platform comparison</span>
              <span className="pv-meta">fieldnotes.example/automation-guide</span>
            </span>
            <Pill tone="editorial">Editorial</Pill>
          </li>
        </ul>
      </div>
    </div>
  );
}

const SOURCES = [
  ['Z', 'zernovelle.example', 'Owned', 'owned', 38],
  ['R', 'reviewdesk.example', 'Review', 'review', 31],
  ['F', 'fieldnotes.example', 'Editorial', 'editorial', 26],
  ['D', 'discuss.example', 'Community', 'community', 19],
  ['B', 'brelovanta.example', 'Competitor', 'competitor', 16],
] as const;

export function SourcesView() {
  return (
    <div className="pv-view">
      <div className="pv-toolbar">
        <span className="pv-segment">
          <span data-active>Domains</span>
          <span>URLs</span>
        </span>
        <span className="pv-meta">130 citations across 42 prompts</span>
      </div>
      <div className="pv-panel">
        <div className="pv-stack-bar" aria-hidden>
          {SOURCES.map(([, , , tone, count]) => (
            <i key={tone} data-tone={tone} style={{ flexGrow: count }} />
          ))}
        </div>
        <table className="pv-table">
          <thead>
            <tr>
              <th scope="col">Domain</th>
              <th scope="col">Type</th>
              <th scope="col">Citations</th>
            </tr>
          </thead>
          <tbody>
            {SOURCES.map(([letter, domain, type, tone, count]) => (
              <tr key={domain}>
                <td>
                  <span className="pv-domain">
                    <Favicon letter={letter} tone={tone} />
                    {domain}
                  </span>
                </td>
                <td>
                  <Pill tone={tone}>{type}</Pill>
                </td>
                <td>
                  <span className="pv-bar-cell">
                    <i data-tone={tone} style={{ width: `${(count / 38) * 100}%` }} />
                    {count}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ReferralView() {
  const sources = [
    ['ChatGPT', 'openai', 412, 61],
    ['Gemini', 'gemini', 138, 48],
    ['Claude', 'claude', 74, 57],
  ] as const;
  const pages = [
    ['/platform', 214, 9],
    ['/guides/approval-workflows', 162, 6],
    ['/pricing', 88, 11],
  ] as const;
  return (
    <div className="pv-view">
      <div className="pv-panel">
        <PanelHead title="AI referral sessions" meta="GA4 · Last 28 days" />
        <ul className="pv-list">
          {sources.map(([name, engine, sessions, engaged]) => (
            <li key={name}>
              <span className="pv-engine-mark">
                <EngineLogo engine={engine} className="size-3.5" />
              </span>
              <span className="pv-list-main">
                <span>{name}</span>
                <span className="pv-meta">{engaged}% engaged</span>
              </span>
              <span className="pv-bar-cell pv-bar-wide">
                <i data-series="1" style={{ width: `${(sessions / 412) * 100}%` }} />
                {sessions}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="pv-panel">
        <PanelHead title="Landing pages" meta="Identifiable AI sources only" />
        <table className="pv-table">
          <thead>
            <tr>
              <th scope="col">Page</th>
              <th scope="col">Sessions</th>
              <th scope="col">Key events</th>
            </tr>
          </thead>
          <tbody>
            {pages.map(([page, sessions, events]) => (
              <tr key={page}>
                <td className="pv-mono">{page}</td>
                <td>{sessions}</td>
                <td>{events}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function CommerceView() {
  const shelf = [
    ['Trail Pack 28L', 'Zernovelle', '1', 'own'],
    ['Summit Daypack', 'Brelovanta', '2', ''],
    ['Ridge 25', 'Flevorynth', '3', ''],
  ] as const;
  return (
    <div className="pv-view">
      <div className="pv-answer-meta">
        <span className="pv-engine">
          <LayoutGrid className="size-3.5" aria-hidden /> AI Shelf
        </span>
        <span className="pv-meta">Category · Daypacks · 24 buyer prompts</span>
      </div>
      <div className="pv-kpis">
        <div className="pv-kpi">
          <span className="pv-meta">Product visibility</span>
          <strong>46%</strong>
          <span className="pv-meta">of measured answers</span>
        </div>
        <div className="pv-kpi">
          <span className="pv-meta">Share of shelf</span>
          <strong>22%</strong>
          <span className="pv-meta">ordered answers only</span>
        </div>
      </div>
      <div className="pv-panel">
        <PanelHead title="Which daypacks suit a short hike?" meta="Explicitly ordered answer" />
        <ul className="pv-list">
          {shelf.map(([product, brand, position, own]) => (
            <li key={product} data-own={own || undefined}>
              <span className="pv-rank">{position}</span>
              <span className="pv-list-main">
                <span>{product}</span>
                <span className="pv-meta">{brand}</span>
              </span>
              {own && <Pill tone="accent">Your product</Pill>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function PromptsView() {
  const topics = [
    ['Workflow automation', 'Comparison', 14, 3],
    ['Approval processes', 'Use case', 11, 0],
    ['Team collaboration', 'Need', 9, 2],
    ['Zernovelle pricing', 'Branded', 8, 0],
  ] as const;
  return (
    <div className="pv-view">
      <div className="pv-toolbar">
        <span className="pv-segment">
          <span data-active>Topics</span>
          <span>Prompts</span>
        </span>
        <span className="pv-meta">42 active · 5 suggestions to review</span>
      </div>
      <div className="pv-panel">
        <table className="pv-table">
          <thead>
            <tr>
              <th scope="col">Topic</th>
              <th scope="col">Stage</th>
              <th scope="col">Prompts</th>
              <th scope="col">Review</th>
            </tr>
          </thead>
          <tbody>
            {topics.map(([topic, stage, prompts, review]) => (
              <tr key={topic}>
                <td>{topic}</td>
                <td>
                  <Pill tone={stage === 'Branded' ? 'neutral' : 'info'}>{stage}</Pill>
                </td>
                <td>{prompts}</td>
                <td>
                  {review ? (
                    <Pill tone="warning">{review} new</Pill>
                  ) : (
                    <span className="pv-meta">None</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function CitedUrlView() {
  const prompts = [
    ['Which workflow platforms support multi-team operations?', 'ChatGPT'],
    ['Best tools for approval workflows', 'Gemini'],
    ['Zernovelle vs Brelovanta for enterprise teams', 'Claude'],
  ] as const;
  return (
    <div className="pv-view">
      <div className="pv-panel">
        <div className="pv-answer-meta">
          <span className="pv-domain">
            <Favicon letter="R" tone="review" />
            <span className="pv-list-main">
              <span>reviewdesk.example/best-workflow-tools</span>
              <span className="pv-meta">Review source · cited 31 times</span>
            </span>
          </span>
          <Pill tone="review">Third party</Pill>
        </div>
      </div>
      <div className="pv-panel">
        <PanelHead title="Prompts that cite this page" meta="15 prompts" />
        <ul className="pv-list">
          {prompts.map(([prompt, engine]) => (
            <li key={prompt}>
              <span className="pv-list-main">
                <span>{prompt}</span>
              </span>
              <span className="pv-meta">{engine}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function ShelfSetupView() {
  return (
    <div className="pv-view">
      <div className="pv-split">
        <div className="pv-panel">
          <PanelHead title="Buyer prompts" meta="8 approved" />
          <ul className="pv-list">
            <li>
              <Check className="text-accent-text size-3.5 shrink-0" aria-hidden />
              <span className="pv-list-main">
                <span>Which daypacks suit a short hike?</span>
              </span>
            </li>
            <li>
              <Check className="text-accent-text size-3.5 shrink-0" aria-hidden />
              <span className="pv-list-main">
                <span>Best lightweight daypack under $100</span>
              </span>
            </li>
            <li>
              <span className="pv-dot" data-tone="neutral" aria-hidden />
              <span className="pv-list-main">
                <span>Daypack with hydration sleeve</span>
              </span>
              <Pill tone="warning">Review</Pill>
            </li>
          </ul>
        </div>
        <div className="pv-panel pv-review">
          <PanelHead title="Run" />
          <dl className="pv-dl">
            <div>
              <dt>Target</dt>
              <dd>Trail Pack 28L</dd>
            </div>
            <div>
              <dt>Competitors</dt>
              <dd>4 approved</dd>
            </div>
            <div>
              <dt>Repetitions</dt>
              <dd>3 per engine</dd>
            </div>
            <div>
              <dt>Estimated cost</dt>
              <dd>Shown before launch</dd>
            </div>
          </dl>
          <span className="pv-button">Launch audit</span>
        </div>
      </div>
    </div>
  );
}
