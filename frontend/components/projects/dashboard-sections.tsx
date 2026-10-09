import { ArrowRight, Download } from 'lucide-react';
import {
  EditorialSectionHeader,
  hairlineBandClasses,
  hairlineBandItemClasses,
  ledgerClasses,
  MetricGroup,
  splitPaneClasses,
} from '@/components/ui/workspace';
import { ProjectLink } from '@/components/layout/scoped-link';

import { Badge } from '@/components/ui/badge';
import { TagGroup } from '@/components/ui/tag';
import { BrandLogo } from '@/components/ui/brand-logo';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardEyebrow, CardHeader, CardTitle } from '@/components/ui/card';
import { Delta } from '@/components/ui/delta';
import { EmptyState } from '@/components/ui/empty-state';
import { TextLink } from '@/components/ui/text-link';
import { textRole } from '@/components/ui/typography';
import { MetricValue } from '@/components/ui/metric-value';
import { UnavailableValue } from '@/components/ui/unavailable-value';
import { availabilityLabel } from '@/lib/format';
import { eyebrowClasses } from '@/components/ui/eyebrow';
import type { CommandCenter, Project } from '@/lib/api/types';
import { DisplayTime } from '@/components/ui/display-time';
import { cn } from '@/lib/utils';

import { ProjectControls } from './dashboard-controls';
import { ActionRow, metricValue, MovementChart, StateMetric } from './dashboard-primitives';
import { Stack } from '@/components/ui/layout';
import { Tooltip } from '@/components/ui/tooltip';

export function DashboardHeader({
  data,
  activeProject,
}: Readonly<{
  data: CommandCenter;
  activeProject: Project;
}>) {
  const website = data.project.website_url;
  return (
    <Stack as="section" gap="workspace">
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
            <div className="flex flex-wrap items-center gap-2">
              <h2 className={textRole('sectionTitle', 'truncate')}>
                {data.project.brand_name || data.project.name}
              </h2>
              {website ? (
                <TextLink
                  variant="external"
                  text="label"
                  href={/^https?:\/\//i.test(website) ? website : `https://${website}`}
                  className="min-w-0"
                >
                  <span className="truncate">
                    {website.replace(/^https?:\/\//i, '').replace(/\/$/, '')}
                  </span>
                </TextLink>
              ) : null}
            </div>
            {data.measurement ? (
              <p className={textRole('caption')}>
                Tracked <DisplayTime value={data.measurement.completed_at} /> ·{' '}
                {data.measurement.logical_engines.join(', ')}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </Stack>
  );
}

export function CompanyFacts({ data }: Readonly<{ data: CommandCenter }>) {
  const facts = data.facts;
  const offerings = facts.products_services.filter((label) => label.trim());
  return (
    <section aria-labelledby="company-facts" className="grid gap-3">
      <EditorialSectionHeader
        title="Company facts"
        headingId="company-facts"
        actions={
          <div className="flex items-center gap-3">
            <span className={textRole('label')}>{facts.industry || 'Industry not set'}</span>
            <Button asChild variant="ghost" size="sm">
              <ProjectLink href="/agent/context">
                Edit in Agent context <ArrowRight className="ms-1 size-3.5" aria-hidden />
              </ProjectLink>
            </Button>
          </div>
        }
      />
      <div className={cn(hairlineBandClasses, 'border-y-0 sm:grid-cols-3')}>
        <FactSummary
          label="Positioning"
          value={facts.positioning || facts.description}
          emptyState="not_set"
        />
        <FactSummary label="Target audience" value={facts.target_audience} emptyState="not_set" />
        <div className={cn(hairlineBandItemClasses, 'grid content-start gap-2')}>
          <p className={eyebrowClasses}>Offerings & competitors</p>
          {offerings.length ? (
            <TagGroup labels={offerings} tone="purple" />
          ) : (
            <UnavailableValue state="not_set" />
          )}
          <p className={textRole('caption')}>
            {facts.competitors.length} tracked competitor{facts.competitors.length === 1 ? '' : 's'}
          </p>
        </div>
      </div>
    </section>
  );
}

export function DashboardActions({
  data,
  activeProject,
  onEditProject,
  downloading,
  onDownload,
}: Readonly<{
  data: CommandCenter;
  activeProject: Project;
  onEditProject?: (project: Project) => void;
  downloading: boolean;
  onDownload: () => void;
}>) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ProjectControls activeProject={activeProject} onEditProject={onEditProject} />
      {data.report_available ? (
        <PdfButton downloading={downloading} onDownload={onDownload} />
      ) : null}
    </div>
  );
}

function FactSummary({
  label,
  value,
  emptyState,
}: Readonly<{
  label: string;
  value: string;
  emptyState: 'not_set';
}>) {
  return (
    <div className={cn(hairlineBandItemClasses, 'grid gap-2')}>
      <p className={eyebrowClasses}>{label}</p>
      {value.trim() ? (
        <div className="min-w-0">
          <Tooltip content={value}>
            <p className={textRole('body', 'line-clamp-2 overflow-hidden')}>{value}</p>
          </Tooltip>
        </div>
      ) : (
        <UnavailableValue state={emptyState} className="inline-flex justify-self-start" />
      )}
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
      className="gap-2"
    >
      <Download className="size-3.5" aria-hidden />
      Executive PDF
    </Button>
  );
}

export function SummarySections({ data }: Readonly<{ data: CommandCenter }>) {
  return (
    <>
      <div className={splitPaneClasses('main-aside')}>
        <Card aria-labelledby="project-state">
          <CardHeader
            actions={<Badge>{data.measurement ? 'Citation-capable audit' : 'Not run'}</Badge>}
          >
            <CardTitle id="project-state">Project state</CardTitle>
          </CardHeader>
          <CardContent>
            <MetricGroup>
              <StateMetric label="Visibility" {...data.state.visibility} suffix="%" />
              <StateMetric label="Share of voice" {...data.state.share_of_voice} suffix="%" />
              <StateMetric label="Brand rank" {...data.state.brand_rank} inverse />
            </MetricGroup>
          </CardContent>
        </Card>
        <Track data={data} />
      </div>
      <Movement data={data} />
      <NextAction data={data} />
    </>
  );
}

function NextAction({ data }: Readonly<{ data: CommandCenter }>) {
  return (
    <Card tone="recommendation" aria-labelledby="next-action" className="text-foreground">
      <CardHeader
        actions={
          <span className={textRole('label')}>
            {data.next_action.kind === 'monitor' ? 'Optimal state' : 'Action recommended'}
          </span>
        }
      >
        <CardEyebrow>Next action</CardEyebrow>
        <CardTitle id="next-action">{data.next_action.title}</CardTitle>
      </CardHeader>
      <CardContent className="grid justify-items-start gap-3">
        <p className={textRole('caption')}>
          Prioritized from deterministic evidence and current visibility coverage.
        </p>
        <Button asChild variant="primary" size="md">
          <ProjectLink href={data.next_action.href}>
            {data.next_action.kind === 'monitor' ? 'View trends' : 'Continue'}
            <ArrowRight className="size-4" aria-hidden />
          </ProjectLink>
        </Button>
      </CardContent>
    </Card>
  );
}

function Track({ data }: Readonly<{ data: CommandCenter }>) {
  return (
    <Card aria-labelledby="citation-share-track" className="flex flex-col justify-between">
      <CardHeader
        actions={
          data.track.observed_at ? (
            <span className={textRole('label')}>{data.track.engine_coverage} engine(s)</span>
          ) : null
        }
      >
        <CardTitle id="citation-share-track">Citation share</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-1">
        <span className={eyebrowClasses}>AI Visibility Track</span>
        <MetricValue
          value={
            data.track.citation_share.value === null
              ? null
              : metricValue(data.track.citation_share.value, '%')
          }
          label={availabilityLabel(data.track.observed_at ? 'unavailable' : 'not_run')}
        />
        {data.track.observed_at ? (
          <div>
            <Delta
              value={data.track.citation_share.delta}
              context="vs previous"
              missingReason="No comparable run"
            />
          </div>
        ) : (
          <p className={textRole('caption')}>{data.track.limitations[0]}</p>
        )}
      </CardContent>
      <CardContent className="flex justify-end">
        <Button asChild variant="ghost" size="sm">
          <ProjectLink href="/visibility?tab=trends">
            Open Trends <ArrowRight className="ms-1 size-3.5" aria-hidden />
          </ProjectLink>
        </Button>
      </CardContent>
    </Card>
  );
}

function Movement({ data }: Readonly<{ data: CommandCenter }>) {
  return (
    <section aria-labelledby="movement" className="grid gap-3">
      <EditorialSectionHeader
        title="Movement"
        headingId="movement"
        description="Only comparable persisted measurements are shown."
      />
      <MovementChart movements={data.movements} />
    </section>
  );
}

export function ActionsAndProof({
  data,
  actions,
  pending,
  onMove,
}: Readonly<{
  data: CommandCenter;
  actions: CommandCenter['actions'];
  pending: boolean;
  onMove: (from: number, to: number) => void;
}>) {
  return (
    <Stack gap="workspace">
      <section aria-labelledby="ranked-actions" className="grid gap-3">
        <EditorialSectionHeader
          title="Ranked actions"
          headingId="ranked-actions"
          description="Shared order · drag or use the arrow controls."
          actions={
            <Button asChild variant="ghost" size="sm">
              <ProjectLink href="/agent/actions">
                View all <ArrowRight className="ms-1 size-3.5" aria-hidden />
              </ProjectLink>
            </Button>
          }
        />
        {actions.length ? (
          <ol className={ledgerClasses('open')}>
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
          <EmptyState
            variant="compact"
            icon={ArrowRight}
            heading="No open actions"
            description="Run another audit to look for new opportunities."
          />
        )}
      </section>
      <section aria-labelledby="progress-proof">
        <EditorialSectionHeader
          title="Progress and report proof"
          headingId="progress-proof"
          description={`${data.resolved_actions.count} action(s) resolved since the comparable run. Metric movement is shown alongside completion without claiming causation.`}
        />
      </section>
    </Stack>
  );
}
