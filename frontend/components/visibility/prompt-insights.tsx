import { useMutation, type UseQueryResult } from '@tanstack/react-query';
import { UserPlus, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { DataTable, type DataTableColumn, type DataTableState } from '@/components/ui/data-table';
import { BrandMark } from '@/components/ui/brand-mark';
import { Inline, Stack } from '@/components/ui/layout';
import { Notice, readErrorProps } from '@/components/ui/notice';
import { TitledSection } from '@/components/ui/section';
import { TableActionsCell, TableCell, TableCellLines, TableRow } from '@/components/ui/table';
import { Tag } from '@/components/ui/tag';
import { useToast } from '@/components/ui/toast';
import type { ObservedCompetitor } from '@citeladder/contracts';
import { visibilityMutations } from '@/lib/api/visibility-queries';
import { formatCount, pluralCount } from '@/lib/format';
import { useActiveWorkspaceId, useWorkspaceCapability } from '@/lib/project/project-context';

const TITLE = 'Suggested competitors';

/** What found a suggestion, and how often: citations of its domain, or prompts naming it. */
const FOUND_BY = {
  cited_domain: 'Cited domain',
  named_in_answers: 'Named in answers',
} satisfies Record<ObservedCompetitor['kind'], string>;

function seenIn(candidate: ObservedCompetitor): string {
  switch (candidate.kind) {
    case 'cited_domain':
      return candidate.citation_count === null
        ? pluralCount(candidate.prompt_count, 'prompt')
        : pluralCount(candidate.citation_count, 'citation');
    case 'named_in_answers':
      return pluralCount(candidate.prompt_count, 'prompt');
    default: {
      const unknown: never = candidate;
      return unknown;
    }
  }
}

const engines = ({ engine_count: count, engine_total: total }: ObservedCompetitor) =>
  total === null ? formatCount(count) : `${formatCount(count)} of ${formatCount(total)}`;

/**
 * Competitors the runs observed but the project does not yet track: a domain
 * the answers cited repeatedly or a name they used across prompts and engines.
 * Accept adds one to the roster; Reject keeps it from being suggested again.
 */
export function CompetitorSuggestions({
  projectId,
  suggestionsQuery,
}: Readonly<{
  projectId: string;
  suggestionsQuery: UseQueryResult<ObservedCompetitor[], unknown>;
}>) {
  const workspaceId = useActiveWorkspaceId();
  const { notify } = useToast();
  const acceptMutation = useMutation(
    visibilityMutations.acceptCompetitorSuggestion({ workspaceId, projectId }),
  );
  const rejectMutation = useMutation(
    visibilityMutations.rejectCompetitorSuggestion({ workspaceId, projectId }),
  );
  // Adding a competitor edits the project; a role without write reads the list.
  const canWrite = useWorkspaceCapability('write');
  const rows = suggestionsQuery.data ?? [];
  const deciding = acceptMutation.isPending || rejectMutation.isPending;
  return (
    <TitledSection
      title={TITLE}
      description="Suggestions never join your competitors until you accept them."
    >
      <Stack>
        {acceptMutation.isError ? (
          <Notice tone="negative">Could not add that competitor. Try again.</Notice>
        ) : null}
        {rejectMutation.isError ? (
          <Notice tone="negative">Could not reject that suggestion. Try again.</Notice>
        ) : null}
        <DataTable
          label={TITLE}
          columns={columns(canWrite)}
          rowLines={2}
          state={tableState(suggestionsQuery)}
        >
          {rows.map((candidate) => (
            <TableRow key={candidate.id}>
              <TableCell>
                <Inline as="span">
                  <BrandMark
                    name={candidate.name}
                    websiteUrl={
                      candidate.kind === 'cited_domain' ? `https://${candidate.domain}` : null
                    }
                  />
                  <TableCellLines
                    title
                    primary={candidate.name}
                    secondary={candidate.kind === 'cited_domain' ? candidate.domain : undefined}
                  />
                </Inline>
              </TableCell>
              <TableCell>
                <Tag>{FOUND_BY[candidate.kind]}</Tag>
              </TableCell>
              <TableCell numeric>{seenIn(candidate)}</TableCell>
              <TableCell numeric>{engines(candidate)}</TableCell>
              {canWrite ? (
                <TableActionsCell>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      acceptMutation.mutate(candidate.id, {
                        onSuccess: () => notify(`${candidate.name} added to your competitors`),
                      })
                    }
                    disabled={deciding}
                    aria-label={`Accept ${candidate.name} as a competitor`}
                  >
                    Accept
                  </Button>
                  <Button
                    variant="quiet"
                    onClick={() =>
                      rejectMutation.mutate(candidate.id, {
                        onSuccess: () => notify(`${candidate.name} won't be suggested again`),
                      })
                    }
                    disabled={deciding}
                    aria-label={`Reject ${candidate.name} as a competitor`}
                  >
                    <Icon icon={X} />
                    Reject
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
    { key: 'found', label: 'Found by', kind: 'status', width: 'category' },
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
      heading: 'No suggested competitors yet.',
    };
  return undefined;
}
