/**
 * Which prompts Visibility reads: unbranded (`core`) or branded comparison
 * prompts. The choice is a device convenience remembered per project, so a
 * reader who works on branded prompts returns to them; the URL still wins.
 */
export const PROMPT_COHORTS = ['core', 'comparison'] as const;
export type PromptCohort = (typeof PROMPT_COHORTS)[number];

const storageKey = (projectId: string) => `citeladder.prompt-cohort.${projectId}`;

const isPromptCohort = (value: string | null): value is PromptCohort =>
  PROMPT_COHORTS.some((cohort) => cohort === value);

/** The project's remembered cohort; unbranded when none is stored or storage fails. */
export function readStoredCohort(projectId: string | null): PromptCohort {
  if (projectId === null || typeof window === 'undefined') return 'core';
  try {
    const stored = window.localStorage.getItem(storageKey(projectId));
    return isPromptCohort(stored) ? stored : 'core';
  } catch {
    return 'core';
  }
}

export function writeStoredCohort(projectId: string | null, cohort: PromptCohort): void {
  if (projectId === null || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey(projectId), cohort);
  } catch {
    // Private mode or quota: the choice stays in the URL for this visit.
  }
}
