import type { ReactNode } from 'react';
import {
  ArrowUpRight,
  ChevronDown,
  ChevronsUpDown,
  CircleHelp,
  Download,
  Rocket,
  Search,
  SquarePen,
  type LucideIcon,
} from 'lucide-react';

import { LogoMark } from '@/components/ui/logo-mark';
import { ICONS } from '@/lib/icons';
import { cn } from '@/lib/utils';

/** Shared chrome for the coded product views: marks, pills, panel heads and frames. */

export function Favicon({ letter, tone = 'neutral' }: Readonly<{ letter: string; tone?: string }>) {
  return (
    <span className="pv-favicon" data-tone={tone} aria-hidden>
      {letter}
    </span>
  );
}

export function Pill({
  children,
  tone = 'neutral',
}: Readonly<{ children: ReactNode; tone?: string }>) {
  return (
    <span className="pv-pill" data-tone={tone}>
      {children}
    </span>
  );
}

export function PanelHead({ title, meta }: Readonly<{ title: string; meta?: ReactNode }>) {
  return (
    <div className="pv-panel-head">
      <span className="pv-panel-title">{title}</span>
      {meta && <span className="pv-meta">{meta}</span>}
    </div>
  );
}

/* The app's dashboard navigation (components/layout/nav-items.ts), drawn
   statically: the same groups, labels and icons in the same order. */
const DASHBOARD_NAV = [
  { title: null, items: [['Overview', ICONS.overview]] },
  {
    title: 'Analyze',
    items: [
      ['Website', ICONS.site],
      ['Search Demand', ICONS.demand],
      ['Issues', ICONS.issues],
      ['Search Intelligence', ICONS.analytics],
      ['Performance', ICONS.performance],
      ['Commerce Suite', ICONS.products],
    ],
  },
  {
    title: 'Track',
    items: [
      ['Prompts', ICONS.prompts],
      ['AI Visibility', ICONS.visibility],
      ['Runs', ICONS.runs],
      ['AI Traffic', ICONS.analytics],
    ],
  },
] as const;

/* Agent mode: New chat and the fixed destinations above the chat list. */
const AGENT_NAV = [
  ['New chat', SquarePen],
  ['Actions', ICONS.opportunities],
  ['Skills', ICONS.skills],
  ['Context', ICONS.context],
] as const;

const AGENT_CHATS = [
  'Technical fix brief for /platform',
  'Why Brelovanta wins comparisons',
  'Q4 content plan from citations',
] as const;

function NavRow({
  label,
  Icon,
  active,
}: Readonly<{ label: string; Icon: LucideIcon; active: boolean }>) {
  return (
    <span className="pv-nav" data-active={active || undefined}>
      <Icon className="size-3.5" />
      {label}
    </span>
  );
}

function ShellSidebar({
  mode,
  active,
}: Readonly<{ mode: 'dashboard' | 'agent'; active?: string }>) {
  return (
    <aside className="pv-sidebar" aria-hidden>
      <span className="pv-workspace">
        <Favicon letter="Z" tone="owned" />
        <span className="pv-workspace-name">Zernovelle</span>
        <ChevronsUpDown className="text-muted size-3.5" />
      </span>
      <span className="pv-search">
        <Search className="size-3.5" />
        <span className="pv-search-text">Search or jump to…</span>
        <kbd>Ctrl K</kbd>
      </span>
      <span className="pv-mode">
        <span data-active={mode === 'dashboard' || undefined}>Dashboard</span>
        <span data-active={mode === 'agent' || undefined}>Agent</span>
      </span>
      {mode === 'dashboard' ? (
        DASHBOARD_NAV.map((group) => (
          <span key={group.title ?? 'overview'} className="pv-nav-group">
            {group.title && <span className="pv-nav-title">{group.title}</span>}
            {group.items.map(([label, Icon]) => (
              <NavRow key={label} label={label} Icon={Icon} active={label === active} />
            ))}
          </span>
        ))
      ) : (
        <>
          <span className="pv-nav-group">
            {AGENT_NAV.map(([label, Icon]) => (
              <NavRow key={label} label={label} Icon={Icon} active={label === active} />
            ))}
          </span>
          <span className="pv-nav-group">
            <span className="pv-nav-title">Chats</span>
            {AGENT_CHATS.map((chat) => (
              <span
                key={chat}
                className="pv-nav pv-chat-row"
                data-active={chat === active || undefined}
              >
                {chat}
              </span>
            ))}
          </span>
        </>
      )}
      <span className="pv-sidebar-foot">
        <LogoMark size={18} />
      </span>
    </aside>
  );
}

/** One filter bar: groups of chips, separated by a hairline as in the app. */
export type ShellFilters = readonly (readonly string[])[];

/**
 * The product's own chrome: the app sidebar on the neutral ground, and the
 * page on a floating white sheet with its title, actions, tabs and filters.
 */
export function AppShellFrame({
  mode = 'dashboard',
  active,
  title,
  action,
  tabs,
  activeTab,
  filters,
  children,
}: Readonly<{
  mode?: 'dashboard' | 'agent';
  active?: string;
  title: string;
  action?: string;
  tabs?: readonly string[];
  activeTab?: string;
  filters?: ShellFilters;
  children: ReactNode;
}>) {
  return (
    <div className="product-frame pv-shell app-type-scale">
      <ShellSidebar mode={mode} active={active} />
      <div className="pv-sheet">
        <div className="pv-sheet-head">
          <p className="pv-main-title">{title}</p>
          <span className="pv-head-actions" aria-hidden>
            {action && (
              <span className="pv-button pv-button-auto">
                <Rocket className="size-3.5" />
                {action}
              </span>
            )}
            <span className="pv-icon-button">
              <CircleHelp className="size-3.5" />
            </span>
            {action && (
              <span className="pv-button pv-button-quiet">
                <Download className="size-3.5" />
                Export
              </span>
            )}
            <span className="pv-avatar">ZN</span>
          </span>
        </div>
        {tabs && (
          <div className="pv-tabs" aria-hidden>
            {tabs.map((tab) => (
              <span key={tab} data-active={tab === activeTab || undefined}>
                {tab}
              </span>
            ))}
          </div>
        )}
        {filters && (
          <div className="pv-filters" aria-hidden>
            {filters.map((group) => (
              <span key={group.join()} className="pv-filter-group">
                {group.map((filter) => (
                  <span key={filter} className="pv-filter">
                    {filter}
                    <ChevronDown className="size-3" />
                  </span>
                ))}
              </span>
            ))}
          </div>
        )}
        <div className="pv-main">{children}</div>
      </div>
    </div>
  );
}

/** A single product view in a titled window, on the public stage. */

export function ProductShot({
  title,
  children,
  caption = 'Illustrative example with synthetic data.',
  className,
}: Readonly<{ title: string; children: ReactNode; caption?: string; className?: string }>) {
  return (
    <figure className={cn('min-w-0', className)}>
      <div className="product-stage product-fit p-4 sm:p-8 lg:p-10">
        <div className="product-frame app-type-scale">
          <div className="product-frame-bar">
            <span className="inline-flex items-center gap-2">
              <span className="pv-window-dots" aria-hidden>
                <i />
                <i />
                <i />
              </span>
              {title}
            </span>
            <ArrowUpRight className="size-3.5 opacity-50" aria-hidden />
          </div>
          <div className="p-5">{children}</div>
        </div>
      </div>
      <figcaption className="product-caption mt-3">{caption}</figcaption>
    </figure>
  );
}
