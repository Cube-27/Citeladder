import type { PromptSet } from '@citeladder/contracts';

const byAge = (a: PromptSet, b: PromptSet) =>
  a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);

/** The project's sets oldest first: the order the one library lists them in. */
export function oldestFirst(sets: readonly PromptSet[]): PromptSet[] {
  return [...sets].sort(byAge);
}

/**
 * The main brand set: the oldest set that is not Commerce's. Adds, imports,
 * generation and the launch and schedule defaults use it, never the newest set
 * (owner, 2026-11-15: all sets in one library).
 */
export function mainPromptSet(sets: readonly PromptSet[]): PromptSet | null {
  return oldestFirst(sets).find((set) => set.kind === 'brand') ?? null;
}
