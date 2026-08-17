'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { TopInsights } from '@/components/intelligence/top-insights';
import { BrandProfilePanel } from '@/components/knowledge-base/brand-profile-panel';
import { CompetitorSuggestions } from '@/components/visibility/prompt-insights';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Check,
  ChevronDown,
  Download,
  ExternalLink,
  GripVertical,
  LoaderCircle,
  Pencil,
  Plus,
  BookOpen,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { BrandLogo } from '@/components/ui/brand-logo';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/drawer';
import { eyebrowClasses } from '@/components/ui/eyebrow';
import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownLabel,
  DropdownSeparator,
  DropdownTrigger,
} from '@/components/ui/dropdown';
import { Skeleton } from '@/components/ui/skeleton';
import { SectionTitle } from '@/components/ui/typography';
import { opportunitiesApi } from '@/lib/api/opportunities';
import { projectsApi } from '@/lib/api/projects';
import { queryKeys } from '@/lib/api/query-keys';
import { visibilityApi } from '@/lib/api/visibility';
import { formatUtcTimestamp } from '@/lib/format';
import type { CommandCenter, Opportunity, Project } from '@/lib/api/types';
import { useProjectContext } from '@/lib/project/project-context';
import { cn } from '@/lib/utils';

function metricValue(value: number | null, suffix = '') {
  return value === null ? '—' : `${Number.isInteger(value) ? value : value.toFixed(1)}${suffix}`;
}

function deltaLabel(delta: number | null, inverse = false) {
  if (delta === null) return 'No comparable run';
  const display = inverse ? -delta : delta;
  return `${display > 0 ? '+' : ''}${display.toFixed(1)} vs previous`;
}

function CommandCenterSkeleton() {
  return (
    <div className="grid gap-4" aria-hidden>
      <Skeleton className="h-16 w-full" />
      <div className="grid gap-3 md:grid-cols-3">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
      <Skeleton className="h-52 w-full" />
      <Skeleton className="h-72 w-full" />
    </div>
  );
}

function StateMetric({
  label,
  value,
  delta,
  suffix,
  inverse,
}: Readonly<{
  label: string;
  value: number | null;
  delta: number | null;
  suffix?: string;
  inverse?: boolean;
}>) {
  const positive = delta !== null && (inverse ? delta < 0 : delta > 0);
  return (
    <div className="flex min-h-[112px] flex-col justify-between p-5">
      <p className={eyebrowClasses}>{label}</p>
      <div className="my-2">
        <p className="font-display text-foreground text-3xl leading-none font-semibold tracking-[-0.03em] tabular-nums">
          {metricValue(value, suffix)}
        </p>
      </div>
      <p
        className={cn(
          'text-xs font-medium tabular-nums',
          delta === null ? 'text-muted' : positive ? 'text-success' : 'text-danger',
        )}
      >
        {deltaLabel(delta, inverse)}
      </p>
    </div>
  );
}

function MovementChart({ movements }: Readonly<{ movements: CommandCenter['movements'] }>) {
  if (movements.length === 0) {
    return (
      <div className="border-border-subtle bg-background-alt grid min-h-36 place-items-center rounded-lg border border-dashed p-5 text-center">
        <p className="text-muted max-w-md text-xs">
          Movement appears after a run with the same prompts, engines, and measurement mode.
        </p>
      </div>
    );
  }
  const values = movements.flatMap((row) => [row.current ?? 0, row.previous ?? 0]);
  const ceiling = Math.max(...values, 1);
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {movements.map((row) => (
        <div
          key={row.label}
          className="bg-background-alt border-border-subtle rounded-lg border p-3.5 shadow-xs"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-foreground text-xs font-semibold capitalize">{row.label}</span>
            <span
              className={cn(
                'font-display text-xs font-semibold tabular-nums',
                row.direction === 'positive' ? 'text-success' : 'text-danger',
              )}
            >
              {row.delta !== null && row.delta > 0 ? '+' : ''}
              {row.delta ?? '—'}
            </span>
          </div>
          <div className="mt-3.5 flex h-14 items-end justify-center gap-2.5" aria-hidden>
            <span
              className="bg-border-strong w-6 rounded-t transition-all"
              style={{ height: `${Math.max(6, ((row.previous ?? 0) / ceiling) * 56)}px` }}
            />
            <span
              className="bg-accent w-6 rounded-t shadow-xs transition-all"
              style={{ height: `${Math.max(6, ((row.current ?? 0) / ceiling) * 56)}px` }}
            />
          </div>
          <p className="text-2xs text-muted mt-2.5 text-center font-sans font-medium">
            Previous · Current
          </p>
        </div>
      ))}
    </div>
  );
}

function ActionRow({
  action,
  index,
  total,
  onMove,
  onDrop,
  reorderPending,
}: Readonly<{
  action: Opportunity;
  index: number;
  total: number;
  onMove: (from: number, to: number) => void;
  onDrop: (from: number, to: number) => void;
  reorderPending: boolean;
}>) {
  const [dragging, setDragging] = useState(false);
  return (
    <li
      draggable={!reorderPending}
      onDragStart={(event) => {
        event.dataTransfer.setData('text/plain', String(index));
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        if (!reorderPending) onDrop(Number(event.dataTransfer.getData('text/plain')), index);
      }}
      className={cn(
        'border-border-subtle hover:bg-background-alt/60 grid gap-3 border-b px-4 py-3.5 transition-colors last:border-b-0 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center',
        dragging && 'opacity-60',
      )}
    >
      <div className="flex items-center gap-2">
        <GripVertical className="text-muted hover:text-foreground size-4 cursor-grab" aria-hidden />
        <span className="text-muted w-5 text-center font-mono text-xs font-semibold tabular-nums">
          {index + 1}
        </span>
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/opportunities?selected=${action.id}`}
            className="text-foreground hover:text-accent-text text-sm font-semibold transition-colors"
          >
            {action.title}
          </Link>
          {action.severity === 'critical' ? (
            <Badge variant="status" value="danger">
              {action.severity}
            </Badge>
          ) : (
            <Badge>{action.severity}</Badge>
          )}
        </div>
        <p className="text-muted mt-1 truncate text-xs">
          {action.target_label ?? 'Project-wide'} · {action.evidence_summary.count} persisted
          evidence item(s)
        </p>
      </div>
      <div className="flex items-center justify-end gap-1.5">
        <span className="text-muted font-display me-2 text-xs font-semibold tabular-nums">
          {action.priority_score.toFixed(1)}
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onMove(index, index - 1)}
          disabled={reorderPending || index === 0}
          aria-label={`Move ${action.title} up`}
        >
          <ArrowUp className="size-4" aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onMove(index, index + 1)}
          disabled={reorderPending || index === total - 1}
          aria-label={`Move ${action.title} down`}
        >
          <ArrowDown className="size-4" aria-hidden />
        </Button>
      </div>
    </li>
  );
}

function ProjectControls({
  projects,
  activeProject,
  activeProjectId,
  setActiveProjectId,
  onEditProject,
}: Readonly<{
  projects: Project[];
  activeProject: Project;
  activeProjectId?: string | null;
  setActiveProjectId: (projectId: string) => void;
  onEditProject?: (project: Project) => void;
}>) {
  const router = useRouter();
  return (
    <Dropdown>
      <DropdownTrigger asChild>
        <Button variant="secondary" size="sm" className="gap-1.5 shadow-xs">
          Manage project <ChevronDown className="size-3.5 opacity-80" aria-hidden />
        </Button>
      </DropdownTrigger>
      <DropdownContent align="end" className="w-56">
        <DropdownLabel>Workspace brands</DropdownLabel>
        {projects.map((project) => (
          <DropdownItem key={project.id} onSelect={() => setActiveProjectId(project.id)}>
            <BrandLogo
              name={project.brand_name || project.name}
              logoUrl={project.brand?.logo_url}
              websiteUrl={project.website_url}
              size="sm"
            />
            <span className="min-w-0 flex-1 truncate font-medium">
              {project.brand_name || project.name}
            </span>
            {project.id === activeProjectId ? (
              <Check className="text-accent size-4" aria-hidden />
            ) : null}
          </DropdownItem>
        ))}
        <DropdownSeparator />
        {onEditProject ? (
          <DropdownItem onSelect={() => onEditProject(activeProject)}>
            <Pencil className="size-4" aria-hidden /> Edit active project
          </DropdownItem>
        ) : null}
        <DropdownItem onSelect={() => router.push('/onboarding?new=1')}>
          <Plus className="size-4" aria-hidden /> Add project
        </DropdownItem>
      </DropdownContent>
    </Dropdown>
  );
}

function FactsDrawer({ projectId }: Readonly<{ projectId: string }>) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const profile = useQuery({
    queryKey: queryKeys.projects.brandProfile(projectId),
    queryFn: ({ signal }) => projectsApi.getBrandProfile(projectId, { signal }),
    enabled: open,
  });
  const suggestions = useQuery({
    queryKey: queryKeys.visibility.competitorSuggestions(projectId),
    queryFn: ({ signal }) => visibilityApi.listCompetitorSuggestions(projectId, { signal }),
    enabled: open,
  });
  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-1.5 shadow-xs"
      >
        <BookOpen className="size-4" aria-hidden /> Edit facts
      </Button>
      <Drawer
        open={open}
        onOpenChange={setOpen}
        title="Company facts"
        description="Review the canonical facts and competitors used across CiteLadder."
        closeLabel="Close company facts"
      >
        <div className="flex flex-col gap-5 p-5">
          {profile.isError ? <Alert tone="danger">Company facts could not be loaded.</Alert> : null}
          {profile.data ? (
            <BrandProfilePanel
              projectId={projectId}
              profile={profile.data}
              onSaved={() =>
                void queryClient.invalidateQueries({
                  queryKey: queryKeys.projects.commandCenter(projectId),
                })
              }
            />
          ) : null}
          <CompetitorSuggestions projectId={projectId} suggestionsQuery={suggestions} />
        </div>
      </Drawer>
    </>
  );
}

function CommandCenterContent({
  data,
  projects,
  activeProject,
  activeProjectId,
  setActiveProjectId,
  onEditProject,
}: Readonly<{
  data: CommandCenter;
  projects: Project[];
  activeProject: Project;
  activeProjectId?: string | null;
  setActiveProjectId: (projectId: string) => void;
  onEditProject?: (project: Project) => void;
}>) {
  const queryClient = useQueryClient();
  const [downloadError, setDownloadError] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [actions, setActions] = useState(data.actions);
  const [reorderError, setReorderError] = useState(false);
  const orderVersion = useRef(data.action_order_version);
  const reorderPending = useRef(false);
  const reorder = useMutation({
    mutationFn: (ordered: Opportunity[]) =>
      opportunitiesApi.updateOrder(activeProject.id, {
        ordered_opportunity_ids: ordered.map((row) => row.id),
        expected_version: orderVersion.current,
      }),
    onSuccess: (result) => {
      orderVersion.current = result.version;
      reorderPending.current = false;
      setReorderError(false);
      queryClient.invalidateQueries({
        queryKey: queryKeys.projects.commandCenter(activeProject.id),
      });
    },
    onError: () => {
      reorderPending.current = false;
      orderVersion.current = data.action_order_version;
      setActions(data.actions);
      setReorderError(true);
      queryClient.invalidateQueries({
        queryKey: queryKeys.projects.commandCenter(activeProject.id),
      });
    },
  });

  const move = (from: number, to: number) => {
    if (reorderPending.current) return;
    if (from < 0 || to < 0 || from >= actions.length || to >= actions.length || from === to) return;
    const next = [...actions];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setActions(next);
    setReorderError(false);
    reorderPending.current = true;
    reorder.mutate(next);
  };

  const download = async () => {
    setDownloading(true);
    setDownloadError(false);
    try {
      const blob = await projectsApi.downloadExecutiveReport(activeProject.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `citeladder-${activeProject.brand_name || activeProject.name}-report.pdf`;
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

  return (
    <div className="grid gap-6" data-tour="command-center">
      {/* Brand Header Banner */}
      <section className="bg-panel shadow-card border-border-subtle flex flex-wrap items-center justify-between gap-4 rounded-sm border p-5">
        <div className="flex min-w-0 items-center gap-4">
          <BrandLogo
            name={data.project.brand_name || data.project.name}
            logoUrl={activeProject.brand.logo_url}
            websiteUrl={data.project.website_url}
            size="xl"
            className="size-12 rounded-sm shadow-xs"
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="font-display text-foreground truncate text-2xl font-semibold tracking-[-0.02em]">
                {data.project.brand_name || data.project.name}
              </h2>
              {data.project.website_url ? (
                <a
                  href={
                    /^https?:\/\//i.test(data.project.website_url)
                      ? data.project.website_url
                      : `https://${data.project.website_url}`
                  }
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted hover:text-foreground border-border-subtle bg-background inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium transition-colors"
                >
                  <span className="truncate">
                    {data.project.website_url.replace(/^https?:\/\//i, '').replace(/\/$/, '')}
                  </span>
                  <ExternalLink className="size-3 shrink-0" aria-hidden />
                </a>
              ) : null}
            </div>
            {data.measurement ? (
              <p className="text-muted mt-1 text-xs">
                Tracked {formatUtcTimestamp(data.measurement.completed_at)} ·{' '}
                {data.measurement.logical_engines.join(', ')}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <ProjectControls
            projects={projects}
            activeProject={activeProject}
            activeProjectId={activeProjectId}
            setActiveProjectId={setActiveProjectId}
            onEditProject={onEditProject}
          />
          <FactsDrawer projectId={activeProject.id} />
          {data.report_available ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={download}
              disabled={downloading}
              className="gap-1.5 shadow-xs"
            >
              {downloading ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden />
              ) : (
                <Download className="size-4" aria-hidden />
              )}
              {downloading ? 'Preparing…' : 'Executive PDF'}
            </Button>
          ) : null}
        </div>
      </section>

      {downloadError ? (
        <Alert tone="danger">The report could not be downloaded. Try again.</Alert>
      ) : null}
      {reorderError ? (
        <Alert tone="warning">
          The shared action order changed. Review the refreshed order and try again.
        </Alert>
      ) : null}
      {data.stale ? (
        <Alert tone="warning">
          New evidence is available. Refresh the measurement before acting.
        </Alert>
      ) : null}

      {/* High-Contrast Next Action Banner & Track Card */}
      <div className="grid gap-5 md:grid-cols-2">
        <div className="bg-panel-tonal text-foreground border-border/70 shadow-card flex flex-col justify-between gap-4 rounded-sm border p-5 sm:p-6">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-accent-text bg-accent-soft inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-sans text-xs font-semibold tracking-wider uppercase">
                <span className="bg-accent size-1.5 rounded-full" aria-hidden />
                Next action
              </span>
              <span className="text-muted text-xs font-semibold tracking-wider uppercase">
                {data.next_action.kind === 'monitor' ? 'Optimal state' : 'Action recommended'}
              </span>
            </div>
            <p className="font-display text-foreground mt-3 text-lg leading-snug font-semibold">
              {data.next_action.title}
            </p>
            <p className="text-muted mt-1 text-xs leading-relaxed">
              Prioritized from deterministic evidence and current visibility coverage.
            </p>
          </div>
          <div className="pt-2">
            <Button asChild variant="primary" size="md">
              <Link href={data.next_action.href}>
                {data.next_action.kind === 'monitor' ? 'View trends' : 'Continue'}
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </Button>
          </div>
        </div>

        <div className="bg-panel shadow-card border-border/70 flex flex-col justify-between gap-4 rounded-sm border p-5 sm:p-6">
          <div>
            <div className="flex items-center justify-between">
              <span className={eyebrowClasses}>AI Visibility Track</span>
              <span className="text-muted text-xs font-medium">
                {data.track.observed_at ? `${data.track.engine_coverage} engine(s)` : 'No run'}
              </span>
            </div>
            <div className="mt-3 flex items-baseline gap-3">
              <p className="font-display text-foreground text-xl font-semibold">
                Citation share {metricValue(data.track.citation_share.value, '%')}
              </p>
              {data.track.citation_share.delta !== null ? (
                <span
                  className={cn(
                    'font-display text-xs font-semibold tabular-nums',
                    data.track.citation_share.delta >= 0 ? 'text-success' : 'text-danger',
                  )}
                >
                  {data.track.citation_share.delta > 0 ? '+' : ''}
                  {data.track.citation_share.delta.toFixed(1)}%
                </span>
              ) : null}
            </div>
            <p className="text-muted mt-1.5 text-xs leading-relaxed">
              {data.track.observed_at
                ? deltaLabel(data.track.citation_share.delta)
                : data.track.limitations[0]}
            </p>
          </div>
          <div className="flex justify-end pt-2">
            <Button asChild variant="ghost" size="sm" className="text-xs font-medium">
              <Link href="/visibility?tab=trends">
                Open Trends <ArrowRight className="ms-1 size-3.5" aria-hidden />
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Project State Unified Metric Panel */}
      <section aria-labelledby="project-state" className="grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <SectionTitle id="project-state">Project state</SectionTitle>
          <Badge>{data.measurement?.measurement_mode ?? 'not run'}</Badge>
        </div>
        <div className="bg-panel shadow-card border-border-subtle divide-border-subtle grid divide-y overflow-hidden rounded-sm border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <StateMetric label="Visibility" {...data.state.visibility} />
          <StateMetric label="Share of voice" {...data.state.share_of_voice} suffix="%" />
          <StateMetric label="Brand rank" {...data.state.brand_rank} inverse />
        </div>
      </section>

      {/* 2-Column Grid: Movement & Company Facts */}
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="bg-panel shadow-card border-border-subtle flex flex-col justify-between gap-4 rounded-sm border p-5">
          <section aria-labelledby="movement" className="grid gap-3.5">
            <div>
              <SectionTitle id="movement">Movement</SectionTitle>
              <p className="text-muted mt-0.5 text-xs">
                Only comparable persisted measurements are shown.
              </p>
            </div>
            <MovementChart movements={data.movements} />
          </section>
        </div>

        <div className="bg-panel shadow-card border-border-subtle flex flex-col justify-between gap-4 rounded-sm border p-5">
          <section aria-labelledby="company-facts" className="grid gap-3.5">
            <div className="flex items-center justify-between gap-3">
              <SectionTitle id="company-facts">Company facts</SectionTitle>
              <span className="text-muted text-xs font-medium">
                {data.facts.industry || 'Industry not set'}
              </span>
            </div>
            <div className="grid gap-3.5 sm:grid-cols-2">
              <div>
                <p className={eyebrowClasses}>Positioning</p>
                <p className="text-foreground mt-1 text-sm leading-snug font-medium">
                  {data.facts.positioning ||
                    data.facts.description ||
                    'Add positioning in company facts.'}
                </p>
              </div>
              <div>
                <p className={eyebrowClasses}>Target Audience</p>
                <p className="text-secondary mt-1 text-sm leading-snug">
                  {data.facts.target_audience
                    ? `Audience: ${data.facts.target_audience}`
                    : 'Target audience not set.'}
                </p>
              </div>
              <div className="border-border-subtle border-t pt-3 sm:col-span-2">
                <p className="text-muted text-2xs font-medium">
                  {data.facts.products_services.length
                    ? `Offerings: ${data.facts.products_services.join(', ')}`
                    : 'Offerings not set.'}{' '}
                  · {data.facts.competitors.length} tracked competitor(s)
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Ranked Actions Ledger Table */}
      <div className="bg-panel shadow-card border-border-subtle overflow-hidden rounded-sm border">
        <section aria-labelledby="ranked-actions">
          <div className="border-border-subtle flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
            <div>
              <SectionTitle id="ranked-actions">Ranked actions</SectionTitle>
              <p className="text-muted mt-0.5 text-xs">
                Shared order · drag or use the arrow controls.
              </p>
            </div>
            <Button asChild variant="ghost" size="sm" className="text-xs font-medium">
              <Link href="/opportunities">
                View all <ArrowRight className="ms-1 size-3.5" aria-hidden />
              </Link>
            </Button>
          </div>
          {actions.length ? (
            <ol>
              {actions.map((action, index) => (
                <ActionRow
                  key={action.id}
                  action={action}
                  index={index}
                  total={actions.length}
                  onMove={move}
                  onDrop={move}
                  reorderPending={reorder.isPending}
                />
              ))}
            </ol>
          ) : (
            <div className="p-8 text-center">
              <p className="text-foreground text-sm font-semibold">No open actions</p>
              <p className="text-muted mt-1 text-xs">
                Run another audit to look for new opportunities.
              </p>
            </div>
          )}
        </section>
      </div>

      {/* Progress & Proof Card */}
      <div className="bg-panel shadow-card border-border-subtle rounded-sm border p-5">
        <section
          aria-labelledby="progress-proof"
          className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"
        >
          <div>
            <SectionTitle id="progress-proof">Progress and report proof</SectionTitle>
            <p className="text-muted mt-1 max-w-[65ch] text-xs leading-relaxed">
              {data.resolved_actions.count} action(s) resolved since the comparable run. Metric
              movement is shown alongside completion without claiming causation.
            </p>
          </div>
          {data.report_available ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={download}
              disabled={downloading}
              className="shrink-0 gap-1.5 shadow-xs"
            >
              <Download className="size-4" aria-hidden /> Download PDF
            </Button>
          ) : null}
        </section>
      </div>
    </div>
  );
}

export function DashboardScreen({
  onEditProject,
}: Readonly<{ onEditProject?: (project: Project) => void }> = {}) {
  const {
    projects = [],
    activeProject,
    activeProjectId,
    setActiveProjectId,
    isLoading,
  } = useProjectContext();
  const commandCenter = useQuery({
    queryKey: queryKeys.projects.commandCenter(activeProject?.id ?? ''),
    queryFn: ({ signal }) => projectsApi.getCommandCenter(activeProject!.id, { signal }),
    enabled: Boolean(activeProject),
  });

  if (isLoading || (activeProject && commandCenter.isLoading)) return <CommandCenterSkeleton />;
  if (!activeProject) return null;
  if (commandCenter.isError || !commandCenter.data) {
    return (
      <Alert tone="danger">
        The command center could not be loaded.{' '}
        <Button variant="ghost" size="sm" onClick={() => commandCenter.refetch()}>
          Try again
        </Button>
      </Alert>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <CommandCenterContent
        key={`${activeProject.id}:${commandCenter.data.action_order_version}`}
        data={commandCenter.data}
        projects={projects}
        activeProject={activeProject}
        activeProjectId={activeProjectId}
        setActiveProjectId={setActiveProjectId}
        onEditProject={onEditProject}
      />
      {/* Top insights across all layers (§7.1). Ranked server-side by the
          deterministic formula; this surface does not reorder them. */}
      <TopInsights projectId={activeProject.id} />
    </div>
  );
}
