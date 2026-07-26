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
      { label: 'Prompts', Icon: ICONS.prompts },
      { label: 'Products', Icon: ICONS.products },
    ],
  },
  {
    group: 'Improve',
    items: [
      { label: 'Site health', Icon: ICONS.siteHealth },
      { label: 'Opportunities', Icon: ICONS.opportunities },
    ],
  },
] as const;

const METRICS: readonly { label: string; value: string; delta?: string }[] = [
  { label: 'Visibility index', value: '72.4', delta: '+4.8' },
  { label: 'Share of voice', value: '18.6', delta: '+2.1' },
  { label: 'Answers observed', value: '1,248' },
  { label: 'Citations traced', value: '3,091' },
];

const RANKING = [
  ['ChatGPT', '81'],
  ['Gemini', '76'],
  ['Perplexity', '73'],
  ['Claude', '68'],
  ['Grok', '64'],
] as const;

const PANEL = 'border-mkt-line rounded-mkt-sm bg-mkt-paper-raised/80 border p-4';

export function ProductWindow() {
  return (
    <WallpaperPanel className="p-4 sm:p-8 lg:p-10">
      <div className="mb-3.5 flex items-center justify-between gap-3">
        <Meta as="p" className="text-mkt-slate-soft">
          Workspace / market overview
        </Meta>
        <ExampleDataNote />
      </div>

      <div aria-hidden className="grid lg:grid-cols-[13.75rem_minmax(0,1fr)]">
        <aside className="border-mkt-glass-line bg-mkt-glass rounded-mkt-md hidden border p-5 backdrop-blur-lg lg:block lg:rounded-r-none lg:border-r-0">
          {SIDEBAR.map(({ group, items }) => (
            <div key={group} className="mb-5 last:mb-0">
              <Meta as="p" className="text-mkt-slate-soft mb-2 px-2">
                {group}
              </Meta>
              {items.map(({ label, Icon }, index) => (
                <div
                  key={label}
                  className={cn(
                    'rounded-mkt-xs text-mkt-sm flex items-center gap-2.5 px-2.5 py-2',
                    group === 'Analyze' && index === 0
                      ? 'bg-mkt-proof-soft text-mkt-proof-text font-semibold'
                      : 'text-mkt-slate-soft',
                  )}
                >
                  <Icon className="size-3.5 shrink-0" strokeWidth={1.75} />
                  {label}
                </div>
              ))}
            </div>
          ))}
        </aside>

        <div className="border-mkt-glass-line bg-mkt-glass rounded-mkt-md border p-5 backdrop-blur-lg lg:rounded-l-none">
          <div className="mb-6 flex items-center justify-between gap-3">
            <p className="font-mkt-display text-mkt-ink text-[1.0625rem] font-semibold tracking-[-0.03em]">
              Market overview
            </p>
            <Meta className="border-mkt-line rounded-mkt-xs border px-2.5 py-1.5">
              Apr 01 — Jun 30
            </Meta>
          </div>

          <div className="border-mkt-line rounded-mkt-sm grid grid-cols-2 border md:grid-cols-4">
            {METRICS.map((metric, index) => (
              <div
                key={metric.label}
                className={cn(
                  'border-mkt-line min-h-[6.5rem] p-4',
                  // Two columns below md, four above: the middle divider only
                  // exists once the strip is a single row.
                  index % 2 === 0 && 'border-r',
                  index === 1 && 'md:border-r',
                  index < 2 && 'border-b md:border-b-0',
                )}
              >
                <Meta as="p" className="text-mkt-slate-soft">
                  {metric.label}
                </Meta>
                <b className="text-mkt-ink mkt-num mt-5 block text-[1.75rem] leading-none font-medium tracking-[-0.05em]">
                  {metric.value}
                  {metric.delta && (
                    <small className="text-mkt-evidence-text mkt-num text-mkt-meta ml-1.5 font-medium">
                      {metric.delta}
                    </small>
                  )}
                </b>
              </div>
            ))}
          </div>

          <div className="mt-3.5 grid gap-3.5 lg:grid-cols-[minmax(0,1fr)_13.75rem]">
            <div className={PANEL}>
              <div className="text-mkt-slate-soft text-mkt-sm flex justify-between">
                <span>Category visibility</span>
                <Meta>12 weeks</Meta>
              </div>
              <svg viewBox="0 0 620 230" preserveAspectRatio="none" className="mt-5 h-52 w-full">
                <path d="M0 45H620M0 90H620M0 135H620M0 180H620" className="stroke-mkt-line" />
                <path
                  className="mkt-chart-line stroke-mkt-proof animate-mkt-draw"
                  pathLength={440}
                  d="M0 186 C55 170 72 178 120 146 S185 154 235 119 S310 137 360 88 S430 110 485 65 S555 73 620 35"
                />
                <path
                  className="mkt-chart-line stroke-mkt-evidence animate-mkt-draw"
                  pathLength={440}
                  style={{ animationDelay: '0.45s' }}
                  d="M0 202 C60 190 98 158 150 171 S238 142 290 151 S365 119 415 127 S515 99 620 88"
                />
              </svg>
            </div>

            <div className={PANEL}>
              <div className="text-mkt-slate-soft text-mkt-sm mb-1">Provider view</div>
              {RANKING.map(([engine, score], index) => (
                <div
                  key={engine}
                  className="border-mkt-line text-mkt-slate text-mkt-sm grid grid-cols-[1.125rem_1fr_auto] items-center gap-2 border-b py-2.5 last:border-b-0"
                >
                  <b className="bg-mkt-proof-soft text-mkt-proof-text mkt-num text-mkt-meta grid size-4.5 place-items-center rounded-[0.3125rem]">
                    {index + 1}
                  </b>
                  <span>{engine}</span>
                  <strong className="text-mkt-ink mkt-num font-medium">{score}</strong>
                </div>
              ))}
            </div>
          </div>

          <div className="border-mkt-evidence-line bg-mkt-evidence-soft rounded-mkt-xs mt-3.5 flex flex-wrap justify-between gap-x-6 gap-y-1.5 border px-4 py-3">
            <Meta className="text-mkt-evidence-text">Raw artifacts preserved / 1,248</Meta>
            <Meta className="text-mkt-evidence-text">Analyzer / visibility-v4.2</Meta>
            <Meta className="text-mkt-evidence-text">Reproducible / yes</Meta>
          </div>
        </div>
      </div>
    </WallpaperPanel>
  );
}
