import { ArrowRight, Download, TrendingUp } from 'lucide-react';
import type { ReactNode } from 'react';
import { LaunchAuditButton } from '@/components/runs/launch-audit-button';
import { MastheadPrimary } from '@/components/ui/masthead-actions';
import { useWorkspaceCapability } from '@/lib/project/project-context';

import { Button } from '@/components/ui/button';
import { Delta } from '@/components/ui/delta';
import { Icon } from '@/components/ui/icon';
import { Inline } from '@/components/ui/layout';
import { ReorderList } from '@/components/ui/reorder-list';
import { TextLink } from '@/components/ui/text-link';
import { StatusMark } from '@/components/ui/status-mark';
import { textRole } from '@/components/ui/typography';
import { Absence } from '@/components/ui/absence';
import { pluralCount } from '@/lib/format';
import type { CommandCenter, Project } from '@citeladder/contracts';
import { comparisonBasis } from '@citeladder/contracts/comparison-reason';
import { DisplayTime } from '@/components/ui/display-time';
import { useEngineCatalog } from '@/lib/providers/engines';

import { ProjectControls } from './dashboard-controls';
import { formatRank } from '@/lib/visibility/dashboard';
import { actionItem, MovementChart, percentFigure, VS_PREVIOUS_RUN } from './dashboard-primitives';
import { ClampText } from '@/components/ui/clamp-text';
import { StateBlock } from '@/components/ui/state-block';
import { FigureStrip, type FigureSegment } from '@/components/ui/figure-strip';
import { WidgetFrame } from './widget-frame';

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
    <WidgetFrame
      id="company-facts"
      title="Company facts"
      // The industry is the project's own data ("General" included), shown as written.
      description={facts.industry.trim() || <Absence state="not_set" label="Industry not set" />}
      link={{ href: '/agent/context', label: 'Edit in Agent context' }}
    >
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
            value: <FactSummary value={offerings.join(', ')} />,
            sub: pluralCount(facts.competitors.length, 'tracked competitor'),
          },
        ]}
      />
    </WidgetFrame>
  );
}

export function DashboardActions({
  activeProject,
  onEditProject,
  downloading,
  onDownload,
  layoutMenu,
  launch = true,
}: Readonly<{
  activeProject: Project;
  onEditProject?: (project: Project) => void;
  downloading: boolean;
  onDownload: () => void;
  /** The layout menu, for members who can edit the Overview. */
  layoutMenu?: ReactNode;
  /** False while the Overview's start card holds Launch run, so it shows once. */
  launch?: boolean;
}>) {
  return (
    // A fragment: the identity band owns the gap between route actions.
    <>
      <ProjectControls activeProject={activeProject} onEditProject={onEditProject} />
      {/* Six controls crowd the bar: More holds Layout and Export PDF at every width (masthead-actions.tsx). */}
      <div data-in-more="" hidden>
        {layoutMenu}
        <PdfButton downloading={downloading} onDownload={onDownload} />
      </div>
      {/* The one primary: the run the Overview's figures come from. */}
      {launch ? (
        <MastheadPrimary>
          <LaunchAuditButton />
        </MastheadPrimary>
      ) : null}
    </>
  );
}

/** A free-text fact on one line, with the whole text behind a tooltip. */
function FactSummary({ value }: Readonly<{ value: string }>) {
  if (!value.trim()) return <Absence state="not_set" />;
  return (
    // A value, so the primary ink under its grey label, not grey on grey.
    <ClampText className={textRole('body')}>{value}</ClampText>
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
  rank: { format: formatRank, unit: '', precision: 0, policy: 'lower-is-better' },
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
  // A partial change names the answers it uses, once, in the first figure's hint.
  const note = basis?.kind === 'matched_subset' ? basis.note : undefined;
  return (
    <WidgetFrame
      id="project-state"
      title="Project state"
      fill="figure"
      status={
        data.measurement ? (
          <StatusMark tone="positive">Citations measured</StatusMark>
        ) : (
          <StatusMark>Not run</StatusMark>
        )
      }
    >
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
          ownedCitationSegment(data),
        ]}
      />
    </WidgetFrame>
  );
}

/**
 * The brand's owned citation rate, Project state's fourth figure (owner,
 * 2026-11-19): the share of answers that link to a page the brand owns. The
 * projection's `track.citation_share` is the brand row's `citation_rate`,
 * which the API reads from the run's `owned_citation_rate`, so it carries AI
 * Visibility's name for that metric. Its label links to Insights.
 */
function ownedCitationSegment({ track }: Pick<CommandCenter, 'track'>): FigureSegment {
  const observed = Boolean(track.observed_at);
  return {
    key: 'citation-share',
    label: 'Owned citation rate',
    action: { href: '/insights?metric=owned_citation_rate', label: 'Open Insights' },
    caption: observed ? pluralCount(track.engine_coverage, 'engine') : undefined,
    value: track.citation_share.value === null ? null : percentFigure(track.citation_share.value),
    missingState: observed ? 'unavailable' : 'not_run',
    // No comparable run means no change; the Movement card says so once.
    delta:
      observed && track.citation_share.delta !== null ? (
        <Delta value={track.citation_share.delta} unit=" pp" {...VS_PREVIOUS_RUN} />
      ) : undefined,
    // Why no change is shown, or which answers a partial change uses.
    sub: track.limitations[0],
  };
}

/**
 * Each engine's change since the comparable run. With nothing comparable yet
 * the card holds one compact note rather than a tall empty block beside its
 * sibling. The note names the masthead's Launch run, whose dialog is where
 * the person confirms the run and its credits (owner, 2026-11-06). A
 * comparable run that produced no movement rows is a different answer: there
 * is nothing to launch, only no change to show.
 */
export function Movement({ data }: Readonly<{ data: CommandCenter }>) {
  return (
    <WidgetFrame id="movement" title="Movement" fill={data.movements.length ? 'chart' : 'list'}>
      {data.movements.length ? (
        <MovementChart movements={data.movements} />
      ) : (
        <NoMovement measurement={data.measurement} />
      )}
    </WidgetFrame>
  );
}

function NoMovement({ measurement }: Readonly<{ measurement: CommandCenter['measurement'] }>) {
  const canRun = useWorkspaceCapability('run');
  const note = (message: string) => (
    <StateBlock kind="empty" inline icon={TrendingUp} message={message} />
  );
  // Nothing to compare yet: the masthead's Launch run, when offered, measures the next one.
  const declined = (message: string) =>
    note(canRun ? `${message} Launch run to measure movement.` : message);
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
  return (
    <WidgetFrame
      id="ranked-actions"
      title="Ranked actions"
      link={{ href: '/actions', label: 'View all' }}
    >
      {actions.length ? (
        <ReorderList items={actions.map(actionItem)} pending={pending} onMove={onMove} />
      ) : (
        <StateBlock kind="empty" icon={ArrowRight} heading="No open actions" />
      )}
    </WidgetFrame>
  );
}
