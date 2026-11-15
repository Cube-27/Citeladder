import { ArrowRight, Download, TrendingUp } from 'lucide-react';
import type { ReactNode } from 'react';
import { ProjectLink } from '@/components/ui/project-link';
import { LaunchAuditButton } from '@/components/runs/launch-audit-button';

import { Tag, TagGroup } from '@/components/ui/tag';
import { Button } from '@/components/ui/button';
import { Delta } from '@/components/ui/delta';
import { Icon } from '@/components/ui/icon';
import { Inline } from '@/components/ui/layout';
import { ReorderList } from '@/components/ui/reorder-list';
import { TextLink } from '@/components/ui/text-link';
import { textRole } from '@/components/ui/typography';
import { Absence } from '@/components/ui/absence';
import { pluralCount } from '@/lib/format';
import type { CommandCenter, Project } from '@citeladder/contracts';
import { comparisonBasis } from '@citeladder/contracts/comparison-reason';
import { DisplayTime } from '@/components/ui/display-time';
import { useEngineCatalog } from '@/lib/providers/engines';

import { ProjectControls } from './dashboard-controls';
import {
  actionItem,
  MovementChart,
  percentFigure,
  rankFigure,
  VS_PREVIOUS_RUN,
} from './dashboard-primitives';
import { ClampText } from '@/components/ui/table';
import { StateBlock } from '@/components/ui/state-block';
import {
  Section,
  SectionContent,
  SectionDescription,
  SectionHeader,
  SectionTitle,
} from '@/components/ui/section';
import { FigureStrip, type FigureSegment } from '@/components/ui/figure-strip';

/**
 * One line over the Overview: the site, and the run it was last tracked in
 * with its engines. The sidebar's project switcher already names the project,
 * so the line does not repeat the name or the logo.
 */
/** The site as a link target: an http(s) URL, or null when it is anything else. */
function websiteHref(website: string): string | null {
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(website) ? website : `https://${website}`;
  if (!URL.canParse(candidate)) return null;
  const url = new URL(candidate);
  return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
}

export function ProjectMeta({ data }: Readonly<{ data: CommandCenter }>) {
  const website = data.project.website_url;
  const measurement = data.measurement;
  const engines = useEngineCatalog();
  if (!website && !measurement) return null;
  const href = website ? websiteHref(website) : null;
  const shown = website?.replace(/^https?:\/\//i, '').replace(/\/$/, '');
  return (
    <Inline as="p" gap="meta" className={textRole('caption')}>
      {href ? (
        <TextLink variant="external" text="caption" tone="muted" href={href} className="min-w-0">
          <span className="truncate" title={shown}>
            {shown}
          </span>
        </TextLink>
      ) : null}
      {website && !href ? (
        <span className="truncate" title={shown}>
          {shown}
        </span>
      ) : null}
      {measurement ? (
        <span>
          Tracked <DisplayTime value={measurement.completed_at} /> ·{' '}
          {measurement.logical_engines.map(engines.label).join(', ')}
        </span>
      ) : null}
    </Inline>
  );
}

export function CompanyFacts({ data }: Readonly<{ data: CommandCenter }>) {
  const facts = data.facts;
  const offerings = facts.products_services.filter((label) => label.trim());
  return (
    <Section aria-labelledby="company-facts" className="h-full">
      <SectionHeader
        actions={
          <>
            <span className={textRole('body', 'text-ink-2')}>
              {facts.industry || 'Industry not set'}
            </span>
            <Button asChild variant="quiet">
              <ProjectLink href="/agent/context">
                Edit in Agent context <Icon icon={ArrowRight} />
              </ProjectLink>
            </Button>
          </>
        }
      >
        <SectionTitle id="company-facts">Company facts</SectionTitle>
      </SectionHeader>
      <SectionContent>
        <FigureStrip
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
                <Absence state="not_set" />
              ),
              sub: pluralCount(facts.competitors.length, 'tracked competitor'),
            },
          ]}
        />
      </SectionContent>
    </Section>
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
  if (!value.trim()) return <Absence state="not_set" />;
  return (
    // A value, so the primary ink under its grey label, not grey on grey.
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
}>): FigureSegment {
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
  const basis = data.measurement
    ? comparisonBasis({
        status: data.measurement.comparison_status,
        answers: data.measurement.comparison_answers,
      })
    : null;
  // A partial change names the answers it uses, once, under the first figure.
  const note = basis?.kind === 'matched_subset' ? basis.note : undefined;
  return (
    <Section aria-labelledby="project-state" className="h-full">
      <SectionHeader actions={<Tag>{data.measurement ? 'Citation-capable audit' : 'Not run'}</Tag>}>
        <SectionTitle id="project-state">Project state</SectionTitle>
      </SectionHeader>
      <SectionContent>
        <FigureStrip
          segments={[
            {
              ...stateSegment({
                key: 'visibility',
                label: 'Visibility',
                metric: data.state.visibility,
                kind: 'rate',
              }),
              sub: note,
            },
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
      </SectionContent>
    </Section>
  );
}

/**
 * The brand's owned citation rate: the share of answers that link to a page
 * the brand owns. The projection's `track.citation_share` is the brand row's
 * `citation_rate`, which the API reads from the run's `owned_citation_rate`,
 * so it carries AI Visibility's name for that metric.
 */
export function Track({ data }: Readonly<{ data: CommandCenter }>) {
  const { track } = data;
  const observed = Boolean(track.observed_at);
  return (
    <Section aria-labelledby="citation-share-track" className="h-full">
      <SectionHeader
        actions={
          <Button asChild variant="quiet">
            <ProjectLink href="/visibility?tab=trends">
              Open Trends <Icon icon={ArrowRight} />
            </ProjectLink>
          </Button>
        }
      >
        <SectionTitle id="citation-share-track">Owned citation rate</SectionTitle>
        <SectionDescription>Answers that link to a page you own</SectionDescription>
      </SectionHeader>
      <SectionContent>
        <FigureStrip
          segments={[
            {
              key: 'citation-share',
              label: observed
                ? `Across ${pluralCount(track.engine_coverage, 'engine')}`
                : 'All engines',
              value:
                track.citation_share.value === null
                  ? null
                  : percentFigure(track.citation_share.value),
              missingLabel: observed ? 'Unavailable' : 'Not run',
              // No comparable run means no change; the Movement card says so once.
              delta:
                observed && track.citation_share.delta !== null ? (
                  <Delta value={track.citation_share.delta} unit=" pp" {...VS_PREVIOUS_RUN} />
                ) : undefined,
              // Why no change is shown, or which answers a partial change uses.
              sub: track.limitations[0],
            },
          ]}
        />
      </SectionContent>
    </Section>
  );
}

/**
 * Each engine's change since the comparable run. With nothing comparable yet
 * the card holds one compact note rather than a tall empty block beside its
 * sibling. The note's action opens the Launch run dialog, where the person
 * confirms the run and its credits (owner, 2026-11-06); nothing starts from
 * here. A comparable run that produced no movement rows is a different
 * answer: there is nothing to launch, only no change to show.
 */
export function Movement({ data }: Readonly<{ data: CommandCenter }>) {
  return (
    <Section aria-labelledby="movement" className="h-full">
      <SectionHeader>
        <SectionTitle id="movement">Movement</SectionTitle>
      </SectionHeader>
      <SectionContent>
        {data.movements.length ? (
          <MovementChart movements={data.movements} />
        ) : (
          <NoMovement measurement={data.measurement} />
        )}
      </SectionContent>
    </Section>
  );
}

function NoMovement({ measurement }: Readonly<{ measurement: CommandCenter['measurement'] }>) {
  const note = (message: string) => (
    <StateBlock kind="empty" inline icon={TrendingUp} message={message} />
  );
  if (!measurement) return declined('No measured run yet.');
  const basis = comparisonBasis({
    status: measurement.comparison_status,
    answers: measurement.comparison_answers,
  });
  switch (basis.kind) {
    case 'comparable':
      return note('No movement to show');
    case 'matched_subset':
      return note(`${basis.note}; per-engine movement needs a fully comparable run.`);
    case 'declined':
      return declined(basis.reason);
    default: {
      const unreachable: never = basis;
      return unreachable;
    }
  }
}

function declined(message: string) {
  return (
    <StateBlock
      kind="empty"
      inline
      icon={TrendingUp}
      message={message}
      action={<LaunchAuditButton variant="secondary" />}
    />
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
      <StateBlock
        kind="empty"
        icon={ArrowRight}
        heading="No open actions"
        headingLevel={3}
        description="Run another audit to look for new opportunities."
        action={<ViewAllActions />}
      />
    );
  return (
    <Section aria-labelledby="ranked-actions" className="h-full">
      <SectionHeader actions={<ViewAllActions />}>
        <SectionTitle id="ranked-actions">Ranked actions</SectionTitle>
        <SectionDescription>Shared order · drag or use the arrow controls.</SectionDescription>
      </SectionHeader>
      <SectionContent>
        <ReorderList items={actions.map(actionItem)} pending={pending} onMove={onMove} />
      </SectionContent>
    </Section>
  );
}

/** What has been resolved since the comparable run. */
export function ProgressProofCard({ data }: Readonly<{ data: CommandCenter }>) {
  return (
    <Section aria-labelledby="progress-proof" className="h-full">
      <SectionHeader>
        <SectionTitle id="progress-proof">Progress and report proof</SectionTitle>
      </SectionHeader>
      <SectionContent>
        <p className={textRole('body', 'text-ink-2')}>
          {pluralCount(data.resolved_actions.count, 'action')} resolved since the comparable run.
        </p>
      </SectionContent>
    </Section>
  );
}

function ViewAllActions() {
  return (
    <Button asChild variant="quiet">
      <ProjectLink href="/agent/actions">
        View all <Icon icon={ArrowRight} />
      </ProjectLink>
    </Button>
  );
}
