'use client';

import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  Check,
  ChevronDown,
  Download,
  Gauge,
  HeartPulse,
  Lightbulb,
  ListChecks,
  LoaderCircle,
  Pencil,
  Plus,
  FolderOpen,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { BrandLogo } from '@/components/ui/brand-logo';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/card';
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownLabel,
  DropdownSeparator,
  DropdownTrigger,
} from '@/components/ui/dropdown';
import { IconChip } from '@/components/ui/icon-chip';
import { scoreTextClass } from '@/components/ui/score-band';
import { Skeleton } from '@/components/ui/skeleton';
import { projectsApi } from '@/lib/api/projects';
import { queryKeys } from '@/lib/api/query-keys';
import type { AIPresence, DashboardSection, DashboardSectionState, Project } from '@/lib/api/types';
import { useProjectContext } from '@/lib/project/project-context';
import { cn } from '@/lib/utils';

import { ICONS } from '@/lib/icons';
import { ActivationProgress } from './activation-progress';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function displayValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(1);
  if (typeof value === 'boolean') return value ? 'Configured' : 'Not configured';
  if (typeof value === 'string') return value;
  return 'Available';
}

function formatMomentum(value: number | null): string {
  if (value === null) return '—';
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(1)}`;
}

/** The first non-null metric, split into label + value for the stat layout. */
function primaryMetric(section: DashboardSection): { label: string; value: unknown } | null {
  const preferred: Partial<Record<DashboardSection['id'], { key: string; label: string }>> = {
    visibility: { key: 'visibility_score', label: 'visibility score' },
    prompts: { key: 'active', label: 'active prompts' },
    runs: { key: 'completed', label: 'answers completed' },
    site_health: { key: 'overall_score', label: 'site health score' },
    issues: { key: 'count', label: 'issues' },
    opportunities: { key: 'open', label: 'open' },
    brand_knowledge: { key: 'configured', label: 'profile' },
  };
  const metric = preferred[section.id];
  if (
    !metric ||
    section.metrics[metric.key] === null ||
    section.metrics[metric.key] === undefined
  ) {
    return null;
  }
  return { label: metric.label, value: section.metrics[metric.key] };
}

function hasDashboardSignal(section: DashboardSection) {
  return (
    section.state === 'ready' || section.state === 'running' || primaryMetric(section) !== null
  );
}

/** Every dashboard section owns a glyph; matched 1-to-1 with canonical sidebar nav icons. */
const SECTION_ICONS: Record<DashboardSection['id'], LucideIcon> = {
  visibility: ICONS.visibility,
  answers: ICONS.analytics,
  traffic: ICONS.traffic,
  prompts: ICONS.prompts,
  commerce: ICONS.products,
  runs: ICONS.runs,
  content: ICONS.content,
  site_health: ICONS.siteHealth,
  issues: ICONS.issues,
  opportunities: ICONS.opportunities,
  brand_knowledge: ICONS.knowledgeBase,
  projects: ICONS.setup,
};

/** State → badge tone. Colour carries meaning only (WCAG 1.4.1: the label always renders). */
const SECTION_STATE_BADGE: Record<
  DashboardSectionState,
  { variant: 'status'; value: 'success' | 'info' | 'warning' | 'danger' } | { variant: 'neutral' }
> = {
  ready: { variant: 'status', value: 'success' },
  running: { variant: 'status', value: 'info' },
  not_setup: { variant: 'status', value: 'warning' },
  failed: { variant: 'status', value: 'danger' },
  empty: { variant: 'neutral' },
};

const SECTION_STATE_LABEL: Record<DashboardSectionState, string> = {
  ready: 'Ready',
  running: 'In progress',
  not_setup: 'Needs setup',
  failed: 'Needs attention',
  empty: 'No results yet',
};

function SectionRow({ section }: Readonly<{ section: DashboardSection }>) {
  const Icon = SECTION_ICONS[section.id];
  const metric = primaryMetric(section);
  const badge = SECTION_STATE_BADGE[section.state];
  const stateLabel = SECTION_STATE_LABEL[section.state];
  return (
    <Link
      href={section.href}
      data-tour={`dashboard-${section.id}`}
      className="focus-ring hover:bg-background-alt group flex items-center justify-between gap-3 px-4 py-3 transition-colors"
      aria-label={`Open ${section.title}`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <IconChip className="size-8 shrink-0">
          <Icon className="size-4" />
        </IconChip>
        <span className="text-foreground truncate text-sm font-semibold">{section.title}</span>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {/* No plain-text state fallback: the badge below always renders the
            state, so a metric-less section showed it twice side by side. */}
        {metric ? (
          <div className="text-right">
            <span
              className={cn(
                'mono text-sm font-semibold',
                typeof metric.value === 'number' && metric.label.includes('score')
                  ? scoreTextClass(metric.value)
                  : 'text-foreground',
              )}
            >
              {displayValue(metric.value)}
            </span>
            <span className="text-muted ms-1.5 text-xs capitalize">{metric.label}</span>
          </div>
        ) : null}

        {badge.variant === 'status' ? (
          <Badge variant="status" value={badge.value} className="text-2xs px-2 py-0.5 capitalize">
            {stateLabel}
          </Badge>
        ) : (
          <Badge className="text-2xs px-2 py-0.5 capitalize">{stateLabel}</Badge>
        )}

        <ArrowRight
          aria-hidden
          className="text-muted group-hover:text-accent-text size-4 shrink-0 transition-[color,transform] duration-200 group-hover:translate-x-0.5"
        />
      </div>
    </Link>
  );
}

function MetricTile({
  label,
  value,
  icon: Icon,
  score = false,
}: Readonly<{ label: string; value: unknown; icon: LucideIcon; score?: boolean }>) {
  const numeric = typeof value === 'number' ? value : null;
  return (
    <Card>
      <CardContent className="grid gap-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-muted text-xs">{label}</p>
          <IconChip>
            <Icon className="size-6" />
          </IconChip>
        </div>
        <p
          className={cn(
            'mono text-2xl leading-none',
            score ? scoreTextClass(numeric) : numeric === null ? 'text-muted' : 'text-foreground',
          )}
        >
          {displayValue(value)}
        </p>
      </CardContent>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="grid gap-6" aria-hidden>
      <Skeleton className="h-8 w-64" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    </div>
  );
}

function AIPresenceCard({ presence }: Readonly<{ presence: AIPresence }>) {
  const current = presence.current;
  if (!current) return null;
  const labels: Record<string, string> = {
    brand_visibility: 'Brand visibility',
    brand_mention_rate: 'Brand mention rate',
    share_of_voice: 'Share of voice',
    owned_citation_rate: 'Owned citation rate',
    web_fundamentals: 'Web Fundamentals',
    product_presence: 'Product presence',
    opportunity_execution: 'Opportunity execution',
  };
  return (
    <Card aria-label="AI Presence Index">
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-muted text-xs">AI Presence Index</p>
            <p className={cn('mono mt-1 text-2xl', scoreTextClass(current.score))}>
              {displayValue(current.score)}
            </p>
            <p className="text-muted mt-1 text-xs">
              {current.provisional ? 'Still gathering results' : 'Based on your latest results'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-muted text-xs">Momentum (30 days)</p>
            <p className="mono text-foreground mt-1 text-lg">{formatMomentum(presence.momentum)}</p>
            <p className="text-muted mt-1 text-xs">
              {current.provisional ? 'More results will improve this view' : 'Ready to compare'}
            </p>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {Object.entries(current.components)
            .filter(([key]) => key in labels)
            .map(([key, component]) => (
              <div
                key={key}
                className="bg-background-alt flex items-center justify-between rounded-md px-3 py-2"
              >
                <span className="text-muted text-xs">{labels[key]}</span>
                <span className="mono text-foreground text-sm">
                  {component.available ? displayValue(component.score) : '—'}
                </span>
              </div>
            ))}
        </div>
      </CardContent>
    </Card>
  );
}

/** Active-project landing view backed exclusively by the persisted Dashboard projection. */
export function DashboardScreen({
  onEditProject,
  // The callback only ever receives `activeProject` straight from the project
  // context, so it carries the whole `Project`. Narrowing it to a structural
  // subset here dropped the fields the edit panel needs and made the caller's
  // `setEditing` unassignable.
}: Readonly<{ onEditProject?: (project: Project) => void }> = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    projects = [],
    activeProject,
    activeProjectId,
    setActiveProjectId,
    isLoading,
  } = useProjectContext();
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState(false);
  const dashboard = useQuery({
    queryKey: queryKeys.projects.dashboard(activeProject?.id ?? ''),
    queryFn: ({ signal }) => projectsApi.getDashboard(activeProject!.id, { signal }),
    enabled: Boolean(activeProject),
    refetchInterval: (query) =>
      query.state.data && query.state.data.active_work.length > 0 ? 2000 : false,
  });

  const downloadReport = async () => {
    if (!activeProject) return;
    setDownloadError(false);
    setDownloading(true);
    try {
      const blob = await projectsApi.downloadDashboardReport(activeProject.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `searchify-${activeProject.brand_name || activeProject.name}-report.pdf`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch {
      setDownloadError(true);
    } finally {
      setDownloading(false);
    }
  };

  if (isLoading) {
    return <DashboardSkeleton />;
  }
  if (!activeProject) {
    return (
      <Card>
        <CardContent className="grid gap-3">
          <CardTitle>Start with a project</CardTitle>
          <CardDescription>Create a brand to activate your Dashboard.</CardDescription>
          <Button asChild className="w-fit">
            <Link href="/onboarding?new=1">
              <Plus className="size-4" aria-hidden />
              Add project
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }
  if (dashboard.isLoading) return <DashboardSkeleton />;
  if (dashboard.isError || !dashboard.data) {
    return (
      <Alert tone="danger">
        Could not load the Dashboard.{' '}
        <Button variant="ghost" size="sm" onClick={() => dashboard.refetch()}>
          Try again
        </Button>
      </Alert>
    );
  }

  const { data } = dashboard;
  const visibility = data.analyze.find((section) => section.id === 'visibility');
  const analyzeSections = data.analyze.filter(
    (section) =>
      !(section.id === 'visibility' && section.state === 'empty') && hasDashboardSignal(section),
  );
  const improveSections = data.improve.filter(
    (section) => section.id !== 'projects' && hasDashboardSignal(section),
  );
  const generatedAt = new Date(data.generated_at);
  const requestedCrawlId =
    searchParams?.get('activation') === '1' ? searchParams.get('crawl') : null;
  const activationProjectId = searchParams?.get('project');
  const activationCrawlId =
    activationProjectId === activeProject.id &&
    requestedCrawlId &&
    UUID_PATTERN.test(requestedCrawlId)
      ? requestedCrawlId
      : null;
  const requestedPageLimit = Number(searchParams?.get('limit'));
  const activationPageLimit =
    Number.isSafeInteger(requestedPageLimit) && requestedPageLimit > 0 ? requestedPageLimit : null;
  const activeWorkLabels: Record<string, string> = {
    runs: 'measuring brand visibility',
    site_health: 'reviewing your website',
    content: 'preparing content guidance',
  };
  const activeWork = data.active_work
    .map((item) => activeWorkLabels[item])
    .filter((item): item is string => Boolean(item));
  return (
    <div className="grid gap-6" data-tour="dashboard-overview">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <BrandLogo
            name={data.project.brand_name || data.project.name}
            websiteUrl={data.project.website_url}
            size="md"
          />
          <div>
            <h2 className="text-foreground text-xl">
              {data.project.brand_name || data.project.name}
            </h2>
            <p className="text-muted mt-1 text-sm">
              A live summary of your Searchify results · Updated{' '}
              {generatedAt.toLocaleString('en-US', {
                dateStyle: 'medium',
                timeStyle: 'short',
                timeZone: 'UTC',
              })}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Dropdown>
            <DropdownTrigger asChild>
              <Button variant="secondary" size="sm">
                <FolderOpen className="size-4" aria-hidden />
                Manage projects
                <ChevronDown className="size-4" aria-hidden />
              </Button>
            </DropdownTrigger>
            <DropdownContent align="end" className="w-56">
              <DropdownLabel>Workspace Brands</DropdownLabel>
              {(projects ?? []).map((project) => {
                const selected = project.id === activeProjectId;
                const label = project.brand_name || project.name;
                return (
                  <DropdownItem
                    key={project.id}
                    onSelect={() => setActiveProjectId(project.id)}
                    className={selected ? 'text-accent-text font-medium' : undefined}
                  >
                    <BrandLogo
                      name={label}
                      logoUrl={project.brand?.logo_url}
                      websiteUrl={project.website_url}
                      size="sm"
                    />
                    <span className="min-w-0 flex-1 truncate">{label}</span>
                    {selected ? (
                      <Check className="text-accent size-4 shrink-0" aria-hidden />
                    ) : null}
                  </DropdownItem>
                );
              })}
              <DropdownSeparator className="bg-border-subtle my-1 h-px" />
              {onEditProject && activeProject ? (
                <DropdownItem onSelect={() => onEditProject(activeProject)}>
                  <Pencil className="size-4 shrink-0" aria-hidden />
                  <span>Edit active brand</span>
                </DropdownItem>
              ) : null}
              <DropdownItem onSelect={() => router.push('/onboarding?new=1')}>
                <Plus className="size-4 shrink-0" aria-hidden />
                <span>Add new project</span>
              </DropdownItem>
            </DropdownContent>
          </Dropdown>

          <Button
            variant="secondary"
            size="sm"
            onClick={downloadReport}
            disabled={downloading}
            data-tour="dashboard-report"
          >
            {downloading ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
            ) : (
              <Download className="size-4" aria-hidden />
            )}
            {downloading ? 'Preparing…' : 'Download report'}
          </Button>
        </div>
      </div>

      {downloadError ? (
        <Alert tone="danger">Could not download the report. Please try again.</Alert>
      ) : null}

      {activationCrawlId ? (
        <ActivationProgress
          projectId={activeProject.id}
          crawlId={activationCrawlId}
          pageLimit={activationPageLimit}
        />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricTile
          label="Visibility score"
          value={data.executive_metrics.visibility_score}
          icon={Gauge}
          score
        />
        <MetricTile
          label="Site health"
          value={data.executive_metrics.site_health_score}
          icon={HeartPulse}
          score
        />
        <MetricTile
          label="Open opportunities"
          value={data.executive_metrics.open_opportunities}
          icon={Lightbulb}
        />
        <MetricTile
          label="Active prompts"
          value={data.executive_metrics.active_prompts}
          icon={ListChecks}
        />
      </div>

      {data.ai_presence ? <AIPresenceCard presence={data.ai_presence} /> : null}

      {visibility?.state === 'empty' ? (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-4">
            <div className="grid gap-1">
              <h2 className="text-foreground text-heading-sm">Start measuring visibility</h2>
              <p className="text-secondary text-sm">
                Connect an answer-engine provider, then launch your first audit to populate this
                dashboard.
              </p>
            </div>
            <Button asChild variant="secondary" className="shrink-0">
              <Link href="/settings?tab=providers">
                Connect providers
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {activeWork.length > 0 && !activationCrawlId ? (
        <Alert tone="info">We&apos;re currently {activeWork.join(' and ')}.</Alert>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-2">
        {analyzeSections.length > 0 ? (
          <section aria-labelledby="dashboard-analyze" className="flex flex-col gap-2">
            <h2 id="dashboard-analyze" className="text-foreground text-heading-sm">
              Analyze
            </h2>
            <Card className="overflow-hidden">
              <div className="divide-border grid content-start divide-y">
                {analyzeSections.map((section) => (
                  <SectionRow key={section.id} section={section} />
                ))}
              </div>
            </Card>
          </section>
        ) : null}

        {improveSections.length > 0 ? (
          <section aria-labelledby="dashboard-improve" className="flex flex-col gap-2">
            <h2 id="dashboard-improve" className="text-foreground text-heading-sm">
              Improve
            </h2>
            <Card className="overflow-hidden">
              <div className="divide-border grid content-start divide-y">
                {improveSections.map((section) => (
                  <SectionRow key={section.id} section={section} />
                ))}
              </div>
            </Card>
          </section>
        ) : null}
      </div>
    </div>
  );
}
