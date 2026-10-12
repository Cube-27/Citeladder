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

const TOUR_INTERVAL_MS = 8000;

/** The page's only interactive region; Astro hydrates it as its own island. */
export function HeroTour() {
  const root = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  // The first click or key on the tabs hands the tour to the reader for good.
  const [autoplay, setAutoplay] = useState(true);
  const step = cycled(TOUR, active);
  const choose = (index: number) => {
    setAutoplay(false);
    setActive(index % TOUR.length);
  };

  useAutoplay({
    target: root,
    intervalMs: TOUR_INTERVAL_MS,
    enabled: autoplay,
    onTick: () => setActive((index) => (index + 1) % TOUR.length),
  });

  return (
    <div ref={root} className="lp-tour">
      {/* Focus counts as interaction too: autoplay moving the selection away
          from a focused tab would leave arrow keys starting from the wrong one. */}
      <div
        className="lp-tour-tabs"
        role="tablist"
        aria-label="Product tour"
        onFocus={() => setAutoplay(false)}
      >
        {TOUR.map((item, index) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`tour-tab-${item.id}`}
            aria-selected={index === active}
            aria-controls="tour-panel"
            tabIndex={index === active ? 0 : -1}
            onClick={() => choose(index)}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
              event.preventDefault();
              const next = active + (event.key === 'ArrowRight' ? 1 : TOUR.length - 1);
              choose(next);
              document.getElementById(`tour-tab-${cycled(TOUR, next).id}`)?.focus();
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
