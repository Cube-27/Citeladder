import type { ReactNode } from 'react';

import { BrandMark } from '@/components/ui/brand-mark';
import { Kbd } from '@/components/ui/kbd';
import { textRole } from '@/components/ui/typography';
import {
  ChevronDown,
  ChevronsUpDown,
  CircleHelp,
  ICONS,
  Receipt,
  RefreshCw,
  Rocket,
  Search,
  type IconGlyph,
} from '@/lib/icons';
import { cn } from '@/lib/utils';

import { ScreenButton, ScreenTabs } from './screen-parts';
import './screen-vignette.css';
import './screen-app.css';

type PageActions = 'launch' | 'crawl' | 'analysis';

export type AppPageHead = Readonly<{
  title: string;
  active?: NavLabel;
  tabs?: Readonly<{ items: readonly string[]; selected: string }>;
  actions?: PageActions;
}>;

const NAV = [
  {
    title: 'Home',
    items: [
      ['Overview', ICONS.overview],
      ['Actions', ICONS.opportunities],
    ],
  },
  {
    title: 'Brand',
    items: [
      ['Insights', ICONS.insights],
      ['Perception', ICONS.perception],
      ['Competitors', ICONS.competitors],
    ],
  },
  {
    title: 'Tracking',
    items: [
      ['Prompts', ICONS.prompts],
      ['Sources', ICONS.visibility],
      ['Runs', ICONS.runs],
    ],
  },
  {
    title: 'Website',
    items: [
      ['Site health', ICONS.site],
      ['Issues', ICONS.issues],
      ['AI traffic', ICONS.aiTraffic],
    ],
  },
  {
    title: 'Search',
    items: [
      ['Performance', ICONS.performance],
      ['Keyword research', ICONS.searchIntelligence],
    ],
  },
  {
    title: 'Commerce',
    items: [
      ['Shopping', ICONS.reports],
      ['Products', ICONS.products],
    ],
  },
] as const;

const AGENT_NAV = [
  {
    title: null,
    items: [
      ['New chat', ICONS.newChat],
      ['Skills', ICONS.skills],
      ['Context', ICONS.context],
    ],
  },
  {
    title: 'Chats',
    items: [
      ['Why did Acme drop on Gemini?', null],
      ['Draft a session replay pricing page', null],
      ['Which sources cite Northwind?', null],
    ],
  },
] as const;

const FOOT = ['Integrations', ICONS.setup] as const;

export type NavLabel = (typeof NAV)[number]['items'][number][0];

const OPEN_COUNTS: Readonly<Partial<Record<string, number>>> = { Actions: 7 };

type NavGroup = Readonly<{
  title: string | null;
  items: readonly (readonly [string, IconGlyph | null])[];
}>;

function NavRow({
  label,
  icon: Icon,
  active,
}: Readonly<{ label: string; icon: IconGlyph | null; active: boolean }>) {
  const count = OPEN_COUNTS[label];
  return (
    <span className={cn('type-control cl-app-nav-row', active && 'is-active')}>
      {Icon && <Icon className="cl-app-nav-icon size-3.5" aria-hidden />}
      <span className="cl-app-nav-label">{label}</span>
      {count !== undefined && <span className="cl-app-nav-count">{count}</span>}
    </span>
  );
}

function ScreenSidebar({
  active,
  mode = 'Dashboard',
}: Readonly<{ active?: NavLabel; mode?: 'Dashboard' | 'Agent' }>) {
  const groups: readonly NavGroup[] = mode === 'Agent' ? AGENT_NAV : NAV;
  return (
    <div className="cl-app-side">
      <div className="cl-app-topbar">
        <span className="cl-app-ident">
          <BrandMark name="Acme Analytics" placement="inline" />
          <span className="cl-app-ident-text">
            <span className="type-control">Acme Analytics</span>
          </span>
          <ChevronsUpDown className="text-ink-2 size-3.5" aria-hidden />
        </span>
      </div>
      <div className="cl-app-side-controls">
        <span className="cl-app-mode">
          <ScreenTabs items={[{ label: 'Dashboard' }, { label: 'Agent' }]} selected={mode} />
        </span>
      </div>
      <div className="cl-app-nav">
        {groups.map((group) => (
          <div key={group.title ?? 'top'} className="cl-app-nav-group">
            {group.title && <p className="type-caption cl-app-nav-title">{group.title}</p>}
            {group.items.map(([label, icon]) => (
              <NavRow key={label} label={label} icon={icon} active={label === active} />
            ))}
          </div>
        ))}
      </div>
      <div className="cl-app-nav-foot">
        <NavRow label={FOOT[0]} icon={FOOT[1]} active={false} />
      </div>
    </div>
  );
}

export function ScreenAppPage({
  title,
  active,
  mode,
  tabs,
  actions,
  children,
}: Readonly<
  AppPageHead & {
    mode?: 'Dashboard' | 'Agent';
    children: ReactNode;
  }
>) {
  return (
    <div className="cl-screen cl-screen--app">
      <ScreenSidebar active={active} mode={mode} />
      <div className="cl-app-main">
        <ScreenPageHeader title={title} actions={actions} mode={mode} />
        {tabs && (
          <div className="cl-app-bands">
            <ScreenTabs items={tabs.items.map((label) => ({ label }))} selected={tabs.selected} />
          </div>
        )}
        <div className="cl-app-content cl-app-page">{children}</div>
      </div>
    </div>
  );
}

function ScreenMenuButton({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <ScreenButton>
      {children}
      <ChevronDown className="text-ink-2 size-3.5" aria-hidden />
    </ScreenButton>
  );
}

function HeaderActions({ actions }: Readonly<{ actions: PageActions }>) {
  switch (actions) {
    case 'launch':
      return (
        <>
          <ScreenButton icon={CircleHelp} label="About these metrics" />
          <ScreenButton variant="primary" icon={Rocket}>
            Launch run
          </ScreenButton>
        </>
      );
    case 'crawl':
      return (
        <>
          <ScreenMenuButton>Schedule: Weekly</ScreenMenuButton>
          <span className="cl-app-split">
            <ScreenButton>Run new crawl</ScreenButton>
            <ScreenButton icon={ChevronDown} label="More crawl options" />
          </span>
        </>
      );
    case 'analysis':
      return (
        <>
          <ScreenButton variant="quiet" icon={Receipt}>
            Cost details
          </ScreenButton>
          <ScreenButton icon={RefreshCw}>Refresh</ScreenButton>
          <ScreenButton variant="primary">New analysis</ScreenButton>
        </>
      );
    default: {
      const unhandled: never = actions;
      return unhandled;
    }
  }
}

function ScreenPageHeader({
  title,
  actions,
  mode = 'Dashboard',
}: Readonly<{ title: string; actions?: PageActions; mode?: 'Dashboard' | 'Agent' }>) {
  return (
    <div className="cl-app-topbar cl-app-header">
      <p className={textRole('pageTitle')}>{title}</p>
      <span className="cl-app-actions">
        {actions && <HeaderActions actions={actions} />}
        <ScreenButton icon={Search}>
          Search
          <Kbd>Ctrl K</Kbd>
        </ScreenButton>
        {mode === 'Dashboard' && <ScreenButton icon={ICONS.agent}>Ask agent</ScreenButton>}
      </span>
    </div>
  );
}
