import { Info, Quote } from 'lucide-react';

import { EngineLogo, type OfficialEngineKey } from '../primitives/engine-logo';
import { Favicon, PanelHead, Pill } from './product-view-parts';

/** Answer-level signals beside visibility: perception, ads and engines. Synthetic records only. */

function Stats({ items }: Readonly<{ items: readonly (readonly [string, string, string?])[] }>) {
  return (
    <div className="pv-stats">
      {items.map(([label, value, note]) => (
        <div key={label} className="pv-stat">
          <span className="pv-stat-label">
            {label}
            <Info className="size-3" aria-hidden />
          </span>
          <span className="pv-stat-value">
            <strong>{value}</strong>
            {note && <span className="pv-meta">{note}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

const THEMES = [
  ['Ease of use', 14, 2],
  ['Features', 11, 3],
  ['Integrations', 8, 1],
  ['Pricing', 3, 7],
  ['Support', 5, 1],
] as const;

export function PerceptionView() {
  return (
    <div className="pv-view">
      <Stats
        items={[
          ['Net sentiment', '+38', '41 of 48 classified'],
          ['Positive', '61%'],
          ['Recommended', '44%'],
        ]}
      />
      <div className="pv-split pv-split-wide">
        <div className="pv-panel pv-panel-flush">
          <div className="pv-card-head">
            <span className="pv-panel-title pv-card-title">Themes</span>
            <span className="pv-meta">What answers praise and criticize.</span>
          </div>
          <table className="pv-table">
            <thead>
              <tr>
                <th scope="col">Theme</th>
                <th scope="col">Positive</th>
                <th scope="col">Negative</th>
              </tr>
            </thead>
            <tbody>
              {THEMES.map(([theme, positive, negative]) => (
                <tr key={theme}>
                  <td>{theme}</td>
                  <td>
                    <span className="pv-bar-cell">
                      <i data-tone="accent" style={{ width: `${(positive / 14) * 100}%` }} />
                      {positive}
                    </span>
                  </td>
                  <td>
                    <span className="pv-bar-cell">
                      <i data-tone="danger" style={{ width: `${(negative / 14) * 100}%` }} />
                      {negative}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pv-panel">
          <PanelHead title="Top quote · Pricing" meta="Negative" />
          <div className="pv-answer">
            <p>
              <Quote className="inline size-3" aria-hidden /> Zernovelle is easy to roll out, but
              its per-seat pricing gets expensive for larger teams.
            </p>
          </div>
          <p className="pv-meta">ChatGPT Search · Comparison prompt · Sep 30</p>
          <div className="pv-chip-row">
            <Pill tone="review">Cited beside: reviewdesk.example</Pill>
          </div>
        </div>
      </div>
    </div>
  );
}

const ADVERTISERS = [
  ['B', 'Brelovanta', 'competitor', 23, 9, 52],
  ['F', 'Flevorynth', 'competitor', 13, 6, 30],
  ['T', 'Tessmark', 'neutral', 8, 4, 18],
] as const;

export function AdsView() {
  return (
    <div className="pv-view">
      <div className="pv-answer-meta">
        <span className="pv-engine">
          <EngineLogo engine="openai" className="size-3.5" />
          ChatGPT Search
        </span>
        <span className="pv-meta">Ads are recorded apart from citations and scores.</span>
      </div>
      <Stats
        items={[
          ['Ad presence', '18%', '44 of 240 answers'],
          ['Your ad share', 'Not advertising'],
          ['Advertisers seen', '3'],
        ]}
      />
      <div className="pv-panel pv-panel-flush">
        <div className="pv-card-head">
          <span className="pv-panel-title pv-card-title">Advertisers</span>
          <span className="pv-meta">Sponsored placements beside your tracked prompts.</span>
        </div>
        <table className="pv-table">
          <thead>
            <tr>
              <th scope="col">Advertiser</th>
              <th scope="col">Appearances</th>
              <th scope="col">Prompts</th>
              <th scope="col">Share</th>
            </tr>
          </thead>
          <tbody>
            {ADVERTISERS.map(([letter, name, tone, appearances, prompts, share]) => (
              <tr key={name}>
                <td>
                  <span className="pv-domain">
                    <Favicon letter={letter} tone={tone} />
                    {name}
                  </span>
                </td>
                <td>{appearances}</td>
                <td>{prompts}</td>
                <td>
                  <span className="pv-bar-cell">
                    <i data-tone={tone} style={{ width: `${share}%` }} />
                    {share}%
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

const ENGINES: readonly (readonly [OfficialEngineKey, string, string, number, number])[] = [
  ['openai', 'ChatGPT Search', 'Consumer answer', 64, 1.4],
  ['gemini', 'Gemini', 'Consumer answer', 52, 1.9],
  ['google', 'Google AI Overview', 'Search results', 41, 2.2],
  ['claude', 'Claude API', 'Model answer', 47, 2.6],
  ['openai', 'ChatGPT API', 'Model answer', 58, 1.7],
];

export function EnginesView() {
  return (
    <div className="pv-view">
      <div className="pv-toolbar">
        <span className="pv-segment">
          <span data-active>All engines</span>
          <span>Branded</span>
          <span>Unbranded</span>
        </span>
        <span className="pv-meta">42 prompts · 3 repetitions · daily</span>
      </div>
      <div className="pv-panel pv-panel-flush">
        <table className="pv-table">
          <thead>
            <tr>
              <th scope="col">Engine</th>
              <th scope="col">Surface</th>
              <th scope="col">Visibility</th>
              <th scope="col">Avg. position</th>
            </tr>
          </thead>
          <tbody>
            {ENGINES.map(([logo, name, surface, visibility, position]) => (
              <tr key={name}>
                <td>
                  <span className="pv-domain">
                    <EngineLogo engine={logo} className="size-3.5" />
                    {name}
                  </span>
                </td>
                <td>{surface}</td>
                <td>
                  <span className="pv-bar-cell">
                    <i data-tone="accent" style={{ width: `${visibility}%` }} />
                    {visibility}%
                  </span>
                </td>
                <td>#{position.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
