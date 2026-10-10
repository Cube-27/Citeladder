import { CircleAlert, Quote } from 'lucide-react';

import { BarCell, Favicon, PanelHead, Pill, StatTiles } from './product-view-parts';

/** Evidence views: AI crawler logs, earned sources and Site Health pillars. Synthetic records only. */

const CRAWLERS = [
  ['OAI-SearchBot', 'AI search', 3912, 'Verified', 'accent'],
  ['ChatGPT-User', 'User fetch', 2240, 'Verified', 'accent'],
  ['ClaudeBot', 'Training', 1874, 'Verified', 'accent'],
  ['PerplexityBot', 'AI search', 1206, 'Unverifiable', 'warning'],
  ['GPTBot', 'Training', 988, 'Verified', 'accent'],
] as const;
const CRAWLER_MAX = Math.max(...CRAWLERS.map(([, , requests]) => requests));

export function CrawlerView() {
  return (
    <div className="pv-view">
      <div className="pv-toolbar">
        <span className="pv-segment">
          <span>Overview</span>
          <span data-active>Crawlers</span>
          <span>Referrals</span>
          <span>Pages</span>
        </span>
        <span className="pv-meta">Cloudflare Logpush · complete for 28 days</span>
      </div>
      <div className="pv-panel pv-panel-flush">
        <table className="pv-table">
          <thead>
            <tr>
              <th scope="col">Crawler</th>
              <th scope="col">Purpose</th>
              <th scope="col">Requests</th>
              <th scope="col">Verification</th>
            </tr>
          </thead>
          <tbody>
            {CRAWLERS.map(([name, purpose, requests, status, tone]) => (
              <tr key={name}>
                <td>{name}</td>
                <td>{purpose}</td>
                <td>
                  <BarCell value={requests} max={CRAWLER_MAX} tone="info">
                    {requests.toLocaleString('en-US')}
                  </BarCell>
                </td>
                <td>
                  <Pill tone={tone}>{status}</Pill>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="pv-panel">
        <PanelHead title="Pattern" meta="Co-occurrence, not cause" />
        <p className="pv-meta">
          <CircleAlert className="inline size-3" aria-hidden /> /guides/approvals had 412 verified
          AI search crawls and no identifiable AI referrals in the same window.
        </p>
      </div>
    </div>
  );
}

export function EarnedSourceView() {
  return (
    <div className="pv-view">
      <div className="pv-answer-meta">
        <span className="pv-domain">
          <Favicon letter="F" tone="editorial" />
          fieldnotes.example/best-workflow-platforms
        </span>
        <Pill tone="editorial">Listicle</Pill>
      </div>
      <p className="pv-meta">Cited in 7 tracked answers across 3 engines · read Sep 28</p>
      <div className="pv-split">
        <div className="pv-panel">
          <PanelHead title="Brands on this page" />
          <ul className="pv-list">
            <li>
              <Favicon letter="B" tone="competitor" />
              <span className="pv-list-main">Brelovanta</span>
              <Pill tone="competitor">Listed</Pill>
            </li>
            <li>
              <Favicon letter="Q" tone="competitor" />
              <span className="pv-list-main">Quorivale</span>
              <Pill tone="competitor">Listed</Pill>
            </li>
            <li data-own>
              <Favicon letter="Z" tone="owned" />
              <span className="pv-list-main">Zernovelle</span>
              <Pill tone="danger">Absent</Pill>
            </li>
          </ul>
        </div>
        <div className="pv-panel">
          <PanelHead title="Quoted passage" />
          <div className="pv-answer">
            <p>
              <Quote className="inline size-3" aria-hidden /> For multi-team approvals, Brelovanta
              and Quorivale are the two platforms we return to most often.
            </p>
          </div>
        </div>
      </div>
      <div className="pv-panel">
        <PanelHead title="Action" meta="High" />
        <p className="pv-meta">
          Competitors listed on a cited page you are absent from. Draft an outreach brief with the
          Agent; nothing is sent for you.
        </p>
      </div>
    </div>
  );
}

const PILLARS = [
  ['Crawlability', 92],
  ['Machine readability', 71],
  ['Structure', 84],
  ['Answerability', 63],
  ['Evidence', 58],
  ['Provenance', 77],
  ['Freshness', 69],
] as const;

export function PillarsView() {
  return (
    <div className="pv-view">
      <StatTiles
        items={[
          ['AEO Readiness', '72'],
          ['Web Fundamentals', '81'],
          ['Pages analyzed', '148', 'of 150'],
        ]}
      />
      <div className="pv-panel pv-panel-flush">
        <div className="pv-card-head">
          <span className="pv-panel-title pv-card-title">Answer-readiness pillars</span>
          <span className="pv-meta">Only checks that apply to each page kind are scored.</span>
        </div>
        <table className="pv-table">
          <tbody>
            {PILLARS.map(([pillar, score]) => (
              <tr key={pillar}>
                <td>{pillar}</td>
                <td>
                  <BarCell value={score} max={100} tone={score < 65 ? 'warning' : 'accent'} wide>
                    {score}
                  </BarCell>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
