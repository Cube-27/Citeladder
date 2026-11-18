import { useMutation, useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { promptsMutations, promptsQueries } from '@/lib/api/prompts';
import type { PromptSet } from '@citeladder/contracts';
import { useProjectScope } from '@/lib/project/active-project-scope';

import { libraryOrder, mainPromptSet, rowSetNames } from './prompt-sets';

/**
 * The active project's prompt library (F7): every prompt of every set, with
 * each set's name, and the main brand set that adds and generation go to.
 *
 * The active project may already embed its sets (`project.prompt_sets`);
 * otherwise we list them and, if no brand set exists, `ensurePromptSet`
 * creates one. Local create attempts serialize per project. The list query
 * is the source of truth once loaded so a freshly-created set is picked up.
 */
export function usePromptSet() {
  const { workspaceId, projectId, project } = useProjectScope();
  const scope = { workspaceId, projectId };

  const listQuery = useQuery(promptsQueries.sets(scope));
  // The embedded prompt sets render the table until the list (and its form bounds) loads.
  const embedded = project.prompt_sets;
  const sets = listQuery.data?.prompt_sets ?? embedded;
  const promptSet: PromptSet | null = mainPromptSet(sets);
  const ordered = useMemo(() => libraryOrder(sets), [sets]);
  const prompts = useMemo(() => ordered.flatMap((set) => set.prompts), [ordered]);
  const setNames = useMemo(() => rowSetNames(sets), [sets]);
  // Commerce measures its prompts as a shelf, never one prompt at a time.
  const commerceSetIds: ReadonlySet<string> = useMemo(
    () => new Set(sets.filter((set) => set.kind === 'commerce').map((set) => set.id)),
    [sets],
  );

  const createMutation = useMutation(promptsMutations.ensureSet(scope));

  const ensurePromptSet = useCallback((): Promise<PromptSet> => {
    if (promptSet) return Promise.resolve(promptSet);
    return createMutation.mutateAsync();
  }, [promptSet, createMutation]);

  return {
    projectId,
    promptSet,
    prompts,
    setNames,
    commerceSetIds,
    /** Server-enforced bounds of the prompt forms; null until the list loads. */
    limits: listQuery.data?.limits ?? null,
    isLoading: listQuery.isLoading && !embedded.length,
    /** The list read's failure; null unless it failed. */
    error: listQuery.error,
    retry: () => void listQuery.refetch(),
    retrying: listQuery.isFetching,
    ensurePromptSet,
    isEnsuring: createMutation.isPending,
  };
}
