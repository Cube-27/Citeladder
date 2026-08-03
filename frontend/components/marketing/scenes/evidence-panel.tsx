import { Download, FileSpreadsheet, ShoppingBag } from 'lucide-react';

import type { SolutionScene } from '@/lib/marketing-content/solutions';

import { Badge } from '../primitives/badge';
import { Meta } from '../primitives/label';
import { ExampleDataNote, Panel, WallpaperPanel } from './wallpaper-panel';

/**
 * Product snapshot panels, one per audience segment.
 * Displays clear, structured, and realistic evidence metrics for each segment.
 */
function Bar({ width, own = false }: Readonly<{ width: number; own?: boolean }>) {
  return (
    <span className="bg-mkt-surface-sunk block h-2 flex-1 overflow-hidden rounded-full">
      <span
        style={{ width: `${width}%` }}
        className={`block h-full rounded-full transition-all duration-300 ${
          own ? 'bg-mkt-indigo' : 'bg-mkt-mist'
        }`}
      />
    </span>
  );
}

const PANELS: Record<SolutionScene, { label: string; body: React.ReactNode }> = {
  share: {
    label: 'Client report — share of answers',
    body: (
      <>
        <div className="gap-mkt-20 grid">
          {[
            { name: 'Acme Corp (Client)', share: 68, mentions: '84 mentions', own: true },
            { name: 'Vortex AI (Rival)', share: 42, mentions: '52 mentions', own: false },
            { name: 'Apex Labs (Rival)', share: 24, mentions: '30 mentions', own: false },
          ].map(({ name, share, mentions, own }) => (
            <div key={name} className="gap-mkt-6 flex flex-col">
              <div className="text-mkt-sm flex items-center justify-between">
                <span
                  className={`font-medium ${own ? 'text-mkt-ink font-semibold' : 'text-mkt-ink-soft'}`}
                >
                  {name}
                </span>
                <span className="text-mkt-xs text-mkt-ink-soft font-mono">
                  {share}% SOV · {mentions}
                </span>
              </div>
              <Bar width={share} own={own} />
            </div>
          ))}
        </div>
        <div className="border-mkt-black-10 mt-mkt-20 gap-mkt-10 pt-mkt-20 flex flex-wrap items-center justify-between border-t">
          <div className="gap-mkt-10 flex flex-wrap">
            <span className="border-mkt-black-10 bg-mkt-surface-sunk text-mkt-ink-soft text-mkt-sm gap-mkt-6 rounded-mkt-sm px-mkt-14 py-mkt-6 inline-flex items-center border font-medium">
              <Download aria-hidden strokeWidth={2} className="size-4" />
              Mentions (CSV)
            </span>
            <span className="border-mkt-black-10 bg-mkt-surface-sunk text-mkt-ink-soft text-mkt-sm gap-mkt-6 rounded-mkt-sm px-mkt-14 py-mkt-6 inline-flex items-center border font-medium">
              <FileSpreadsheet aria-hidden strokeWidth={2} className="size-4" />
              Evidence (Markdown)
            </span>
          </div>
          <Badge tone="proof">4 Engines Audited</Badge>
        </div>
      </>
    ),
  },
  health: {
    label: 'Site health — Web Fundamentals & AEO',
    body: (
      <>
        <div className="gap-mkt-20 grid">
          {[
            { name: 'Web Fundamentals', value: 88, status: 'Optimal' },
            { name: 'AEO Readiness', value: 74, status: 'Good' },
            { name: 'Schema Validation', value: 92, status: 'Validated' },
          ].map(({ name, value, status }) => (
            <div key={name} className="gap-mkt-6 flex flex-col">
              <div className="text-mkt-sm flex items-center justify-between">
                <span className="text-mkt-ink font-medium">{name}</span>
                <div className="gap-mkt-10 flex items-center">
                  <span className="text-mkt-xs text-mkt-ink-soft">{status}</span>
                  <span className="text-mkt-ink font-mono font-semibold tabular-nums">
                    {value}/100
                  </span>
                </div>
              </div>
              <Bar width={value} own={value >= 80} />
            </div>
          ))}
        </div>
        <div className="border-mkt-black-10 mt-mkt-20 gap-mkt-10 pt-mkt-20 flex flex-wrap border-t">
          <Badge tone="good">Search Console Synced</Badge>
          <Badge tone="good">GA4 Connected</Badge>
          <Badge tone="neutral">33 Rules Checked</Badge>
        </div>
      </>
    ),
  },
  sample: {
    label: 'Sample crawl — seeded and capped',
    body: (
      <>
        <div className="gap-mkt-14 grid">
          {[
            { label: 'Pages Sampled', val: '25 / 25 Seeded URLs' },
            { label: 'Prompts Tested', val: '50 Target Queries' },
            { label: 'AI Recommendation Rate', val: '78% Positive Mention' },
            { label: 'BYOK Provider Cost', val: '$0.14 Total API Cost' },
          ].map(({ label, val }) => (
            <div
              key={label}
              className="border-mkt-black-10 text-mkt-sm pb-mkt-10 flex items-center justify-between border-b last:border-b-0 last:pb-0"
            >
              <span className="text-mkt-ink-soft">{label}</span>
              <span className="text-mkt-ink font-mono font-medium">{val}</span>
            </div>
          ))}
        </div>
        <div className="border-mkt-black-10 mt-mkt-20 gap-mkt-10 pt-mkt-20 flex flex-wrap border-t">
          <Badge tone="proof">Raw Run Persisted</Badge>
          <Badge tone="neutral">Zero Lock-In</Badge>
        </div>
      </>
    ),
  },
  commerce: {
    label: 'Ecommerce — product AI visibility',
    body: (
      <>
        <div className="rounded-mkt-sm border-mkt-black-10 bg-mkt-surface-sunk p-mkt-14 border">
          <div className="text-mkt-sm flex items-center justify-between">
            <span className="text-mkt-ink gap-mkt-10 flex items-center font-semibold">
              <ShoppingBag className="text-mkt-indigo size-4" aria-hidden />
              Acoustic Pro ANC Headphones
            </span>
            <Badge tone="good">100% Price Match</Badge>
          </div>
          <div className="border-mkt-black-10 text-mkt-sm mt-mkt-14 gap-mkt-10 pt-mkt-14 grid grid-cols-2 border-t">
            <div>
              <span className="text-mkt-xs text-mkt-ink-soft block">Quoted Price</span>
              <span className="text-mkt-ink font-mono font-semibold">$299.00</span>
            </div>
            <div>
              <span className="text-mkt-xs text-mkt-ink-soft block">Engine Rank</span>
              <span className="text-mkt-indigo font-medium">#1 Recommended</span>
            </div>
          </div>
        </div>
        <div className="text-mkt-sm text-mkt-ink-soft mt-mkt-20 flex items-center justify-between">
          <span>Competitor Co-Placement:</span>
          <span className="text-mkt-ink font-medium">Sony WH-1000XM5</span>
        </div>
        <div className="border-mkt-black-10 mt-mkt-20 gap-mkt-10 pt-mkt-20 flex flex-wrap border-t">
          <Badge tone="proof">Shopify Catalog Synced</Badge>
          <Badge tone="good">64% SKU Share of Voice</Badge>
        </div>
      </>
    ),
  },
  citations: {
    label: 'Citation ownership — per prompt',
    body: (
      <>
        <div className="rounded-mkt-sm bg-mkt-surface-sunk border-mkt-black-10 text-mkt-sm text-mkt-ink mb-mkt-20 p-mkt-14 border font-medium">
          &quot;What are the top enterprise AI search platforms?&quot;
        </div>
        <div className="gap-mkt-14 grid">
          {[
            {
              label: 'Owned Domain (Press Release)',
              share: 58,
              engines: 'Cited in 4/5 engines',
              own: true,
            },
            {
              label: 'TechCrunch (Earned Media)',
              share: 34,
              engines: 'Cited in 3/5 engines',
              own: false,
            },
            {
              label: 'Competitor Domain',
              share: 18,
              engines: 'Cited in 1/5 engines',
              own: false,
            },
          ].map(({ label, share, engines, own }) => (
            <div key={label} className="gap-mkt-6 flex flex-col">
              <div className="text-mkt-sm flex items-center justify-between">
                <span
                  className={`font-medium ${own ? 'text-mkt-ink font-semibold' : 'text-mkt-ink-soft'}`}
                >
                  {label}
                </span>
                <span className="text-mkt-xs text-mkt-ink-soft font-mono">{engines}</span>
              </div>
              <Bar width={share} own={own} />
            </div>
          ))}
        </div>
        <div className="border-mkt-black-10 mt-mkt-20 gap-mkt-10 pt-mkt-20 flex flex-wrap border-t">
          <Badge tone="proof">Query Fanout Tracked</Badge>
          <Badge tone="neutral">Coverage Report Ready</Badge>
        </div>
      </>
    ),
  },
};

export function SolutionEvidencePanel({ scene }: Readonly<{ scene: SolutionScene }>) {
  const { label, body } = PANELS[scene];
  return (
    <WallpaperPanel className="p-mkt-20 sm:p-mkt-30">
      <div className="mb-mkt-14 gap-mkt-14 flex items-center justify-between">
        <Meta as="p" className="text-mkt-ink-soft font-medium">
          {label}
        </Meta>
        <ExampleDataNote />
      </div>
      <Panel className="p-mkt-20">
        {/* Every figure below is fabricated. `ExampleDataNote` above stays
            readable — it is the honesty mark — but the rows themselves are
            hidden, so a screen reader is not read a table of invented metrics
            as if it were page content. */}
        <div aria-hidden>{body}</div>
      </Panel>
    </WallpaperPanel>
  );
}
