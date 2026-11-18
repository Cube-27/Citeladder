import { useMutation, type UseQueryResult } from '@tanstack/react-query';
import { UserPlus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { DataTable, type DataTableColumn, type DataTableState } from '@/components/ui/data-table';
import { Stack } from '@/components/ui/layout';
import { Notice, readErrorProps } from '@/components/ui/notice';
import { TitledSection } from '@/components/ui/section';
import { TableActionsCell, TableCell, TableCellLines, TableRow } from '@/components/ui/table';
import { Tag } from '@/components/ui/tag';
import type { ObservedCompetitor } from '@citeladder/contracts';
import { visibilityMutations } from '@/lib/api/visibility-queries';
import { formatCount, pluralCount } from '@/lib/format';
import { useActiveWorkspaceId, useWorkspaceCapability } from '@/lib/project/project-context';

const TITLE = 'Suggested competitors';

/**
 * Competitors the runs observed but the project does not yet track, with the
 * action that adds one to the roster. Every suggestion today is a domain the
 * answers cited repeatedly, so that is what "Found by" says.
 */
export function CompetitorSuggestions({
  projectId,
  suggestionsQuery,
}: Readonly<{
  projectId: string;
  suggestionsQuery: UseQueryResult<ObservedCompetitor[], unknown>;
}>) {
  const workspaceId = useActiveWorkspaceId();
  const acceptMutation = useMutation(
    visibilityMutations.acceptCompetitorSuggestion({ workspaceId, projectId }),
  );
  // Adding a competitor edits the project; a role without write reads the list.
  const canWrite = useWorkspaceCapability('write');
  const rows = suggestionsQuery.data ?? [];
  return (
    <TitledSection
      title={TITLE}
      description="Suggestions never join your competitors until you accept them."
    >
      <Stack>
        {acceptMutation.isError ? (
          <Notice tone="negative">Could not add that competitor. Try again.</Notice>
        ) : null}
        <DataTable
          label={TITLE}
          columns={columns(canWrite)}
          minWidth="md"
          state={tableState(suggestionsQuery)}
        >
          {rows.map((candidate) => (
            <TableRow key={candidate.id}>
              <TableCell>
                <TableCellLines title primary={candidate.name} secondary={candidate.domain} />
              </TableCell>
              <TableCell>
                <Tag>Cited domain</Tag>
              </TableCell>
              <TableCell numeric>{pluralCount(candidate.prompt_count, 'prompt')}</TableCell>
              <TableCell numeric>{formatCount(candidate.engine_count)}</TableCell>
              {canWrite ? (
                <TableActionsCell>
                  <Button
                    variant="secondary"
                    onClick={() => acceptMutation.mutate(candidate.id)}
                    disabled={acceptMutation.isPending}
                    aria-label={`Accept ${candidate.name} as a competitor`}
                  >
                    Accept
                  </Button>
                </TableActionsCell>
              ) : null}
            </TableRow>
          ))}
        </DataTable>
      </Stack>
    </TitledSection>
  );
}

function columns(canWrite: boolean): DataTableColumn[] {
  return [
    { key: 'name', label: 'Name', kind: 'identity' },
    { key: 'found', label: 'Found by', kind: 'status' },
    { key: 'seen', label: 'Seen in', kind: 'number', width: 'metric' },
    { key: 'engines', label: 'Engines', kind: 'number' },
    ...(canWrite ? [{ key: 'actions', label: 'Actions', kind: 'actions' } as const] : []),
  ];
}

/** A failed read says so; only an answered, empty list is "none yet". */
function tableState(
  query: UseQueryResult<ObservedCompetitor[], unknown>,
): DataTableState | undefined {
  if (query.isError)
    return {
      kind: 'error',
      ...readErrorProps(query),
      title: "Couldn't load competitor suggestions",
      fallback: 'The request failed or timed out.',
    };
  if (query.isPending) return { kind: 'loading', label: 'Loading suggestions…' };
  if (!query.data.length)
    return {
      kind: 'empty',
      headingLevel: 3,
      icon: UserPlus,
      heading: 'No repeated citation candidates yet.',
    };
  return undefined;
}
