import { useMutation, type UseQueryResult } from '@tanstack/react-query';

import { textRole } from '@/components/ui/typography';
import { Inline, Stack } from '@/components/ui/layout';
import { ledgerClasses, ledgerItemClasses } from '@/components/ui/workspace';
import type { ObservedCompetitor } from '@citeladder/contracts';
import { Button } from '@/components/ui/button';
import { visibilityMutations } from '@/lib/api/visibility-queries';
import { useActiveWorkspaceId, useWorkspaceCapability } from '@/lib/project/project-context';
import { Notice } from '@/components/ui/notice';
import { StateBlock } from '@/components/ui/state-block';
import { Section, SectionDescription, SectionHeader, SectionTitle } from '@/components/ui/section';

/**
 * Competitors the runs observed but the project does not yet track, with the
 * action that adds one to the roster.
 *
 * This module also used to own the Visibility dashboard's "Prompt analysis"
 * card. Prompt results now live on the prompt rows in the Prompts section,
 * where the prompt is the object rather than a detail of a measurement.
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

  return (
    <Section aria-labelledby="competitor-suggestions">
      <SectionHeader>
        <SectionTitle id="competitor-suggestions">Competitor suggestions</SectionTitle>
        <SectionDescription>
          Observed repeatedly in third-party citations. Verify relevance before adding.
        </SectionDescription>
      </SectionHeader>
      <Stack>
        <SuggestionRows
          suggestionsQuery={suggestionsQuery}
          adding={acceptMutation.isPending}
          onAdd={canWrite ? (candidateId) => acceptMutation.mutate(candidateId) : undefined}
        />
        {acceptMutation.isError ? (
          <Notice tone="negative">Could not add that competitor. Try again.</Notice>
        ) : null}
      </Stack>
    </Section>
  );
}

function SuggestionRows({
  suggestionsQuery,
  adding,
  onAdd,
}: Readonly<{
  suggestionsQuery: UseQueryResult<ObservedCompetitor[], unknown>;
  adding: boolean;
  /** Adds a candidate to the roster; omitted for a role that may not. */
  onAdd?: (candidateId: string) => void;
}>) {
  return (
    <>
      {suggestionsQuery.isError ? (
        <Notice
          kind="read"
          error={suggestionsQuery.error}
          fallback="Could not load competitor suggestions."
          onRetry={() => void suggestionsQuery.refetch()}
          pending={suggestionsQuery.isFetching}
        />
      ) : null}
      {suggestionsQuery.data?.length ? (
        <ul className={ledgerClasses()}>
          {suggestionsQuery.data.map((candidate) => (
            <Inline
              as="li"
              key={candidate.id}
              className={ledgerItemClasses('type-body text-ink-2 flex-wrap justify-between')}
            >
              <Stack gap="tight">
                <p className={textRole('body')}>{candidate.name}</p>
                <p className="type-caption">
                  {candidate.domain} · {candidate.prompt_count} prompts / {candidate.engine_count}{' '}
                  engines
                </p>
              </Stack>
              {onAdd ? (
                <Button variant="secondary" onClick={() => onAdd(candidate.id)} disabled={adding}>
                  Add competitor
                </Button>
              ) : null}
            </Inline>
          ))}
        </ul>
      ) : null}
      {/* Only an answered, empty list is "none yet"; a failed read says so above. */}
      {suggestionsQuery.isSuccess && !suggestionsQuery.data.length ? (
        <StateBlock kind="empty" inline message="No repeated citation candidates yet." />
      ) : null}
    </>
  );
}
