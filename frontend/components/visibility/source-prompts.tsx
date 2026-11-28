import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { EngineBrandMark } from '@/components/ui/engine-mark';
import { Icon } from '@/components/ui/icon';
import type { EvidenceSubject } from '@/components/runs/answer-dialog';
import { useAnswerDialog } from '@/components/runs/answer-link';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { queryTableState } from '@/components/ui/state-block';
import { Inline } from '@/components/ui/layout';
import { TableCell, TableCellLines, TableRow } from '@/components/ui/table';
import { MarkStack, type StackedMark } from '@/components/ui/mark-stack';
import { Text } from '@/components/ui/typography';
import { Absence } from '@/components/ui/absence';
import type {
  VisibilityEvidenceResponse,
  VisibilityExecutionEvidence,
} from '@citeladder/contracts';
import { MessageSquare, MessageSquareText } from '@/lib/icons';
import { visibilityQueries } from '@/lib/api/visibility-queries';
import { useEngineCatalog } from '@/lib/providers/engines';
import type { SourceFilters } from '@/components/visibility/source-rows';
import { count, hostOf, sinceLabel } from '@/lib/visibility/sources';
import type { SourceQueries } from '@/lib/visibility/use-source-analysis';
import { EVIDENCE_LIMIT } from '@/lib/visibility/use-visibility-dashboard';

function ObservedNone() {
  return (
    <Text variant="caption" numeric>
      0
    </Text>
  );
}

const MAX_CHIPS = 3;

export function SourcePrompts({
  filters,
  queries,
  url,
}: Readonly<{
  filters: SourceFilters;
  queries: SourceQueries;
  url: string;
}>) {
  const params = {
    audit_id: queries.selectedRunIds ? undefined : (queries.activeRunId ?? undefined),
    audit_ids: queries.selectedRunIds,
    engine: filters.engine === 'all' ? undefined : filters.engine,
    topic: queries.topic,
    cohort: filters.cohort,
    url,
  };
  const query = useQuery({
    ...visibilityQueries.evidence(
      { workspaceId: queries.workspaceId, projectId: queries.projectId },
      params,
    ),
    enabled: Boolean(queries.activeRunId),
  });

  const answerDialog = useAnswerDialog();

  return (
    <>
      <DataTable
        title="Prompts"
        columns={COLUMNS}
        {...promptsState(query)}
        busy={{ active: query.isFetching, label: 'Updating prompts' }}
        footer={query.data?.truncated ? `Newest ${EVIDENCE_LIMIT} shown` : null}
      >
        {(query.data?.items ?? []).map((item) => (
          <PromptRow key={item.analysis_id} item={item} onOpenAnswer={answerDialog.open} />
        ))}
      </DataTable>
      {answerDialog.dialog}
    </>
  );
}

const COLUMNS: readonly DataTableColumn[] = [
  { key: 'prompt', label: 'Prompt' },
  { key: 'citations', label: 'Citations', width: 'figure', kind: 'number' },
  { key: 'mentioned', label: 'Mentioned', width: 'status', desktopOnly: true },
  { key: 'sources', label: 'Sources', width: 'status', desktopOnly: true },
  { key: 'created', label: 'Created', width: 'figure', kind: 'date', desktopOnly: true },
  { key: 'open', label: 'Open', width: 'status', hideLabel: true },
];

function promptsState(query: UseQueryResult<VisibilityEvidenceResponse, unknown>) {
  return queryTableState(query, {
    subject: 'the tracked prompts',
    empty: (data) =>
      data.items.length
        ? undefined
        : {
            kind: 'empty',
            headingLevel: 3,
            icon: MessageSquare,
            heading: 'No tracked prompts in this selection used this source',
          },
  });
}

function PromptRow({
  item,
  onOpenAnswer,
}: Readonly<{
  item: VisibilityExecutionEvidence;
  onOpenAnswer: (subject: EvidenceSubject) => void;
}>) {
  const engines = useEngineCatalog();
  return (
    <TableRow>
      <TableCell>
        <Inline as="span">
          <EngineBrandMark placement="row" engine={item.logical_engine} />
          <TableCellLines
            primary={item.prompt_text || 'Untitled prompt'}
            secondary={engines.label(item.logical_engine)}
          />
        </Inline>
      </TableCell>
      <TableCell numeric>{count(item.citations.length) ?? '0'}</TableCell>
      <TableCell desktopOnly>
        <MentionChips item={item} />
      </TableCell>
      <TableCell desktopOnly>
        <SourceChips item={item} />
      </TableCell>
      <TableCell numeric desktopOnly>
        {sinceLabel(item.completed_at) ?? <Absence />}
      </TableCell>
      <TableCell>
        <Button
          variant="quiet"
          onClick={() =>
            onOpenAnswer({
              id: item.task_id,
              prompt_text: item.prompt_text,
              prompt_index: item.prompt_index,
              prompt_id: item.prompt_id,
            })
          }
        >
          <Icon icon={MessageSquareText} />
          Open answer
        </Button>
      </TableCell>
    </TableRow>
  );
}

function MentionChips({ item }: Readonly<{ item: VisibilityExecutionEvidence }>) {
  const named = [...new Map(item.mentions.map((one) => [one.name, one])).values()];
  if (!named.length) return <ObservedNone />;
  return (
    <MarkStack
      marks={named.slice(0, MAX_CHIPS).map((mention) => ({
        key: `${mention.kind}:${mention.name}`,
        tip: mention.name,
        mark: {
          name: mention.name || 'Brand',
          logoUrl: mention.logo_url,
          websiteUrl: mention.website_url,
        },
      }))}
      more={named.length - MAX_CHIPS}
    />
  );
}

function SourceChips({ item }: Readonly<{ item: VisibilityExecutionEvidence }>) {
  const hosts = [...new Set(item.citations.flatMap((citation) => hostOf(citation.url) || []))];
  if (!hosts.length) return <ObservedNone />;
  return (
    <MarkStack
      marks={hosts.slice(0, MAX_CHIPS).map((host): StackedMark => ({
        key: host,
        tip: host,
        mark: { name: host, websiteUrl: `https://${host}`, entity: 'site' },
      }))}
      more={hosts.length - MAX_CHIPS}
    />
  );
}
