import { useMemo } from 'react';

import type { Prompt, PromptStatus } from '@citeladder/contracts';
import { filterPrompts, personaOptions, type PromptFilters } from '@/lib/prompts/filter';

/** The prompts the library shows, its persona options and its per-status counts. */
export function usePromptLibraryView(
  prompts: Prompt[],
  view: Readonly<{
    statusFilter: PromptStatus;
    selectedTopicId: string | null;
    search: string;
    filters: PromptFilters;
  }>,
) {
  const { statusFilter, selectedTopicId, search, filters } = view;
  // Status -> topic -> search/filters, preserving order.
  const byStatus = useMemo(
    () => prompts.filter((prompt) => prompt.status === statusFilter),
    [prompts, statusFilter],
  );
  const byTopic = useMemo(
    () =>
      selectedTopicId === null
        ? byStatus
        : byStatus.filter((prompt) => prompt.topic_id === selectedTopicId),
    [byStatus, selectedTopicId],
  );
  const visible = useMemo(
    () => filterPrompts(byTopic, search, filters),
    [byTopic, search, filters],
  );
  const personas = useMemo(() => personaOptions(prompts), [prompts]);

  const statusCounts = useMemo(() => {
    const counts: Record<PromptStatus, number> = { active: 0, archived: 0 };
    for (const prompt of prompts) counts[prompt.status] += 1;
    return counts;
  }, [prompts]);
  return { visible, personas, statusCounts };
}
