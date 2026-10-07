import { BarChart3, Bot, Check, FileText, Search, TrendingUp } from 'lucide-react';
import { Favicon, Pill, PanelHead } from './product-view-parts';

/** Diagnosis views: Site Health, search demand, research and connections. Synthetic records only. */

export function SiteHealthView() {
  const findings = [
    ['Indexing blocked by noindex', '2 pages', 'danger'],
    ['Invalid structured data syntax', '4 pages', 'warning'],
    ['Missing canonical reference', '6 pages', 'warning'],
    ['Missing H1 heading', '9 pages', 'info'],
  ] as const;
  const crawlers = [
    ['OAI-SearchBot', 'AI search', 'Allowed'],
    ['GPTBot', 'Training', 'Blocked'],
    ['ChatGPT-User', 'User fetch', 'Allowed'],
    ['Google-Extended', 'Training', 'Allowed'],
  ] as const;
  return (
    <div className="pv-view">
      <div className="pv-kpis">
        <div className="pv-kpi">
          <span className="pv-meta">AEO readiness</span>
          <strong>78</strong>
          <span className="pv-meta">84 of 86 pages checked</span>
        </div>
        <div className="pv-kpi">
          <span className="pv-meta">Findings</span>
          <strong>21</strong>
          <span className="pv-meta">across 4 issue groups</span>
        </div>
        <div className="pv-kpi">
          <span className="pv-meta">Needs review</span>
          <strong>3</strong>
          <span className="pv-meta">unresolved checks kept visible</span>
        </div>
      </div>
      <div className="pv-split">
        <div className="pv-panel">
          <PanelHead title="Issue groups" meta="Latest crawl" />
          <ul className="pv-list">
            {findings.map(([title, pages, tone]) => (
              <li key={title}>
                <span className="pv-dot" data-tone={tone} aria-hidden />
                <span className="pv-list-main">
                  <span>{title}</span>
                </span>
                <span className="pv-meta">{pages}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="pv-panel">
          <PanelHead title="AI crawler access" meta="robots.txt" />
          <ul className="pv-list">
            {crawlers.map(([bot, purpose, state]) => (
              <li key={bot}>
                <span className="pv-list-main">
                  <span>{bot}</span>
                  <span className="pv-meta">{purpose}</span>
                </span>
                <Pill tone={state === 'Allowed' ? 'accent' : 'danger'}>{state}</Pill>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export function DemandView() {
  const rows = [
    ['workflow automation software', '/platform', 'Striking distance', 'pos 8.4'],
    ['approval workflow tools', '/guides/approvals', 'CTR gap', '1.1% vs 3.4%'],
    ['cross-team workflow platform', '/platform', 'Rising', '+42% impressions'],
    ['zernovelle pricing', '/pricing', 'Branded', '2.1k clicks'],
  ] as const;
  return (
    <div className="pv-view">
      <div className="pv-toolbar">
        <span className="pv-segment">
          <span>By page</span>
          <span data-active>By query</span>
        </span>
        <span className="pv-meta">Search Console · 28 days vs previous</span>
      </div>
      <div className="pv-panel">
        <table className="pv-table">
          <thead>
            <tr>
              <th scope="col">Query</th>
              <th scope="col">Signal</th>
              <th scope="col">Evidence</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([query, page, signal, evidence]) => (
              <tr key={query}>
                <td className="pv-cell-stack">
                  {query}
                  <span className="pv-meta pv-mono">{page}</span>
                </td>
                <td>
                  <Pill tone={signal === 'Branded' ? 'neutral' : 'accent'}>{signal}</Pill>
                </td>
                <td className="pv-meta">{evidence}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function SearchView() {
  const rows = [
    ['ai workflow platform', '2.9k', '14', '6'],
    ['approval automation', '1.6k', '9', '—'],
    ['team workflow software', '1.2k', '22', '4'],
  ] as const;
  return (
    <div className="pv-view">
      <div className="pv-split pv-split-wide">
        <div className="pv-panel">
          <PanelHead title="Ranked keywords" meta="zernovelle.example · US" />
          <table className="pv-table">
            <thead>
              <tr>
                <th scope="col">Keyword</th>
                <th scope="col">Volume</th>
                <th scope="col">You</th>
                <th scope="col">Rival</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([keyword, volume, you, rival]) => (
                <tr key={keyword}>
                  <td>{keyword}</td>
                  <td>{volume}</td>
                  <td>{you}</td>
                  <td>{rival}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pv-panel">
          <PanelHead title="Competitors" meta="Shared keywords" />
          <ul className="pv-list">
            {[
              ['B', 'brelovanta.example', 412],
              ['F', 'flevorynth.example', 268],
              ['R', 'reviewdesk.example', 155],
            ].map(([letter, domain, shared]) => (
              <li key={domain}>
                <Favicon letter={String(letter)} tone="competitor" />
                <span className="pv-list-main">
                  <span>{domain}</span>
                </span>
                <span className="pv-meta">{shared}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export function IntegrationsView() {
  const connections = [
    ['Google Search Console', 'sc-domain:zernovelle.example', 'Connected', Search],
    ['Google Analytics 4', 'Zernovelle — Web', 'Connected', BarChart3],
    ['Bing Webmaster Tools', 'zernovelle.example', 'Connected', TrendingUp],
    ['DataForSEO', 'Explicit review per collection', 'Optional', FileText],
    ['MCP clients', '2 authorized assistants', 'Read-only', Bot],
  ] as const;
  return (
    <div className="pv-view">
      <div className="pv-panel">
        <PanelHead title="Connections" meta="Project: Zernovelle" />
        <ul className="pv-list">
          {connections.map(([name, detail, state, Icon]) => (
            <li key={name}>
              <span className="pv-engine-mark">
                <Icon className="size-3.5" aria-hidden />
              </span>
              <span className="pv-list-main">
                <span>{name}</span>
                <span className="pv-meta">{detail}</span>
              </span>
              <Pill tone={state === 'Connected' ? 'accent' : 'neutral'}>{state}</Pill>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function PageEvidenceView() {
  const checks = [
    ['Indexable', 'Failed', 'danger'],
    ['Canonical reference', 'Passed', 'accent'],
    ['Structured data', 'Needs review', 'warning'],
    ['Heading structure', 'Passed', 'accent'],
  ] as const;
  return (
    <div className="pv-view">
      <div className="pv-panel">
        <div className="pv-answer-meta">
          <span className="pv-list-main">
            <span className="pv-panel-title">zernovelle.example/platform</span>
            <span className="pv-meta">Product page · crawled Sep 19</span>
          </span>
          <Pill tone="danger">1 failing check</Pill>
        </div>
      </div>
      <div className="pv-panel">
        <PanelHead title="Captured evidence" />
        <div className="pv-answer">
          <code>{'<meta name="robots" content="noindex, follow">'}</code>
        </div>
      </div>
      <div className="pv-panel">
        <PanelHead title="Checks on this page" meta="Applies to product pages" />
        <ul className="pv-list">
          {checks.map(([check, result, tone]) => (
            <li key={check}>
              <span className="pv-dot" data-tone={tone} aria-hidden />
              <span className="pv-list-main">
                <span>{check}</span>
              </span>
              <Pill tone={tone}>{result}</Pill>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function QueryPageView() {
  const queries = [
    ['workflow automation software', true],
    ['automated approval workflows', false],
    ['workflow software for teams', true],
  ] as const;
  return (
    <div className="pv-view">
      <div className="pv-panel">
        <PanelHead title="/platform" meta="Top queries vs page content" />
        <dl className="pv-dl">
          <div>
            <dt>Title</dt>
            <dd>Zernovelle · Workflow software</dd>
          </div>
          <div>
            <dt>H1</dt>
            <dd>Run every team’s workflow</dd>
          </div>
        </dl>
        <ul className="pv-list">
          {queries.map(([query, covered]) => (
            <li key={query}>
              <span className="pv-list-main">
                <span>{query}</span>
              </span>
              <Pill tone={covered ? 'accent' : 'warning'}>
                {covered ? 'Term on page' : 'Term missing'}
              </Pill>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function AcquisitionView() {
  return (
    <div className="pv-view">
      <div className="pv-panel pv-review">
        <PanelHead title="New research" meta="Review before collecting" />
        <dl className="pv-dl">
          <div>
            <dt>Dataset</dt>
            <dd>Referring domains</dd>
          </div>
          <div>
            <dt>Target</dt>
            <dd>brelovanta.example</dd>
          </div>
          <div>
            <dt>Market</dt>
            <dd>United States · English</dd>
          </div>
          <div>
            <dt>Row limit</dt>
            <dd>1,000</dd>
          </div>
          <div>
            <dt>Maximum cost</dt>
            <dd>Shown here before you confirm</dd>
          </div>
        </dl>
        <span className="pv-button">Confirm collection</span>
      </div>
    </div>
  );
}

export function PropertyMappingView() {
  return (
    <div className="pv-view">
      <div className="pv-panel">
        <PanelHead title="Google Search Console" meta="Owner or Admin" />
        <dl className="pv-dl">
          <div>
            <dt>Project domain</dt>
            <dd>zernovelle.example</dd>
          </div>
          <div>
            <dt>Mapped property</dt>
            <dd>sc-domain:zernovelle.example</dd>
          </div>
          <div>
            <dt>Last import</dt>
            <dd>Sep 19</dd>
          </div>
        </dl>
        <div className="pv-chip-row">
          <Pill tone="accent">
            <Check className="size-3" aria-hidden /> Connected
          </Pill>
          <Pill tone="info">Latest days still processing</Pill>
        </div>
      </div>
    </div>
  );
}

export function PageReportView() {
  return (
    <div className="pv-view">
      <div className="pv-panel">
        <span className="pv-list-main">
          <span className="pv-panel-title">/platform</span>
          <span className="pv-meta">One page, three separate signals</span>
        </span>
      </div>
      <div className="pv-kpis">
        <div className="pv-kpi">
          <span className="pv-meta">AI referral sessions</span>
          <strong>214</strong>
          <span className="pv-meta">GA4 · 28 days</span>
        </div>
        <div className="pv-kpi">
          <span className="pv-meta">Cited in answers</span>
          <strong>6</strong>
          <span className="pv-meta">tracked prompts</span>
        </div>
        <div className="pv-kpi">
          <span className="pv-meta">Site Health</span>
          <strong>1</strong>
          <span className="pv-meta">open finding</span>
        </div>
      </div>
      <div className="pv-panel">
        <PanelHead title="Sessions by assistant" />
        <div className="pv-stack-bar" aria-hidden>
          <i data-tone="accent" style={{ flexGrow: 141 }} />
          <i data-tone="info" style={{ flexGrow: 48 }} />
          <i data-tone="warning" style={{ flexGrow: 25 }} />
        </div>
        <div className="pv-legend">
          <span data-series="1">ChatGPT 141</span>
          <span data-series="2">Gemini 48</span>
          <span data-series="3">Claude 25</span>
        </div>
      </div>
    </div>
  );
}
