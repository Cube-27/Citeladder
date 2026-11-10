import { ArrowRight, Download, TrendingUp } from 'lucide-react';
import type { ReactNode } from 'react';
import { ProjectLink } from '@/components/ui/project-link';
import { LaunchAuditButton } from '@/components/runs/launch-audit-button';

import { Badge } from '@/components/ui/badge';
import { TagGroup } from '@/components/ui/tag';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardEyebrow,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Delta } from '@/components/ui/delta';
import { EmptyState } from '@/components/ui/empty-state';
import { Icon } from '@/components/ui/icon';
import { Inline, Stack } from '@/components/ui/layout';
import { QueryState } from '@/components/ui/query-state';
import { ReorderList } from '@/components/ui/reorder-list';
import { StatRow, type StatSegment } from '@/components/ui/stat-row';
import { TextLink } from '@/components/ui/text-link';
import { textRole } from '@/components/ui/typography';
import { MetricValue } from '@/components/ui/metric-value';
import { UnavailableValue } from '@/components/ui/unavailable-value';
import { availabilityLabel, pluralCount, readableUrl } from '@/lib/format';
import { severityLabel, severityPriority } from '@/lib/site-health/issues';
import type { CommandCenter, Project } from '@citeladder/contracts';
import { DisplayTime } from '@/components/ui/display-time';

import { ProjectControls } from './dashboard-controls';
import {
  actionItem,
  MovementChart,
  percentFigure,
  rankFigure,
  VS_PREVIOUS_RUN,
} from './dashboard-primitives';
import { ClampText } from '@/components/ui/table';

/**
 * One line over the Overview: the site, and the run it was last tracked in
 * with its engines. The sidebar's project switcher already names the project,
 * so the line does not repeat the name or the logo.
 */
export function ProjectMeta({ data }: Readonly<{ data: CommandCenter }>) {
  const website = data.project.website_url;
  const measurement = data.measurement;
  if (!website && !measurement) return null;
  return (
    <Inline as="p" gap="meta" className={textRole('caption')}>
      {website ? (
        <TextLink
          variant="external"
          text="caption"
          tone="muted"
          href={/^https?:\/\//i.test(website) ? website : `https://${website}`}
          className="min-w-0"
        >
          <span className="truncate">
            {website.replace(/^https?:\/\//i, '').replace(/\/$/, '')}
          </span>
        </TextLink>
      ) : null}
      {measurement ? (
        <span>
          Tracked <DisplayTime value={measurement.completed_at} /> ·{' '}
          {measurement.logical_engines.join(', ')}
        </span>
      ) : null}
    </Inline>
  );
}

export function CompanyFacts({ data }: Readonly<{ data: CommandCenter }>) {
  const facts = data.facts;
  const offerings = facts.products_services.filter((label) => label.trim());
  return (
    <Card aria-labelledby="company-facts" className="h-full">
      <CardHeader
        actions={
          <>
            <span className={textRole('label')}>{facts.industry || 'Industry not set'}</span>
            <Button asChild variant="ghost">
              <ProjectLink href="/agent/context">
                Edit in Agent context <Icon icon={ArrowRight} />
              </ProjectLink>
            </Button>
          </>
        }
      >
        <CardTitle id="company-facts">Company facts</CardTitle>
      </CardHeader>
      <CardContent>
        <StatRow
          segments={[
            {
              key: 'positioning',
              label: 'Positioning',
              value: <FactSummary value={facts.positioning || facts.description} />,
            },
            {
              key: 'audience',
              label: 'Target audience',
              value: <FactSummary value={facts.target_audience} />,
            },
            {
              key: 'offerings',
              label: 'Offerings & competitors',
              value: offerings.length ? (
                <TagGroup labels={offerings} />
              ) : (
                <UnavailableValue state="not_set" />
              ),
              sub: pluralCount(facts.competitors.length, 'tracked competitor'),
            },
          ]}
        />
      </CardContent>
    </Card>
  );
}

export function DashboardActions({
  activeProject,
  onEditProject,
  downloading,
  onDownload,
  layoutMenu,
}: Readonly<{
  activeProject: Project;
  onEditProject?: (project: Project) => void;
  downloading: boolean;
  onDownload: () => void;
  /** The layout menu, for members who can edit the Overview. */
  layoutMenu?: ReactNode;
}>) {
  return (
    // A fragment: the identity band owns the gap between route actions.
    <>
      <ProjectControls activeProject={activeProject} onEditProject={onEditProject} />
      {layoutMenu}
      <PdfButton downloading={downloading} onDownload={onDownload} />
    </>
  );
}

/** A free-text fact, cut at two lines with the whole text behind a tooltip. */
function FactSummary({ value }: Readonly<{ value: string }>) {
  if (!value.trim()) return <UnavailableValue state="not_set" />;
  return (
    <ClampText lines={2} className={textRole('body')}>
      {value}
    </ClampText>
  );
}

function PdfButton({
  downloading,
  onDownload,
}: Readonly<{ downloading: boolean; onDownload: () => void }>) {
  return (
    <Button
      variant="secondary"
      onClick={onDownload}
      pending={downloading}
      pendingLabel="Preparing…"
    >
      <Icon icon={Download} />
      Export PDF
    </Button>
  );
}

type StateMetric = Readonly<{ value: number | null; delta: number | null }>;

/**
 * How each kind of Project state figure prints and changes. A rate is a whole
 * percent that moves in percent points; a rank is a place ("#3") that moves
 * in whole places and is better when it falls.
 */
const STATE_FIGURE = {
  rate: { format: percentFigure, unit: ' pp', precision: 1, policy: 'higher-is-better' },
  rank: { format: rankFigure, unit: '', precision: 0, policy: 'lower-is-better' },
} as const;

/**
 * One Project state figure. A missing value or a missing comparison has no
 * change to report; the Movement card states why once, rather than a dash
 * under every figure.
 */
function stateSegment({
  key,
  label,
  metric,
  kind,
}: Readonly<{
  key: string;
  label: string;
  metric: StateMetric;
  kind: keyof typeof STATE_FIGURE;
}>): StatSegment {
  const figure = STATE_FIGURE[kind];
  return {
    key,
    label,
    value: metric.value === null ? null : figure.format(metric.value),
    delta:
      metric.value !== null && metric.delta !== null ? (
        <Delta
          value={metric.delta}
          policy={figure.policy}
          precision={figure.precision}
          unit={figure.unit}
          {...VS_PREVIOUS_RUN}
        />
      ) : undefined,
  };
}

/** The metric names AI Visibility uses, so one run reads the same on both screens. */
export function ProjectStateCard({ data }: Readonly<{ data: CommandCenter }>) {
  return (
    <Card aria-labelledby="project-state" className="h-full">
      <CardHeader
        actions={<Badge>{data.measurement ? 'Citation-capable audit' : 'Not run'}</Badge>}
      >
        <CardTitle id="project-state">Project state</CardTitle>
      </CardHeader>
      <CardContent>
        <StatRow
          segments={[
            stateSegment({
              key: 'visibility',
              label: 'Visibility',
              metric: data.state.visibility,
              kind: 'rate',
            }),
            stateSegment({
              key: 'share',
              label: 'Share of voice',
              metric: data.state.share_of_voice,
              kind: 'rate',
            }),
            stateSegment({
              key: 'rank',
              label: 'Rank',
              metric: data.state.brand_rank,
              kind: 'rank',
            }),
          ]}
        />
      </CardContent>
    </Card>
  );
}

const RECOMMENDED = 'Action recommended';

/**
 * Every step the server can name; steps that are not a call to act say what
 * they are. The button names where it goes, never a bare "Continue".
 */
const NEXT_ACTION_COPY: Record<
  CommandCenter['next_action']['kind'],
  { status: string; link: string; reason: string }
> = {
  opportunity: {
    status: RECOMMENDED,
    link: 'Open the Action',
    reason: 'The first open Action in the shared ranked order.',
  },
  connect: {
    status: RECOMMENDED,
    link: 'Open Integrations',
    reason: 'Search Console or GA4 data sharpens which Actions matter most.',
  },
  crawl: {
    status: RECOMMENDED,
    link: 'Open Site Health',
    reason: 'A site crawl finds the page issues that sharpen later Actions.',
  },
  configure_prompts: {
    status: RECOMMENDED,
    link: 'Choose prompts',
    reason: 'Nothing can be measured until the project tracks the questions buyers ask.',
  },
  audit: {
    status: RECOMMENDED,
    link: 'Open Runs',
    reason: 'A run measures how answer engines name and cite you for every tracked prompt.',
  },
  audit_running: {
    status: 'In progress',
    link: 'View progress',
    reason: 'Results appear here as soon as the run finishes.',
  },
  monitor: {
    status: 'Up to date',
    link: 'View trends',
    reason: 'Every open Action is handled; the next run shows whether visibility moves.',
  },
};

/**
 * The persisted facts behind the step, from what the Overview already reads:
 * the Action's target and evidence, the prompts a run would measure, or the
 * limitation the loop recorded. Null when there is nothing to add.
 */
function nextActionEvidence(data: CommandCenter): ReactNode {
  const step = data.next_action;
  switch (step.kind) {
    case 'opportunity': {
      const action = data.actions.find((item) => item.id === step.opportunity_id);
      if (!action) return null;
      return (
        <Inline>
          <Badge variant="priority" value={severityPriority(action.severity)}>
            {severityLabel(action.severity)}
          </Badge>
          <span className={textRole('caption', 'min-w-0 truncate')}>
            {action.target_label ? readableUrl(action.target_label) : 'Project-wide'} ·{' '}
            {pluralCount(action.evidence_summary.count, 'persisted evidence item')}
          </span>
        </Inline>
      );
    }
    case 'audit':
    case 'audit_running':
      return (
        <p className={textRole('caption')}>
          {pluralCount(data.active_prompt_count, 'active prompt')} to measure
        </p>
      );
    case 'crawl':
      return captionOrNull(data.loop.analyzed.limitations[0]);
    case 'connect':
      return captionOrNull(data.loop.connected.limitations[0]);
    case 'monitor':
      return data.measurement ? (
        <p className={textRole('caption')}>
          Last run <DisplayTime value={data.measurement.completed_at} />
        </p>
      ) : null;
    case 'configure_prompts':
      return null;
    default: {
      const _exhaustive: never = step.kind;
      return _exhaustive;
    }
  }
}

function captionOrNull(text: string | undefined) {
  return text ? <p className={textRole('caption')}>{text}</p> : null;
}

export function NextAction({ data }: Readonly<{ data: CommandCenter }>) {
  const copy = NEXT_ACTION_COPY[data.next_action.kind];
  // An opportunity whose Action is not created yet links to the Actions list.
  const link =
    data.next_action.kind === 'opportunity' && data.next_action.href === '/agent/actions'
      ? 'Open Actions'
      : copy.link;
  return (
    <Card aria-labelledby="next-action" className="text-ink h-full">
      <CardHeader actions={<span className={textRole('label')}>{copy.status}</span>}>
        <CardEyebrow>Next action</CardEyebrow>
        <CardTitle id="next-action">{data.next_action.title}</CardTitle>
      </CardHeader>
      <Stack as={CardContent} gap="compact">
        <p className={textRole('body')}>{copy.reason}</p>
        {nextActionEvidence(data)}
        <div>
          <Button asChild variant="primary">
            <ProjectLink href={data.next_action.href}>
              {link}
              <Icon icon={ArrowRight} />
            </ProjectLink>
          </Button>
        </div>
      </Stack>
    </Card>
  );
}

/**
 * The brand's owned citation rate: the share of answers that link to a page
 * the brand owns. The projection's `track.citation_share` is the brand row's
 * `citation_rate`, which the API reads from the run's `owned_citation_rate`,
 * so it carries AI Visibility's name for that metric.
 */
export function Track({ data }: Readonly<{ data: CommandCenter }>) {
  return (
    <Card aria-labelledby="citation-share-track" className="flex h-full flex-col justify-between">
      <CardHeader
        actions={
          data.track.observed_at ? (
            <span className={textRole('label')}>
              {pluralCount(data.track.engine_coverage, 'engine')}
            </span>
          ) : null
        }
      >
        <CardTitle id="citation-share-track">Owned citation rate</CardTitle>
      </CardHeader>
      <Stack as={CardContent} gap="tight">
        <span className={textRole('label')}>Answers that link to a page you own</span>
        <MetricValue
          value={
            data.track.citation_share.value === null
              ? null
              : percentFigure(data.track.citation_share.value)
          }
          label={availabilityLabel(data.track.observed_at ? 'unavailable' : 'not_run')}
        />
        {/* The link shares the last line, so it adds no row of its own. */}
        <Inline className="justify-between">
          {/* No comparable run means no change; the Movement card says so once. */}
          {data.track.observed_at && data.track.citation_share.delta !== null ? (
            <div>
              <Delta value={data.track.citation_share.delta} unit=" pp" {...VS_PREVIOUS_RUN} />
            </div>
          ) : (
            <p className={textRole('caption')}>{data.track.limitations[0]}</p>
          )}
          <Button asChild variant="ghost">
            <ProjectLink href="/visibility?tab=trends">
              Open Trends <Icon icon={ArrowRight} />
            </ProjectLink>
          </Button>
        </Inline>
      </Stack>
    </Card>
  );
}

/**
 * Each engine's change since the comparable run. With nothing comparable yet
 * the card holds one compact note rather than a tall empty block beside its
 * sibling. The note's action opens the Launch audit dialog, where the person
 * confirms the run and its credits (owner, 2026-11-06); nothing starts from
 * here.
 */
export function Movement({ data }: Readonly<{ data: CommandCenter }>) {
  return (
    <Card aria-labelledby="movement" className="h-full">
      <CardHeader>
        <CardTitle id="movement">Movement</CardTitle>
      </CardHeader>
      <CardContent>
        {data.movements.length ? (
          <MovementChart movements={data.movements} />
        ) : (
          <EmptyState
            variant="inline"
            icon={TrendingUp}
            title="No comparable measurement yet"
            description="Needs a second run with the same prompts and engines."
            primary={<LaunchAuditButton variant="secondary" />}
          />
        )}
      </CardContent>
    </Card>
  );
}

/** The shared, reorderable action list. */
export function RankedActionsCard({
  actions,
  pending,
  onMove,
}: Readonly<{
  actions: CommandCenter['actions'];
  pending: boolean;
  onMove: (from: number, to: number) => void;
}>) {
  if (!actions.length)
    return (
      <QueryState
        kind="empty"
        icon={ArrowRight}
        heading="No open actions"
        headingLevel={3}
        description="Run another audit to look for new opportunities."
        action={<ViewAllActions />}
      />
    );
  return (
    <Card aria-labelledby="ranked-actions" className="h-full">
      <CardHeader actions={<ViewAllActions />}>
        <CardTitle id="ranked-actions">Ranked actions</CardTitle>
        <CardDescription>Shared order · drag or use the arrow controls.</CardDescription>
      </CardHeader>
      <CardContent>
        <ReorderList items={actions.map(actionItem)} pending={pending} onMove={onMove} />
      </CardContent>
    </Card>
  );
}

/** What has been resolved since the comparable run. */
export function ProgressProofCard({ data }: Readonly<{ data: CommandCenter }>) {
  return (
    <Card aria-labelledby="progress-proof" className="h-full">
      <CardHeader>
        <CardTitle id="progress-proof">Progress and report proof</CardTitle>
      </CardHeader>
      <CardContent>
        <p className={textRole('body')}>
          {pluralCount(data.resolved_actions.count, 'action')} resolved since the comparable run.
        </p>
      </CardContent>
    </Card>
  );
}

function ViewAllActions() {
  return (
    <Button asChild variant="ghost">
      <ProjectLink href="/agent/actions">
        View all <Icon icon={ArrowRight} />
      </ProjectLink>
    </Button>
  );
}
