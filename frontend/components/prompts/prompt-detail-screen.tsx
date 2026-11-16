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
import { TextLink } from '@/components/ui/text-link';
import { StepChart } from '@/components/ui/step-chart';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { ClampText } from '@/components/ui/clamp-text';
import { Absence } from '@/components/ui/absence';
import { Disclosure } from '@/components/ui/disclosure';
import { TableCell, TableCellLines, TableRow } from '@/components/ui/table';
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
import { SectionContent, TitledSection } from '@/components/ui/section';

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
 * The chart's data as a table, said once: every run that measured the prompt,
 * newest first. A run with no successful answer is a gap in the line, and a
 * change in measurement conditions is captioned on the run that started the new line.
 */
function RunData({ points }: Readonly<{ points: PromptHistory['points'] }>) {
  const timeZone = useDisplayTimeZone();
  return (
    <Disclosure title={`Show run data (${formatCount(points.length)})`}>
      <DataTable label="Runs that measured this prompt" columns={RUN_DATA_COLUMNS}>
        {[...points].reverse().map((point) => (
          <TableRow key={point.audit_id}>
            <TableCell>
              <TableCellLines
                primary={formatDisplayDate(point.completed_at, timeZone)}
                secondary={point.comparable_with_previous === false ? 'New conditions' : undefined}
              />
            </TableCell>
            <TableCell numeric>
              {point.mention_rate === null ? (
                <Absence state="unavailable" label="No successful answer" />
              ) : (
                formatPercent(point.mention_rate)
              )}
            </TableCell>
            <TableCell numeric>
              {point.owned_citation_rate === null ? (
                <Absence state="not_measured" />
              ) : (
                formatPercent(point.owned_citation_rate)
              )}
            </TableCell>
          </TableRow>
        ))}
      </DataTable>
    </Disclosure>
  );
}

const RUN_DATA_COLUMNS: readonly DataTableColumn[] = [
  { key: 'date', label: 'Run date', kind: 'identity' },
  { key: 'visibility', label: 'Visibility', width: 'figure', kind: 'number' },
  { key: 'owned', label: 'Owned rate', width: 'figure', kind: 'number' },
];

/**
 * Whether this prompt cites you and how that has moved: the latest run's
 * rates first, then visibility and owned citation rate per run, with declared
 * work marked.
 */
function HistoryCard({ history }: Readonly<{ history: PromptHistory }>) {
  const timeZone = useDisplayTimeZone();
  const data = mentionRatePoints(history.points, timeZone);
  const latest = history.points.at(-1);
  // The server's comparison, the same one the prompt table's Change column reads.
  const baselineAt = history.latest?.comparison?.baseline_at ?? null;
  const visibilityDelta = history.latest?.visibility_delta;
  return (
    <TitledSection
      title="Visibility and citations"
      description="Each point is one run that measured this prompt. A run with no successful answer is a gap, and a change in measurement conditions starts a new line."
    >
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
                  ...(visibilityDelta == null
                    ? {}
                    : {
                        delta: <Delta value={visibilityDelta} unit=" pp" />,
                        sub: baselineAt
                          ? `vs ${formatDisplayDate(baselineAt, timeZone)}`
                          : undefined,
                      }),
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
            <RunData points={history.points} />
          </Stack>
        </SectionContent>
      ) : (
        <StateBlock
          kind="empty"
          inline
          message="No run has measured this prompt in this market yet."
        />
      )}
    </TitledSection>
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
