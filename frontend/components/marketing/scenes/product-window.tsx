import { CalendarRange, ChevronDown, Play, Search } from 'lucide-react';

import { LogoMark } from '@/components/ui/logo-mark';
import { ICONS } from '@/lib/icons';

const PREVIEW_NAV_GROUPS = [
  {
    title: 'Workspace',
    items: [
      { label: 'Overview', icon: ICONS.overview },
      { label: 'Growth Agent', icon: ICONS.agent },
    ],
  },
  {
    title: 'Demand Intelligence',
    items: [
      { label: 'Demand overview', icon: ICONS.demand },
      { label: 'AI Visibility', icon: ICONS.visibility, active: true },
      { label: 'AI Referrals', icon: ICONS.analytics },
      { label: 'Traffic', icon: ICONS.traffic },
      { label: 'Prompts', icon: ICONS.prompts },
    ],
  },
] as const;

const TREND_STATS = [
  { label: 'Visibility score', value: '72.4', delta: '+4.8' },
  { label: 'Share of voice', value: '18.6%', delta: '+2.1' },
  { label: 'Brand mentions', value: '1,248', delta: '+96' },
  { label: 'Owned citations', value: '386', delta: '+31' },
] as const;

function FilterChip({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <span className="border-border bg-panel text-secondary inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium">
      {children}
    </span>
  );
}

/**
 * Static marketing preview of the shipped application shell and AI Visibility
 * Trends workspace. It mirrors real product geometry instead of layering a
 * separate landing-page walkthrough inside the app frame.
 */
export function ProductWindow() {
  return (
    <div
      data-testid="product-window"
      className="app-type-scale bg-panel shadow-card mx-auto max-w-6xl overflow-hidden rounded-xl"
    >
      <div
        aria-hidden
        className="bg-background grid min-h-[470px] lg:grid-cols-[190px_minmax(0,1fr)]"
      >
        <aside className="border-border-subtle bg-sidebar hidden border-r lg:flex lg:flex-col">
          <div className="border-border-subtle flex h-12 items-center gap-2.5 border-b px-4">
            <LogoMark size={22} />
            <span className="font-display text-foreground text-sm font-medium">CiteLadder</span>
          </div>

          <div className="border-border-subtle border-b p-2">
            <div className="hover:bg-background-alt flex items-center gap-2 rounded-sm px-2 py-1.5">
              <span className="bg-foreground text-background flex size-7 items-center justify-center rounded-md text-[10px] font-semibold">
                AC
              </span>
              <span className="text-foreground min-w-0 flex-1 truncate text-xs font-medium">
                Acme Corp
              </span>
              <ChevronDown className="text-muted size-3.5" strokeWidth={2} />
            </div>
          </div>

          <nav className="flex flex-col gap-4 p-2" aria-label="Product preview navigation">
            {PREVIEW_NAV_GROUPS.map((group) => (
              <div key={group.title}>
                <p className="text-subtle px-2 pb-1 text-[10px] font-semibold">{group.title}</p>
                <div className="grid gap-0.5">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = 'active' in item && item.active;
                    return (
                      <div
                        key={item.label}
                        className={
                          active
                            ? 'bg-accent-soft text-accent-hover relative flex h-8 items-center gap-2 rounded-sm px-2 text-xs font-medium'
                            : 'text-secondary flex h-8 items-center gap-2 rounded-sm px-2 text-xs font-medium'
                        }
                      >
                        {active ? (
                          <span className="bg-accent absolute inset-y-1.5 left-0 w-1 rounded-r-sm" />
                        ) : null}
                        <Icon className="size-3.5" strokeWidth={2} />
                        <span>{item.label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </aside>

        <div className="flex min-w-0 flex-col">
          <header className="border-border-subtle bg-panel flex h-12 shrink-0 items-center border-b px-4">
            <div className="flex items-center gap-2 lg:hidden">
              <LogoMark size={20} />
              <span className="font-display text-foreground text-sm font-medium">CiteLadder</span>
            </div>
            <div className="border-border bg-background text-muted mx-auto hidden h-8 w-full max-w-72 items-center gap-2 rounded-md border px-3 text-xs sm:flex">
              <Search className="size-3.5" strokeWidth={2} />
              <span className="flex-1">Search or jump to…</span>
              <span className="border-border bg-panel rounded-xs border px-1.5 py-0.5 text-[10px]">
                ⌘ K
              </span>
            </div>
          </header>

          <main className="flex-1 p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-2">
              <FilterChip>
                Core
                <ChevronDown className="size-3" strokeWidth={2} />
              </FilterChip>
              <FilterChip>
                <ICONS.analytics className="size-3" strokeWidth={2} />
                All models
                <ChevronDown className="size-3" strokeWidth={2} />
              </FilterChip>
              <FilterChip>
                <CalendarRange className="size-3" strokeWidth={2} />
                Last 90 days
                <ChevronDown className="size-3" strokeWidth={2} />
              </FilterChip>
              <span className="bg-accent text-background ml-auto inline-flex h-8 items-center gap-1.5 rounded-sm px-3 text-xs font-medium shadow-xs">
                <Play className="size-3" fill="currentColor" strokeWidth={2} />
                Run audit
              </span>
            </div>

            <div className="border-border mt-5 flex gap-6 overflow-hidden border-b">
              {['Overview', 'Trends', 'Mentions & Citations', 'Query Fanout'].map((tab) => (
                <span
                  key={tab}
                  className={
                    tab === 'Trends'
                      ? 'border-accent text-foreground shrink-0 border-b-2 pb-2 text-xs font-medium'
                      : 'text-muted shrink-0 pb-2 text-xs font-medium'
                  }
                >
                  {tab}
                </span>
              ))}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
              {TREND_STATS.map((stat) => (
                <div key={stat.label} className="bg-panel shadow-card rounded-lg p-3.5">
                  <p className="text-subtle text-[10px] font-semibold">{stat.label}</p>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-foreground text-lg font-medium tabular-nums">
                      {stat.value}
                    </span>
                    <span className="text-success-text text-[10px] font-medium tabular-nums">
                      {stat.delta}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <section className="bg-panel shadow-card mt-3 rounded-lg p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-foreground text-sm font-medium">Visibility Score</h3>
                  <p className="text-muted mt-0.5 text-[10px]">
                    Cross-run trend across completed audits
                  </p>
                </div>
                <span className="bg-neutral-bg text-secondary rounded-full px-2 py-1 text-[10px] font-medium">
                  8 runs
                </span>
              </div>

              <div className="mt-4 grid grid-cols-[24px_minmax(0,1fr)] gap-2">
                <div className="text-subtle flex h-32 flex-col justify-between text-right text-[9px] tabular-nums">
                  <span>100</span>
                  <span>75</span>
                  <span>50</span>
                  <span>25</span>
                  <span>0</span>
                </div>
                <div className="relative h-32">
                  <div className="absolute inset-0 flex flex-col justify-between">
                    {[0, 1, 2, 3, 4].map((line) => (
                      <span key={line} className="border-border-subtle block border-t" />
                    ))}
                  </div>
                  <svg
                    className="text-accent absolute inset-0 h-full w-full overflow-visible"
                    viewBox="0 0 600 128"
                    preserveAspectRatio="none"
                  >
                    <path
                      d="M0 101 C65 94 103 82 170 84 C242 85 274 61 342 67 C410 73 466 45 520 48 C552 48 575 35 600 30"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <circle cx="600" cy="30" r="4" fill="currentColor" />
                  </svg>
                </div>
              </div>
              <div className="text-subtle mt-2 ml-8 flex justify-between text-[9px] tabular-nums">
                <span>Apr 01</span>
                <span>May 15</span>
                <span>Jun 30</span>
              </div>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}
