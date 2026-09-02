import { ArrowRight, Download, ExternalLink, LoaderCircle } from 'lucide-react';
import { hairlineBandClasses, hairlineBandItemClasses } from '@/components/ui/workspace';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { BrandLogo } from '@/components/ui/brand-logo';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SectionTitle, textRole } from '@/components/ui/typography';
import { UnavailableValue } from '@/components/ui/unavailable-value';
import { AccentEyebrow, eyebrowClasses } from '@/components/ui/eyebrow';
import type { CommandCenter, Project } from '@/lib/api/types';
import { formatUtcTimestamp } from '@/lib/format';
import { cn } from '@/lib/utils';

import { FactsDrawer, ProjectControls } from './dashboard-controls';
import {
  ActionRow,
  deltaLabel,
  metricValue,
  MovementChart,
  StateMetric,
} from './dashboard-primitives';
import { Stack } from '@/components/ui/layout';
import { Tooltip } from '@/components/ui/tooltip';

export function DashboardHeader({
  data,
  projects,
  activeProject,
  activeProjectId,
  setActiveProjectId,
  onEditProject,
  downloading,
  onDownload,
}: Readonly<{
  data: CommandCenter;
  projects: Project[];
  activeProject: Project;
  activeProjectId?: string | null;
  setActiveProjectId: (id: string) => void;
  onEditProject?: (project: Project) => void;
  downloading: boolean;
  onDownload: () => void;
}>) {
  const website = data.project.website_url;
  const facts = data.facts;
  return (
    <Card className="grid gap-[var(--workspace-gap)] p-[var(--card-padding-large)]">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <BrandLogo
            name={data.project.brand_name || data.project.name}
            logoUrl={activeProject.brand.logo_url}
            websiteUrl={website}
            size="xl"
            className="size-12 rounded-[var(--radius-control)]"
          />
          <div className="grid min-w-0 gap-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className={textRole('sectionTitle', 'truncate tracking-[-0.02em]')}>
                {data.project.brand_name || data.project.name}
              </h2>
              {website ? (
                <a
                  href={/^https?:\/\//i.test(website) ? website : `https://${website}`}
                  target="_blank"
                  rel="noreferrer"
                  className={textRole(
                    'label',
                    'hover:text-foreground border-border-subtle bg-background-alt inline-flex items-center gap-1 rounded-[var(--radius-control)] border px-2 py-0.5 transition-colors',
                  )}
                >
                  <span className="truncate">
                    {website.replace(/^https?:\/\//i, '').replace(/\/$/, '')}
                  </span>
                  <ExternalLink className="size-3 shrink-0" aria-hidden />
                </a>
              ) : null}
            </div>
            {data.measurement ? (
              <p className="text-muted text-xs">
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
          <FactsDrawer projectId={activeProject.id} competitors={activeProject.competitors ?? []} />
          {data.report_available ? (
            <PdfButton downloading={downloading} onDownload={onDownload} />
          ) : null}
        </div>
      </div>
      <div className="border-border-subtle grid gap-3 border-t pt-4">
        <div className="flex items-center justify-between gap-3">
          <SectionTitle id="company-facts">Company facts</SectionTitle>
          <span className={textRole('label')}>{facts.industry || 'Industry not set'}</span>
        </div>
        <div
          className={cn(hairlineBandClasses, 'border-y-0 sm:grid-cols-3')}
          aria-labelledby="company-facts"
        >
          <FactSummary
            label="Positioning"
            value={facts.positioning || facts.description}
            emptyState="not_set"
          />
          <FactSummary label="Target audience" value={facts.target_audience} emptyState="not_set" />
          <FactSummary
            label="Offerings & competitors"
            value={facts.products_services.join(', ')}
            emptyState="not_set"
            supporting={`${facts.competitors.length} tracked competitor${facts.competitors.length === 1 ? '' : 's'}`}
          />
        </div>
      </div>
    </Card>
  );
}

function FactSummary({
  label,
  value,
  emptyState,
  supporting,
}: Readonly<{
  label: string;
  value: string;
  emptyState: 'not_set';
  supporting?: string;
}>) {
  return (
    <div className={cn(hairlineBandItemClasses, 'grid gap-1.5')}>
      <p className={eyebrowClasses}>{label}</p>
      {value.trim() ? (
        <div className="min-w-0">
          <Tooltip content={value}>
            <p className={textRole('body', 'line-clamp-2 overflow-hidden leading-snug')}>{value}</p>
          </Tooltip>
        </div>
      ) : (
        <UnavailableValue state={emptyState} className="inline-flex justify-self-start" />
      )}
      {supporting ? <p className={textRole('meta')}>{supporting}</p> : null}
    </div>
  );
}

function PdfButton({
  downloading,
  onDownload,
}: Readonly<{ downloading: boolean; onDownload: () => void }>) {
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={onDownload}
      pending={downloading}
      pendingLabel="Preparing…"
      className="gap-1.5"
    >
      {downloading ? (
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
      ) : (
        <Download className="size-4" aria-hidden />
      )}
      {downloading ? 'Preparing…' : 'Executive PDF'}
    </Button>
  );
}

export function SummarySections({ data }: Readonly<{ data: CommandCenter }>) {
  return (
    <>
      <div className="grid gap-[var(--workspace-gap)] lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <NextAction data={data} />
        <Track data={data} />
      </div>
      <Card aria-labelledby="project-state" className="grid gap-3 p-[var(--card-padding-large)]">
        <div className="flex items-center justify-between gap-3">
          <SectionTitle id="project-state">Project state</SectionTitle>
          <Badge>{data.measurement ? 'Citation-capable audit' : 'Not run'}</Badge>
        </div>
        <div className={cn(hairlineBandClasses, 'sm:grid-cols-3')}>
          <StateMetric label="Visibility" {...data.state.visibility} />
          <StateMetric label="Share of voice" {...data.state.share_of_voice} suffix="%" />
          <StateMetric label="Brand rank" {...data.state.brand_rank} inverse />
        </div>
      </Card>
      <Movement data={data} />
    </>
  );
}

function NextAction({ data }: Readonly<{ data: CommandCenter }>) {
  return (
    <Card className="text-foreground flex flex-col justify-between gap-4 p-[var(--card-padding-large)]">
      <Stack gap="compact">
        <div className="flex items-center justify-between">
          <AccentEyebrow>
            <span className="bg-accent size-1.5 rounded-full" aria-hidden />
            Next action
          </AccentEyebrow>
          <span className={textRole('label')}>
            {data.next_action.kind === 'monitor' ? 'Optimal state' : 'Action recommended'}
          </span>
        </div>
        <Stack gap="tight">
          <p className={textRole('sectionTitle', 'leading-snug')}>{data.next_action.title}</p>
          <p className={textRole('meta', 'leading-relaxed')}>
            Prioritized from deterministic evidence and current visibility coverage.
          </p>
        </Stack>
      </Stack>
      <Button asChild variant="primary" size="md" className="self-start">
        <Link href={data.next_action.href}>
          {data.next_action.kind === 'monitor' ? 'View trends' : 'Continue'}
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </Button>
    </Card>
  );
}

function Track({ data }: Readonly<{ data: CommandCenter }>) {
  const delta = data.track.citation_share.delta;
  return (
    <Card
      aria-labelledby="citation-share-track"
      className="flex flex-col justify-between gap-4 p-[var(--card-padding-large)]"
    >
      <Stack gap="compact">
        <div className="flex items-center justify-between">
          <span className={eyebrowClasses}>AI Visibility Track</span>
          <span className={textRole('label')}>
            {data.track.observed_at ? `${data.track.engine_coverage} engine(s)` : 'No run'}
          </span>
        </div>
        <Stack gap="tight">
          <SectionTitle id="citation-share-track">Citation share</SectionTitle>
          <div className="flex items-baseline gap-3">
            {data.track.citation_share.value === null ? (
              <UnavailableValue state={data.track.observed_at ? 'unavailable' : 'not_run'} />
            ) : (
              <p className={textRole('metric', 'leading-none')}>
                {metricValue(data.track.citation_share.value, '%')}
              </p>
            )}
            {delta !== null ? (
              <span className={textRole('delta', delta >= 0 ? 'text-success' : 'text-danger')}>
                {delta > 0 ? '+' : ''}
                {delta.toFixed(1)}%
              </span>
            ) : null}
          </div>
          <p className={textRole('meta', 'leading-relaxed')}>
            {data.track.observed_at ? deltaLabel(delta) : data.track.limitations[0]}
          </p>
        </Stack>
      </Stack>
      <div className="flex justify-end">
        <Button asChild variant="ghost" size="sm">
          <Link href="/visibility?tab=trends">
            Open Trends <ArrowRight className="ms-1 size-3.5" aria-hidden />
          </Link>
        </Button>
      </div>
    </Card>
  );
}

function Movement({ data }: Readonly<{ data: CommandCenter }>) {
  return (
    <Card
      aria-labelledby="movement"
      className="flex flex-col justify-between gap-4 p-[var(--card-padding-large)]"
    >
      <div className="grid gap-3">
        <div className="grid gap-0.5">
          <SectionTitle id="movement">Movement</SectionTitle>
          <p className="text-muted text-xs">Only comparable persisted measurements are shown.</p>
        </div>
        <MovementChart movements={data.movements} />
      </div>
    </Card>
  );
}

export function ActionsAndProof({
  data,
  actions,
  pending,
  onMove,
  downloading,
  onDownload,
}: Readonly<{
  data: CommandCenter;
  actions: CommandCenter['actions'];
  pending: boolean;
  onMove: (from: number, to: number) => void;
  downloading: boolean;
  onDownload: () => void;
}>) {
  return (
    <div className="grid gap-[var(--workspace-gap)]">
      <Card aria-labelledby="ranked-actions" className="p-[var(--card-padding-large)]">
        <div className="border-border-subtle flex flex-wrap items-center justify-between gap-3 border-t border-b pt-3 pb-3">
          <div className="grid gap-0.5">
            <SectionTitle id="ranked-actions">Ranked actions</SectionTitle>
            <p className="text-muted text-xs">Shared order · drag or use the arrow controls.</p>
          </div>
          <Button asChild variant="ghost" size="sm">
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
                onMove={onMove}
                onDrop={onMove}
                reorderPending={pending}
              />
            ))}
          </ol>
        ) : (
          <div className="grid gap-1 py-[var(--empty-state-padding)]">
            <p className={textRole('bodyStrong')}>No open actions</p>
            <p className="text-muted text-xs">Run another audit to look for new opportunities.</p>
          </div>
        )}
      </Card>
      <Card
        aria-labelledby="progress-proof"
        className="flex flex-col justify-between gap-4 p-[var(--card-padding-large)] sm:flex-row sm:items-center"
      >
        <div className="grid gap-1">
          <SectionTitle id="progress-proof">Progress and report proof</SectionTitle>
          <p className="text-muted max-w-[65ch] text-xs leading-relaxed">
            {data.resolved_actions.count} action(s) resolved since the comparable run. Metric
            movement is shown alongside completion without claiming causation.
          </p>
        </div>
        {data.report_available ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={onDownload}
            pending={downloading}
            pendingLabel="Preparing…"
            className="shrink-0 gap-1.5"
          >
            <Download className="size-4" aria-hidden /> Download PDF
          </Button>
        ) : null}
      </Card>
    </div>
  );
}
