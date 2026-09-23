import { useState } from 'react';
import { ArrowUpRight, Check, Grid2X2, Search } from 'lucide-react';

import { DEMO_CTA, DEMO_EXTERNAL, DEMO_HREF } from '@/lib/marketing-content/nav';
import { TabPanel, TabsBar, TabsRoot } from '@/components/ui/tabs';
import { MODULES, SOURCE_ROWS, type ModuleId } from './landing-data';
import { HeroDashboardPreview } from './landing-hero-dashboard';
import { SourceMixPie } from './source-mix-pie';
import { ScaledPreview } from '../primitives/scaled-preview';

type SourceView = 'domains' | 'urls';

function SourceTable({ view }: Readonly<{ view: SourceView }>) {
  return (
    <table className={`cl-source-table${view === 'urls' ? ' cl-source-table-urls' : ''}`}>
      <colgroup>
        <col className="cl-source-url-col" />
        <col className="cl-source-type-col" />
        <col className="cl-source-citations-col" />
        <col className="cl-source-prompts-col" />
      </colgroup>
      <thead>
        <tr>
          <th scope="col">{view === 'domains' ? 'Domain' : 'URL'}</th>
          <th scope="col">Source type</th>
          <th scope="col">Citations</th>
          <th scope="col">Used</th>
        </tr>
      </thead>
      <tbody>
        {SOURCE_ROWS.slice(0, 3).map((row, index) => (
          <tr key={row.domain}>
            <td aria-label={view === 'domains' ? row.domain : row.url}>
              <span className="cl-source-name">
                <span className={`cl-favicon cl-favicon-${index}`}>
                  {row.domain[0].toUpperCase()}
                </span>
                <span>{view === 'domains' ? row.domain : row.url}</span>
              </span>
            </td>
            <td>{row.type}</td>
            <td>{row.citations}</td>
            <td>
              <span className="cl-prompt-count">
                <i style={{ width: `${(row.prompts / 18) * 45}%` }} />
                {row.prompts}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SourceSummary() {
  return (
    <div className="cl-source-summary">
      <div>
        <span className="cl-overline">Source mix</span>
        <SourceMixPie />
      </div>
      <div className="cl-citation-count">
        <strong>130</strong>
        <span>citations</span>
      </div>
    </div>
  );
}

function SourcesPreview() {
  const [view, setView] = useState<SourceView>('domains');
  return (
    <div className="cl-preview-content">
      <div className="cl-preview-heading">
        <div>
          <h4>Citation sources</h4>
          <p>
            {view === 'urls'
              ? 'URL usage across completed answers'
              : 'Domain usage across completed answers'}
          </p>
        </div>
        <fieldset className="cl-segment" aria-label="Source view">
          <button
            type="button"
            aria-pressed={view === 'domains'}
            onClick={() => setView('domains')}
          >
            Domains
          </button>
          <button type="button" aria-pressed={view === 'urls'} onClick={() => setView('urls')}>
            URLs
          </button>
        </fieldset>
      </div>
      <SourceSummary />
      <SourceTable view={view} />
    </div>
  );
}

function VisibilityPreview() {
  return (
    <div className="cl-preview-content">
      <div className="cl-metric-grid cl-visibility-metrics">
        <div>
          <small>Brand visibility</small>
          <strong>64.4%</strong>
          <span>+8.2 pp</span>
        </div>
        <div>
          <small>Average position</small>
          <strong>2.4</strong>
          <span>Across observed answers</span>
        </div>
        <div>
          <small>Tracked prompts</small>
          <strong>42</strong>
          <span>3 answer engines</span>
        </div>
      </div>
      <div className="cl-chart">
        <div className="cl-chart-lines" />
        <svg viewBox="0 0 560 150" preserveAspectRatio="none" aria-hidden>
          <path d="M0 117 C60 98 76 112 130 80 S222 92 270 67 S358 78 403 42 S489 59 560 17" />
        </svg>
        <p className="sr-only">
          Brand visibility trends upward over the last 30 days, ending 8.2 percentage points higher.
        </p>
      </div>
      <div className="cl-preview-foot">
        Zernovelle <span>vs Brelovanta and Flevorynth</span>
      </div>
    </div>
  );
}

function HealthPreview() {
  return (
    <div className="cl-preview-content">
      <div className="cl-preview-heading">
        <div>
          <h4>Site Health</h4>
          <p>Page-level crawl findings</p>
        </div>
        <span className="cl-pill">Completed crawl</span>
      </div>
      <div className="cl-metric-grid">
        <div>
          <small>Pages analyzed</small>
          <strong>84</strong>
        </div>
        <div>
          <small>Findings</small>
          <strong>12</strong>
        </div>
        <div>
          <small>Needs review</small>
          <strong>3</strong>
        </div>
      </div>
      <div className="cl-simple-list">
        <div>
          <span>Indexing blocked by noindex</span>
          <b>2 pages</b>
        </div>
        <div>
          <span>Invalid structured data syntax</span>
          <b>4 pages</b>
        </div>
        <div>
          <span>Missing canonical reference</span>
          <b>6 pages</b>
        </div>
      </div>
    </div>
  );
}

function DemandPreview() {
  return (
    <div className="cl-preview-content">
      <div className="cl-preview-heading">
        <div>
          <h4>Search demand</h4>
          <p>Query and landing-page evidence</p>
        </div>
        <span className="cl-pill">GSC connected</span>
      </div>
      <div className="cl-metric-grid">
        <div>
          <small>Clicks</small>
          <strong>1,024</strong>
        </div>
        <div>
          <small>Impressions</small>
          <strong>38.2k</strong>
        </div>
        <div>
          <small>Queries</small>
          <strong>312</strong>
        </div>
      </div>
      <div className="cl-simple-list">
        <div>
          <span>workflow automation software</span>
          <b>510 clicks</b>
        </div>
        <div>
          <span>approval workflow tools</span>
          <b>289 clicks</b>
        </div>
        <div>
          <span>cross-team workflow platform</span>
          <b>142 clicks</b>
        </div>
      </div>
    </div>
  );
}

function ContentPreview() {
  return (
    <div className="cl-preview-content">
      <div className="cl-preview-heading">
        <div>
          <h4>Content Intelligence</h4>
          <p>Source-backed content preparation</p>
        </div>
        <span className="cl-pill">Draft</span>
      </div>
      <div className="cl-brief">
        <div className="cl-brief-nav">
          <b>Content brief</b>
          <span>Overview</span>
          <span>Source evidence</span>
          <span>Suggested outline</span>
          <span>Structured data</span>
        </div>
        <div>
          <span className="cl-overline">Comparison content</span>
          <h5>Workflow software for multi-team operations</h5>
          <p>Comparison criteria supported by documented product capabilities.</p>
          <dl>
            <div>
              <dt>Supporting sources</dt>
              <dd>4 project records</dd>
            </div>
            <div>
              <dt>Claim review</dt>
              <dd>1 item requires evidence</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}

function McpPreview() {
  return (
    <div className="cl-preview-content">
      <div className="cl-preview-heading">
        <div>
          <h4>MCP connection</h4>
          <p>Read-only access to authorized project context</p>
        </div>
        <span className="cl-pill">Connected</span>
      </div>
      <div className="cl-simple-list cl-mcp-list">
        <div>
          <span>AI visibility</span>
          <b>Recorded performance and answers</b>
        </div>
        <div>
          <span>Search demand</span>
          <b>Persisted demand snapshot</b>
        </div>
        <div>
          <span>Site Health</span>
          <b>Page findings and crawl evidence</b>
        </div>
      </div>
      <a className="cl-text-link" href="/docs/mcp">
        MCP documentation <ArrowUpRight size={16} aria-hidden />
      </a>
    </div>
  );
}

const PREVIEWS = {
  visibility: VisibilityPreview,
  sources: SourcesPreview,
  health: HealthPreview,
  demand: DemandPreview,
  content: ContentPreview,
  mcp: McpPreview,
};

export function PlatformExplorer({
  selected,
  selectModule,
}: Readonly<{ selected: ModuleId; selectModule: (module: ModuleId) => void }>) {
  return (
    <section className="cl-section cl-platform" id="see-it">
      <span className="cl-anchor" id="platform" />
      <div className="cl-wrap">
        <div className="cl-section-head">
          <h2>Connected capabilities. Consistent context.</h2>
          <p>Measurement, diagnosis and content work remain accessible within the same project.</p>
        </div>
        <TabsRoot value={selected} onValueChange={selectModule}>
          <TabsBar
            items={MODULES.map((item) => ({ value: item.id, label: item.label }))}
            ariaLabel="CiteLadder capabilities"
            className="cl-module-tabs"
            fill
          />
          {MODULES.map((item) => {
            const Preview = PREVIEWS[item.id];
            return (
              <TabPanel
                key={item.id}
                value={item.id}
                forceMount
                className={`cl-module-body cl-hue-${item.id}`}
              >
                <div className="cl-module-copy">
                  <span className="cl-overline">{item.eyebrow}</span>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                  <ul>
                    {item.points.map((point) => (
                      <li key={point}>
                        <Check size={16} aria-hidden />
                        {point}
                      </li>
                    ))}
                  </ul>
                  <a
                    className="cl-text-link"
                    href={DEMO_HREF}
                    {...(DEMO_EXTERNAL ? { target: '_blank', rel: 'noreferrer' } : {})}
                  >
                    {DEMO_CTA} <ArrowUpRight size={16} aria-hidden />
                  </a>
                </div>
                <ScaledPreview width={640} className="cl-product-preview">
                  <div className={`cl-product-stage cl-product-stage-${item.id}`}>
                    <div className="cl-product-card">
                      <div className="cl-window-bar">
                        <Grid2X2 size={14} aria-hidden />
                        Zernovelle / {item.label}
                      </div>
                      <Preview />
                    </div>
                  </div>
                </ScaledPreview>
              </TabPanel>
            );
          })}
        </TabsRoot>
      </div>
    </section>
  );
}

export function HeroPreview() {
  const [selected, setSelected] = useState<'trends' | 'sources'>('trends');
  const tabs = [
    { label: 'Trends', value: 'trends' },
    { label: 'Sources', value: 'sources' },
  ] as const;
  return (
    <ScaledPreview width={1184} className="cl-hero-scaled-preview">
      <div className={`cl-hero-preview${selected === 'sources' ? ' cl-hero-preview-sources' : ''}`}>
        <div className="cl-preview-browser">
          <span>
            <Grid2X2 size={13} aria-hidden />
            zernovelle.example / AI Visibility
          </span>
          <span>Workspace overview</span>
        </div>
        <div className="cl-hero-preview-layout">
          <aside>
            <strong className="cl-workspace-name">
              <span className="cl-favicon">Z</span>Zernovelle
            </strong>
            <span className="cl-sidebar-label">WORKSPACE</span>
            <span>Overview</span>
            <span className="cl-sidebar-active">AI Visibility</span>
            <span>Sources</span>
            <span>Site Health</span>
            <span>Demand</span>
            <span>Content</span>
          </aside>
          <div className="cl-hero-preview-main">
            <div className="cl-hero-preview-title">
              <div>
                <h2>AI Visibility</h2>
                <p>Brand performance across tracked prompts</p>
              </div>
              <span className="cl-pill">
                <Search size={13} aria-hidden /> Last 30 days
              </span>
            </div>
            <TabsRoot value={selected} onValueChange={setSelected}>
              <TabsBar items={tabs} ariaLabel="Preview view" className="cl-hero-preview-tabs" />
              <TabPanel value="trends" forceMount>
                <HeroDashboardPreview />
              </TabPanel>
              <TabPanel value="sources" forceMount>
                <SourcesPreview />
              </TabPanel>
            </TabsRoot>
          </div>
        </div>
      </div>
    </ScaledPreview>
  );
}
