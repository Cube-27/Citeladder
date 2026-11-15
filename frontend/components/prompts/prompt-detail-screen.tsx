import { useMutation, useQuery } from '@tanstack/react-query';
import { ArchiveRestore } from 'lucide-react';
import { useParams } from 'react-router-dom';

import { ActionStatusBadge } from '@/components/agent/action-status-badge';
import { RecordPage } from '@/components/templates/record-page';
import { ActionButton } from '@/components/ui/actions';
import { Button } from '@/components/ui/button';
import { Delta } from '@/components/ui/delta';
import { FigureStrip } from '@/components/ui/figure-strip';
import { FilterBar } from '@/components/ui/filter-bar';
import { Icon } from '@/components/ui/icon';
import { Stack } from '@/components/ui/layout';
import { RungTrail, type TrailStep } from '@/components/ui/rung-trail';
import { TextLink } from '@/components/ui/text-link';
import { StepChart } from '@/components/ui/step-chart';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { ClampText } from '@/components/ui/clamp-text';
import { TableCell, TableRow } from '@/components/ui/table';
import { marketFilter } from '@/components/visibility/visibility-toolbar';
import { agentHandoffHref } from '@/lib/agent/handoff';
import { mutationNoticeForError } from '@/lib/api/mutation-notice';
import { promptsMutations } from '@/lib/api/prompts';
import { useDisplayTimeZone } from '@/lib/display-timezone';
import { formatCount, formatDisplayDate, formatPercent } from '@/lib/format';
import { formatWholePercent } from '@/lib/visibility/dashboard';
import type { PromptHistory } from '@citeladder/contracts';
import { visibilityQueries } from '@/lib/api/visibility-queries';
import { optionalStringUrlCodec, useUrlState } from '@/lib/navigation/url-state';
import { useProjectScope } from '@/lib/project/active-project-scope';
import { useWorkspaceCapability } from '@/lib/project/project-context';
import { useProjectMarkets } from '@/lib/project/use-project-markets';
import {
  implementationEvents,
  mentionRatePoints,
  ownedCitationValues,
} from '@/lib/prompts/history';

import { PromptAnswerStates } from './prompt-answer-states';
import { Notice, readErrorProps } from '@/components/ui/notice';
import { StateBlock } from '@/components/ui/state-block';
import {
  Section,
  SectionContent,
  SectionDescription,
  SectionHeader,
  SectionTitle,
} from '@/components/ui/section';

const BACK = { href: '/prompts', label: 'Back to prompts' } as const;

/** /prompts/:promptId — one prompt's measurements over time, in one market. */
export function PromptDetailScreen() {
  const { promptId = '' } = useParams();
  const { workspaceId, projectId } = useProjectScope();
  const [market, setMarket] = useUrlState('market', optionalStringUrlCodec);
  const markets = useProjectMarkets(projectId, workspaceId);
  const query = useQuery({
    ...visibilityQueries.promptHistory({ workspaceId, projectId }, promptId, {
      market: market ?? undefined,
    }),
    enabled: Boolean(promptId),
  });
  // A single market has nothing to choose, so the row is not drawn empty.
  const marketChoice = marketFilter({ markets, market, onChangeMarket: setMarket });

  const filters = marketChoice ? <FilterBar filters={[marketChoice]} /> : undefined;
  if (query.isError)
    return (
      <RecordPage back={BACK} filters={filters}>
        <StateBlock
          kind="error"
          {...readErrorProps(query)}
          title="Couldn't load this prompt"
          fallback="Check your connection and try again."
        />
      </RecordPage>
    );
  if (!query.data)
    return (
      <RecordPage back={BACK} filters={filters}>
        <StateBlock kind="loading" label="Loading this prompt…" />
      </RecordPage>
    );
  const history = query.data;
  const actionId = history.latest?.action_id ?? null;
  return (
    <RecordPage
      title={history.prompt.text}
      back={BACK}
      actions={actionId ? <ActionHandoff actionId={actionId} /> : undefined}
      filters={filters}
      identity={
        history.prompt.status === 'archived' ? (
          <ArchivedNotice promptId={history.prompt.id} onRestored={() => void query.refetch()} />
        ) : undefined
      }
      aside={<MeasurementTrail history={history} />}
    >
      <HistoryCard history={history} />
      <Implementations history={history} />
      <PromptAnswerStates latest={history.latest} />
    </RecordPage>
  );
}

/** The prompt's Action and the hand-off to the agent: page-level, so in the masthead. */
function ActionHandoff({ actionId }: Readonly<{ actionId: string }>) {
  return (
    <>
      <ActionButton action="openAction" href={`/agent/actions/${actionId}`} />
      <ActionButton action="workWithAgent" href={agentHandoffHref({ actionId })} />
    </>
  );
}

/** An archived prompt says so once, with Restore, as an archived product does. */
function ArchivedNotice({
  promptId,
  onRestored,
}: Readonly<{ promptId: string; onRestored: () => void }>) {
  const { workspaceId, projectId } = useProjectScope();
  const canWrite = useWorkspaceCapability('write');
  const restore = useMutation(promptsMutations.update({ workspaceId, projectId }));
  return (
    <Stack gap="compact">
      <Notice
        tone="warning"
        title="Archived"
        action={
          canWrite ? (
            <Button
              variant="secondary"
              disabled={restore.isPending}
              onClick={() =>
                restore.mutate({ promptId, input: { status: 'active' } }, { onSuccess: onRestored })
              }
            >
              <Icon icon={ArchiveRestore} />
              Restore
            </Button>
          ) : undefined
        }
      >
        Runs no longer ask this prompt.
      </Notice>
      {restore.error ? (
        <Notice
          kind="mutation"
          notice={mutationNoticeForError(restore.error, { action: 'restore the prompt' })}
        />
      ) : null}
    </Stack>
  );
}

/**
 * Every run that measured the prompt, newest first, as rungs: a measured run
 * is done, a run with no successful answer is an unavailable rung, and a
 * change in measurement conditions is said on the run that started the new line.
 */
function MeasurementTrail({ history }: Readonly<{ history: PromptHistory }>) {
  const timeZone = useDisplayTimeZone();
  if (!history.points.length) return null;
  const steps: TrailStep[] = history.points
    .map((point): TrailStep => {
      const visibility = point.mention_rate;
      const owned = point.owned_citation_rate;
      const measured = visibility !== null;
      const ownedRate = owned === null ? 'Owned not measured' : `Owned ${formatPercent(owned)}`;
      const rates = measured
        ? `Visibility ${formatPercent(visibility)} · ${ownedRate}`
        : 'No successful answer: a gap in the line';
      return {
        id: point.audit_id,
        label: formatDisplayDate(point.completed_at, timeZone),
        status: measured ? 'done' : 'unavailable',
        detail: point.comparable_with_previous === false ? `${rates} · New conditions` : rates,
      };
    })
    .reverse();
  return (
    <Section>
      <SectionHeader>
        <SectionTitle>Measurements</SectionTitle>
      </SectionHeader>
      <SectionContent>
        <RungTrail label="Runs that measured this prompt" steps={steps} />
      </SectionContent>
    </Section>
  );
}

type HistoryPoint = PromptHistory['points'][number];

/**
 * The change in visibility since the run before, in points, when the two
 * runs measured under the same conditions and both had answers.
 */
function visibilityChange(points: readonly HistoryPoint[]) {
  const [previous, latest] = points.slice(-2);
  if (!previous || latest?.comparable_with_previous !== true) return null;
  if (previous.mention_rate === null || latest.mention_rate === null) return null;
  return { points: (latest.mention_rate - previous.mention_rate) * 100, since: previous };
}

/**
 * Whether this prompt cites you and how that has moved: the latest run's
 * rates first, then visibility and owned citation rate per run, with declared
 * work marked.
 */
function HistoryCard({ history }: Readonly<{ history: PromptHistory }>) {
  const timeZone = useDisplayTimeZone();
  const data = mentionRatePoints(history.points, timeZone);
  const latest = history.points.at(-1);
  const change = visibilityChange(history.points);
  return (
    <Section>
      <SectionHeader>
        <SectionTitle>Visibility and citations</SectionTitle>
        <SectionDescription>
          Each point is one run that measured this prompt. A run with no successful answer is a gap,
          and a change in measurement conditions starts a new line.
        </SectionDescription>
      </SectionHeader>
      {latest ? (
        <SectionContent>
          <Stack gap="workspace">
            <FigureStrip
              label="Latest measurement"
              segments={[
                {
                  key: 'visibility',
                  label: 'Visibility',
                  value: latest.mention_rate === null ? null : formatPercent(latest.mention_rate),
                  delta: (
                    <Delta
                      value={change?.points ?? null}
                      unit=" pp"
                      missingReason="No comparable run before this one."
                    />
                  ),
                  sub: change
                    ? `vs ${formatDisplayDate(change.since.completed_at, timeZone)}`
                    : undefined,
                },
                {
                  key: 'owned',
                  label: 'Owned citation rate',
                  value:
                    latest.owned_citation_rate === null
                      ? null
                      : formatPercent(latest.owned_citation_rate),
                  sub: formatDisplayDate(latest.completed_at, timeZone),
                },
                {
                  key: 'runs',
                  label: 'Measured runs',
                  value: formatCount(history.points.length),
                },
              ]}
            />
            <StepChart
              label="Visibility over time"
              name="Visibility"
              data={data}
              series={[
                { label: 'Owned citation rate', values: ownedCitationValues(history.points) },
              ]}
              events={implementationEvents(history.implementations, timeZone)}
              eventsLabel="Marked implemented"
              yMax={100}
              yFormat={formatWholePercent}
            />
          </Stack>
        </SectionContent>
      ) : (
        <StateBlock
          kind="empty"
          inline
          message="No run has measured this prompt in this market yet."
        />
      )}
    </Section>
  );
}

/** The Actions measured on this prompt, and when each was marked implemented. */
function Implementations({ history }: Readonly<{ history: PromptHistory }>) {
  const timeZone = useDisplayTimeZone();
  if (!history.implementations.length) return null;
  return (
    <DataTable
      title="Work marked implemented"
      columns={IMPLEMENTATION_COLUMNS}
      footer={
        <p className="type-caption">
          A marker shows when work went live, not that it changed these rates: other changes and
          answer-engine updates can overlap.
        </p>
      }
    >
      {history.implementations.map((item) => (
        <TableRow key={`${item.action_id}:${item.implemented_at}`}>
          <TableCell>
            <ClampText tooltip={item.title}>
              <TextLink href={`/agent/actions/${item.action_id}`} text="inherit">
                {item.title}
              </TextLink>
            </ClampText>
          </TableCell>
          <TableCell>{formatDisplayDate(item.implemented_at, timeZone)}</TableCell>
          <TableCell>
            <ActionStatusBadge status={item.status} />
          </TableCell>
        </TableRow>
      ))}
    </DataTable>
  );
}

const IMPLEMENTATION_COLUMNS: readonly DataTableColumn[] = [
  { key: 'action', label: 'Action', kind: 'identity' },
  { key: 'live', label: 'Live from', width: 'date', kind: 'date' },
  { key: 'status', label: 'Status', width: 'status' },
];
