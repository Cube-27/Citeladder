import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';

import { ActionStatusBadge } from '@/components/agent/action-status-badge';
import { RecordPage } from '@/components/templates/record-page';
import { FilterBar } from '@/components/ui/filter-bar';
import { RungTrail, type TrailStep } from '@/components/ui/rung-trail';
import { TextLink } from '@/components/ui/text-link';
import { StepChart } from '@/components/ui/step-chart';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { ClampText } from '@/components/ui/clamp-text';
import { TableCell, TableRow } from '@/components/ui/table';
import { marketFilter } from '@/components/visibility/visibility-toolbar';
import { useDisplayTimeZone } from '@/lib/display-timezone';
import { formatDisplayDate, formatPercent, pluralCount } from '@/lib/format';
import { formatWholePercent } from '@/lib/visibility/dashboard';
import type { PromptHistory } from '@citeladder/contracts';
import { visibilityQueries } from '@/lib/api/visibility-queries';
import { optionalStringUrlCodec, useUrlState } from '@/lib/navigation/url-state';
import { useProjectScope } from '@/lib/project/active-project-scope';
import { useProjectMarkets } from '@/lib/project/use-project-markets';
import {
  implementationEvents,
  mentionRatePoints,
  ownedCitationValues,
} from '@/lib/prompts/history';

import { PromptAnswerStates } from './prompt-answer-states';
import { readErrorProps } from '@/components/ui/notice';
import { StateBlock } from '@/components/ui/state-block';
import {
  Section,
  SectionContent,
  SectionDescription,
  SectionHeader,
  SectionTitle,
  TitledSection,
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
  return (
    <RecordPage
      title={history.prompt.text}
      back={BACK}
      filters={filters}
      identity={<PromptIdentity history={history} />}
      aside={<MeasurementTrail history={history} />}
    >
      <HistoryCard history={history} />
      <Implementations history={history} />
      <PromptAnswerStates latest={history.latest} />
    </RecordPage>
  );
}

/**
 * The prompt's facts. The question itself is named once, by the masthead,
 * which gives the whole text in its tooltip when it cuts it.
 */
function PromptIdentity({ history }: Readonly<{ history: PromptHistory }>) {
  const archived = history.prompt.status === 'archived';
  return (
    <p className="type-caption">
      {pluralCount(history.points.length, 'measured run')}
      {archived ? ' · Archived: runs no longer ask it' : ''}
    </p>
  );
}

/**
 * Every run that measured the prompt, newest first, as rungs: a measured run
 * is done, a run with no successful answer is a hatched gap, and a change in
 * measurement conditions is said on the run that started the new line.
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

/** Visibility and owned citation rate per run, with declared work marked. */
function HistoryCard({ history }: Readonly<{ history: PromptHistory }>) {
  const timeZone = useDisplayTimeZone();
  const data = mentionRatePoints(history.points, timeZone);
  return (
    <Section>
      <SectionHeader>
        <SectionTitle>Over time</SectionTitle>
        <SectionDescription>
          Each point is one run that measured this prompt. A run with no successful answer is a gap,
          and a change in measurement conditions starts a new line.
        </SectionDescription>
      </SectionHeader>
      <SectionContent>
        {data.length ? (
          <StepChart
            label="Visibility over time"
            name="Visibility"
            data={data}
            series={[{ label: 'Owned citation rate', values: ownedCitationValues(history.points) }]}
            events={implementationEvents(history.implementations, timeZone)}
            eventsLabel="Marked implemented"
            yMax={100}
            yFormat={formatWholePercent}
          />
        ) : (
          <StateBlock
            kind="empty"
            inline
            message="No run has measured this prompt in this market yet."
          />
        )}
      </SectionContent>
    </Section>
  );
}

/** The Actions measured on this prompt, and when each was marked implemented. */
function Implementations({ history }: Readonly<{ history: PromptHistory }>) {
  const timeZone = useDisplayTimeZone();
  if (!history.implementations.length) return null;
  return (
    <TitledSection title="Work marked implemented">
      <DataTable
        label="Work marked implemented"
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
              <ClampText lines={1} tooltip={item.title}>
                <TextLink href={`/agent/actions/${item.action_id}`}>{item.title}</TextLink>
              </ClampText>
            </TableCell>
            <TableCell>{formatDisplayDate(item.implemented_at, timeZone)}</TableCell>
            <TableCell>
              <ActionStatusBadge status={item.status} />
            </TableCell>
          </TableRow>
        ))}
      </DataTable>
    </TitledSection>
  );
}

const IMPLEMENTATION_COLUMNS: readonly DataTableColumn[] = [
  { key: 'action', label: 'Action', kind: 'identity' },
  { key: 'live', label: 'Live from', width: 'date', kind: 'date' },
  { key: 'status', label: 'Status', width: 'status' },
];
