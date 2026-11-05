import { ChevronDown, ChevronsUpDown, CircleHelp, Download, Rocket, Search } from 'lucide-react';

import { BrandMark } from '@/components/ui/brand-mark';
import { ChartCard } from '@/components/ui/chart';
import { Kbd } from '@/components/ui/kbd';
import { KpiRow } from '@/components/ui/stat-row';
import { TrendChart } from '@/components/ui/trend-chart';
import { textRole } from '@/components/ui/typography';
import { ICONS } from '@/lib/icons';
import { cn } from '@/lib/utils';

import { BRANDS, KPIS, TREND, WEEKS } from './demo-data';
import {
  ScreenButton,
  ScreenCols,
  ScreenDelta,
  ScreenSite,
  ScreenTable,
  ScreenTableCard,
  ScreenTabs,
  type ScreenColumn,
} from './screen-parts';

/**
 * The app's Dashboard navigation as the sidebar shows it
 * (components/layout/nav-items.ts): the same groups, labels and icons in the
 * same order, drawn because the live rows fold to a rail below 1280px.
 */
const NAV = [
  { title: null, items: [['Overview', ICONS.overview]] },
  {
    title: 'Analyze',
    items: [
      ['Website', ICONS.site],
      ['Search Demand', ICONS.demand],
      ['Issues', ICONS.issues],
      ['Keyword Research', ICONS.searchIntelligence],
      ['Performance', ICONS.performance],
      ['Commerce Suite', ICONS.products],
    ],
  },
  { title: 'Act', items: [['Actions', ICONS.opportunities]] },
  {
    title: 'Track',
    items: [
      ['Prompts', ICONS.prompts],
      ['AI Visibility', ICONS.visibility],
      ['Runs', ICONS.runs],
      ['AI Traffic', ICONS.aiTraffic],
    ],
  },
] as const;

type NavLabel = (typeof NAV)[number]['items'][number][0];

/** Open Actions in the Actions row's count slot. */
const OPEN_ACTIONS = 7;

function ScreenSidebar({ active }: Readonly<{ active: NavLabel }>) {
  return (
    <div className="cl-app-side">
      <div className="cl-app-topbar">
        <span className="cl-app-ident">
          <BrandMark name="Acme Analytics" placement="inline" />
          <span className="cl-app-ident-text">
            <span className="type-control">Acme Analytics</span>
            <span className="type-caption">acme.example</span>
          </span>
          <ChevronsUpDown className="text-ink-muted size-4" aria-hidden />
        </span>
      </div>
      <div className="cl-app-side-controls">
        <span className="cl-app-mode">
          <ScreenTabs items={[{ label: 'Dashboard' }, { label: 'Agent' }]} selected="Dashboard" />
        </span>
        <span className="cl-app-palette">
          <Search className="text-ink-muted size-4" aria-hidden />
          <span>Search or jump to…</span>
          <Kbd>Ctrl K</Kbd>
        </span>
      </div>
      <div className="cl-app-nav">
        {NAV.map((group) => (
          <div key={group.title ?? 'overview'} className="cl-app-nav-group">
            {group.title && <p className="type-caption cl-app-nav-title">{group.title}</p>}
            {group.items.map(([label, Icon]) => (
              <span
                key={label}
                className={cn('type-control cl-app-nav-row', label === active && 'is-active')}
              >
                <Icon className="cl-app-nav-icon size-4" aria-hidden />
                <span className="cl-app-nav-label">{label}</span>
                {label === 'Actions' && <span className="cl-app-nav-count">{OPEN_ACTIONS}</span>}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

const percent = (value: number) => `${value.toFixed(1)}%`;

const BRAND_COLUMNS: readonly ScreenColumn<(typeof BRANDS)[number]>[] = [
  { header: 'Brand', cell: (brand) => <ScreenSite label={brand.name} /> },
  { header: 'Visibility', width: 'sm', numeric: true, cell: (brand) => percent(brand.visibility) },
  {
    header: 'Change',
    width: 'md',
    numeric: true,
    cell: (brand) => <ScreenDelta change={brand.change} />,
  },
];

const FILTERS = ['Latest run', 'Last 90 days', 'Weekly', 'All engines'] as const;

/**
 * The home page's first product view (D25): the AI Visibility page inside
 * the app's own chrome, as the shipped app draws it. The sidebar holds the
 * project switcher in the top bar's cell, Dashboard | Agent, the palette
 * field and the navigation; the page has its 24px title and actions on the
 * same ruled bar, the tabs and filter bands, the KPI row and the trend chart
 * beside the brand table. Every figure comes from the demo dataset.
 */
export function ScreenAppVisibility() {
  return (
    <div className="cl-screen cl-screen--app">
      <ScreenSidebar active="AI Visibility" />
      <div className="cl-app-main">
        <div className="cl-app-topbar cl-app-header">
          <p className={textRole('pageTitle')}>AI Visibility</p>
          <span className="cl-app-actions">
            <ScreenButton variant="primary" icon={Rocket}>
              Launch audit
            </ScreenButton>
            <ScreenButton icon={CircleHelp} label="About these metrics" />
            <ScreenButton icon={Download}>Export</ScreenButton>
          </span>
        </div>
        <div className="cl-app-bands">
          <ScreenTabs
            items={[
              { label: 'Trends' },
              { label: 'Sources', count: 186 },
              { label: 'Perception' },
              { label: 'Ads' },
              { label: 'Query fanouts' },
            ]}
            selected="Trends"
          />
          <span className="cl-app-filters">
            {FILTERS.map((filter) => (
              <span key={filter} className="cl-app-filter">
                <ScreenButton>
                  {filter}
                  <ChevronDown className="text-ink-muted size-4" aria-hidden />
                </ScreenButton>
              </span>
            ))}
          </span>
        </div>
        <div className="cl-app-content">
          <KpiRow
            segments={KPIS.map((kpi) => ({
              key: kpi.label,
              label: kpi.label,
              value: `${kpi.value}${kpi.unit ?? ''}`,
              delta: <ScreenDelta change={kpi.change} period="vs last week" />,
            }))}
          />
          <ScreenCols layout="main-aside">
            <ChartCard
              title="Visibility over time"
              footnote="412 answers to 120 prompts across 4 engines, week of 27 Oct – 2 Nov 2026"
            >
              <TrendChart
                label="Visibility by week, Acme Analytics against Northwind and Lumen"
                name="Acme Analytics"
                data={WEEKS.map((week, index) => ({
                  label: week,
                  value: TREND.acme[index] ?? null,
                }))}
                series={[
                  { label: 'Northwind', values: TREND.northwind },
                  { label: 'Lumen', values: TREND.lumen },
                ]}
                height={240}
                yMin={0}
                yMax={50}
                yFormat={(value) => `${value}%`}
                format={percent}
              />
            </ChartCard>
            <ScreenTableCard title="Brands" meta="Visibility by brand this week">
              <ScreenTable
                caption="Visibility by brand this week"
                rows={BRANDS}
                rowKey={(brand) => brand.name}
                own={(brand) => brand.own === true}
                columns={BRAND_COLUMNS}
              />
            </ScreenTableCard>
          </ScreenCols>
        </div>
      </div>
    </div>
  );
}
