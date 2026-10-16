/**
 * Prompt search + filter model (F7). Pure functions so the toolbar stays
 * presentational and filtering is unit-testable.
 */
import type { Prompt } from '@/lib/api/types';

/** Tri-state for the enabled / branded filters. */
export type EnabledFilter = 'all' | 'enabled' | 'disabled';

export type PromptFilters = {
  /** Selected intents (empty = all intents). */
  intents: string[];
  /** Selected buyer stages (empty = all stages). */
  stages: string[];
  enabled: EnabledFilter;
  branded: EnabledFilter;
};

export const emptyFilters: PromptFilters = {
  intents: [],
  stages: [],
  enabled: 'all',
  branded: 'all',
};

function matchesTriState(value: boolean, filter: EnabledFilter): boolean {
  if (filter === 'all') return true;
  return filter === 'enabled' ? value : !value;
}

/** Apply search + filters to a prompt list, preserving order. */
export function filterPrompts(prompts: Prompt[], search: string, filters: PromptFilters): Prompt[] {
  const needle = search.trim().toLowerCase();
  const intentSet = new Set(filters.intents);
  const stageSet = new Set(filters.stages);
  return prompts.filter((prompt) => {
    if (needle) {
      const haystack = `${prompt.text} ${prompt.theme ?? ''}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    if (intentSet.size > 0 && !intentSet.has(prompt.intent)) return false;
    if (stageSet.size > 0 && !stageSet.has(prompt.buyer_stage)) return false;
    if (!matchesTriState(prompt.enabled, filters.enabled)) return false;
    if (!matchesTriState(prompt.branded, filters.branded)) return false;
    return true;
  });
}
