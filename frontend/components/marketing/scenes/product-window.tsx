import { ICONS } from '@/lib/icons';
import { cn } from '@/lib/utils';

import { Meta } from '../primitives/label';
import { ExampleDataNote, WallpaperPanel } from './wallpaper-panel';

/**
 * The product canvas: the real workspace shell on the wallpaper. The sidebar
 * mirrors the app's actual Analyze / Improve groups and their real labels
 * (components/layout/nav-items.ts) rather than inventing a friendlier
 * information architecture for the marketing site — a visitor who books a
 * demo should recognise the screen they were shown.
 *
 * The canvas shows ONE honest moment, not a dashboard: a single metric opened
 * to the answer it was derived from. That is the product's whole claim — every
 * score traces to a persisted artifact and a versioned rule — so the scene
 * dramatises the claim instead of drawing a decorative chart of invented data.
 *
 * The figures are illustrative, so the whole canvas is aria-hidden and the
 * "Example data" mark stays visible.
 */
// Real labels AND real glyphs, straight off the canonical icon map, so the
// scene is the product rather than a drawing of it.
const SIDEBAR = [
  {
    group: 'Analyze',
    items: [
      { label: 'Visibility', Icon: ICONS.visibility },
      { label: 'Answers', Icon: ICONS.analytics },
      { label: 'Traffic', Icon: ICONS.traffic },
      { label: 'Commerce', Icon: ICONS.products },
    ],
  },
  {
    group: 'Improve',
    items: [
      { label: 'Content', Icon: ICONS.content },
      { label: 'Site health', Icon: ICONS.siteHealth },
      { label: 'Opportunities', Icon: ICONS.opportunities },
    ],
  },
] as const;

const METRICS: readonly { label: string; value: string; delta?: string }[] = [
  { label: 'Visibility index', value: '72.4', delta: '+4.8' },
  { label: 'Share of voice', value: '18.6', delta: '+2.1' },
  { label: 'Answers observed', value: '1,248' },
];

// The one opened metric: the trace behind "Visibility index 72.4". This is the
// honest moment — a score, the observed answer it came from, and the receipts.
const EVIDENCE = {
  answer:
    '“For enterprise analytics, teams most often cite Searchify alongside the two market leaders…”',
  chain: [
    ['Provider', 'ChatGPT'],
    ['Artifact', 'a3f9c1'],
    ['Analyzer', 'visibility-v4.2'],
    ['Reproducible', 'yes'],
  ],
} as const;

export function ProductWindow() {
  return (
    <WallpaperPanel className="p-3 sm:p-6 lg:p-8">
      <div className="mb-3 flex items-center justify-between gap-3">
        <Meta as="p" className="text-mkt-ink-muted">
          Workspace / visibility
        </Meta>
        <ExampleDataNote />
      </div>

      <div aria-hidden className="grid lg:grid-cols-[13.75rem_minmax(0,1fr)]">
        <aside className="bg-mkt-surface shadow-card hidden rounded-lg p-5 lg:block lg:rounded-r-none">
          {SIDEBAR.map(({ group, items }) => (
            <div key={group} className="mb-5 last:mb-0">
              <Meta as="p" className="text-mkt-ink-muted mb-2 px-2">
                {group}
              </Meta>
              {items.map(({ label, Icon }, index) => (
                <div
                  key={label}
                  className={cn(
                    'text-mkt-sm flex items-center gap-2.5 rounded-sm px-2.5 py-2',
                    group === 'Analyze' && index === 0
                      ? 'bg-mkt-proof-soft text-mkt-proof font-semibold'
                      : 'text-mkt-ink-muted',
                  )}
                >
                  <Icon className="size-3.5 shrink-0" strokeWidth={1.75} />
                  {label}
                </div>
              ))}
            </div>
          ))}
        </aside>

        <div className="bg-mkt-surface shadow-card rounded-lg p-4 sm:p-5 lg:rounded-l-none">
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="font-mkt-display text-mkt-ink text-mkt-d5">Visibility</p>
            <Meta className="border-mkt-line rounded-sm border px-2 py-1">Apr 01 — Jun 30</Meta>
          </div>

          {/* Columns and dividers both derive from METRICS.length, so adding or
              removing a metric cannot leave a stray divider or a wrong grid. */}
          <div
            className="border-mkt-line-soft rounded-mkt-sm grid border"
            style={{ gridTemplateColumns: `repeat(${METRICS.length}, minmax(0, 1fr))` }}
          >
            {METRICS.map((metric, index) => (
              <div
                key={metric.label}
                className={cn(
                  'p-3 sm:p-4',
                  index < METRICS.length - 1 && 'border-mkt-line-soft border-r',
                )}
              >
                <Meta as="p" className="text-mkt-ink-muted">
                  {metric.label}
                </Meta>
                <b className="text-mkt-ink text-mkt-d4 mt-2 block font-mono leading-none tabular-nums">
                  {metric.value}
                  {metric.delta && (
                    <small className="text-mkt-evidence-text text-mkt-meta ml-1.5 font-mono font-medium tabular-nums">
                      {metric.delta}
                    </small>
                  )}
                </b>
              </div>
            ))}
          </div>

          {/* The opened metric. A visible tie-line runs from "Visibility index"
              to the answer that produced it, so the trace reads as one gesture
              rather than a second, unrelated panel. */}
          <div className="rounded-mkt-sm bg-mkt-paper-raised shadow-card mt-3 p-4 sm:p-5">
            <div className="text-mkt-ink-muted text-mkt-sm flex items-center gap-2">
              <span>Visibility index</span>
              <span className="border-mkt-line-soft flex-1 border-t border-dashed" />
              <span className="text-mkt-proof font-mono tabular-nums">72.4</span>
            </div>
            <p className="text-mkt-ink text-mkt-body mt-3">{EVIDENCE.answer}</p>
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1.5">
              {EVIDENCE.chain.map(([label, value]) => (
                <Meta key={label} className="text-mkt-evidence-text">
                  {label} / {value}
                </Meta>
              ))}
            </div>
          </div>
        </div>
      </div>
    </WallpaperPanel>
  );
}
