'use client';

import { useRef, useState, type ReactNode } from 'react';

import { cycled } from '@/lib/utils';

import {
  AgentView,
  AppShellFrame,
  SiteHealthView,
  SourcesView,
  VisibilityView,
  type AppShellChrome,
  type ShellFilters,
} from '../scenes/product-views';
import { useAutoplay } from './use-autoplay';

/* The real AI Visibility page's tabs and filter bar. */
const VISIBILITY_TABS = ['Trends', 'Sources', 'Query fanouts'] as const;
const VISIBILITY_FILTERS: ShellFilters = [
  ['Latest run', 'Last 90 days', 'Per run'],
  ['Visibility prompts', 'All surfaces'],
];

const TOUR = [
  {
    id: 'visibility',
    label: 'Visibility',
    shell: {
      active: 'AI Visibility',
      title: 'AI Visibility',
      action: 'Launch audit',
      tabs: VISIBILITY_TABS,
      activeTab: 'Trends',
      filters: VISIBILITY_FILTERS,
    },
    View: VisibilityView,
  },
  {
    id: 'citations',
    label: 'Citations',
    shell: {
      active: 'AI Visibility',
      title: 'AI Visibility',
      action: 'Launch audit',
      tabs: VISIBILITY_TABS,
      activeTab: 'Sources',
      filters: VISIBILITY_FILTERS,
    },
    View: SourcesView,
  },
  {
    id: 'health',
    label: 'Site Health',
    shell: {
      active: 'Website',
      title: 'Website',
      tabs: ['Overview', 'Pages', 'Architecture', 'AEO Readiness', 'Internal links', 'Changes'],
      activeTab: 'Overview',
    },
    View: SiteHealthView,
  },
  {
    id: 'agent',
    label: 'Agent',
    shell: {
      mode: 'agent',
      active: 'Technical fix brief for /platform',
      title: 'Agent',
    },
    View: AgentView,
  },
] as const satisfies readonly {
  id: string;
  label: string;
  shell: AppShellChrome;
  View: () => ReactNode;
}[];

type TourId = (typeof TOUR)[number]['id'];

const TOUR_INTERVAL_MS = 8000;

/** The page's only interactive region; Astro hydrates it as its own island. */
export function HeroTour() {
  const root = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<TourId>('visibility');
  // The first click or key on the tabs hands the tour to the reader for good.
  const [autoplay, setAutoplay] = useState(true);
  const step = TOUR.find((item) => item.id === active) ?? TOUR[0];
  const choose = (id: TourId) => {
    setAutoplay(false);
    setActive(id);
  };

  useAutoplay({
    target: root,
    intervalMs: TOUR_INTERVAL_MS,
    enabled: autoplay,
    onTick: () =>
      setActive((id) => cycled(TOUR, TOUR.findIndex((entry) => entry.id === id) + 1).id),
  });

  return (
    <div ref={root} className="lp-tour">
      <div className="lp-tour-tabs" role="tablist" aria-label="Product tour">
        {TOUR.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`tour-tab-${item.id}`}
            aria-selected={item.id === active}
            aria-controls="tour-panel"
            tabIndex={item.id === active ? 0 : -1}
            onClick={() => choose(item.id)}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
              const index = TOUR.findIndex((entry) => entry.id === active);
              const next = cycled(TOUR, index + (event.key === 'ArrowRight' ? 1 : TOUR.length - 1));
              choose(next.id);
              document.getElementById(`tour-tab-${next.id}`)?.focus();
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="lp-hero-stage product-stage">
        {/* Keyed by step so the view's entrance animations replay on each switch. */}
        <div
          key={step.id}
          id="tour-panel"
          role="tabpanel"
          aria-labelledby={`tour-tab-${step.id}`}
          className="lp-hero-frame product-fit"
        >
          <AppShellFrame {...step.shell}>
            <step.View />
          </AppShellFrame>
        </div>
      </div>
      <p className="product-caption text-center">
        Illustrative example with synthetic data. Engine availability depends on your plan.
      </p>
    </div>
  );
}
