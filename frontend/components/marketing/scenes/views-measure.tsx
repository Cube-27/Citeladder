import { Check, LayoutGrid, Link2 } from 'lucide-react';

import { EngineLogo } from '../primitives/engine-logo';
import { Favicon, Pill, PanelHead } from './product-view-parts';

/** Measurement views: visibility, answers, sources, referrals and commerce. Synthetic records only. */

const TREND = [
  { name: 'Zernovelle', series: 1, points: [52, 54, 55, 59, 58, 62, 64.4] },
  { name: 'Brelovanta', series: 2, points: [61, 61, 60, 60, 59, 59, 58.2] },
  { name: 'Flevorynth', series: 3, points: [36, 38, 39, 40, 42, 41, 41.8] },
] as const;

const chartY = (value: number) => 12 + (70 - value) * 3.4;

const chartPoints = (points: readonly number[]) =>
  points.map((value, index) => `${index * (520 / 6)},${chartY(value)}`).join(' ');

export function VisibilityView() {
  return (
    <div className="pv-view">
      <div className="pv-kpis">
        <div className="pv-kpi">
          <span className="pv-meta">Brand visibility</span>
          <strong>64.4%</strong>
          <span className="pv-delta" data-direction="up">
            +12.4 pp in 30 days
          </span>
        </div>
        <div className="pv-kpi">
          <span className="pv-meta">Average position</span>
          <strong>2.4</strong>
          <span className="pv-meta">where answers rank brands</span>
        </div>
        <div className="pv-kpi">
          <span className="pv-meta">Owned citations</span>
          <strong>38</strong>
          <span className="pv-meta">of 130 sources cited</span>
        </div>
      </div>
      <div className="pv-panel">
        <PanelHead title="Visibility over time" meta="Last 30 days · 42 prompts" />
        <div className="pv-legend">
          {TREND.map((row) => (
            <span key={row.name} data-series={row.series}>
              {row.name}
            </span>
          ))}
        </div>
        <svg className="pv-chart" viewBox="0 0 520 150" preserveAspectRatio="none" aria-hidden>
          {[0, 1, 2, 3].map((line) => (
            <line key={line} x1="0" x2="520" y1={14 + line * 40} y2={14 + line * 40} />
          ))}
          {TREND.map((row) => (
            <g key={row.name} data-series={row.series}>
              <polyline points={chartPoints(row.points)} />
              <circle cx="520" cy={chartY(row.points[6])} r="3.5" />
            </g>
          ))}
        </svg>
        <p className="sr-only">
          Example trend: Zernovelle rises from 52% to 64.4% visibility while Brelovanta slips to
          58.2% and Flevorynth reaches 41.8%.
        </p>
      </div>
      <div className="pv-panel">
        <PanelHead title="Competitors" meta="Share of tracked answers" />
        <table className="pv-table">
          <thead>
            <tr>
              <th scope="col">Brand</th>
              <th scope="col">Visibility</th>
              <th scope="col">Position</th>
            </tr>
          </thead>
          <tbody>
            {TREND.map((row, index) => (
              <tr key={row.name} data-own={index === 0 || undefined}>
                <td>
                  <span className="pv-series-name" data-series={row.series}>
                    {row.name}
                  </span>
                </td>
                <td>
                  <span className="pv-bar-cell">
                    <i style={{ width: `${row.points[6]}%` }} data-series={row.series} />
                    {row.points[6].toFixed(1)}%
                  </span>
                </td>
                <td>{[2.4, 3.1, 4.2][index].toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
