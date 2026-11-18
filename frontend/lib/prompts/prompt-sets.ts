import type { PromptSet } from '@citeladder/contracts';

const byAge = (a: PromptSet, b: PromptSet) =>
  a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);

/** The project's sets oldest first: the order the one library lists them in. */
export function oldestFirst(sets: readonly PromptSet[]): PromptSet[] {
  return [...sets].sort(byAge);
}

/**
 * The order the one library lists its sets in: brand sets oldest first, then
 * Commerce's, whose prompts have no per-prompt figures (owner, 2026-11-18).
 */
export function libraryOrder(sets: readonly PromptSet[]): PromptSet[] {
  const ordered = oldestFirst(sets);
  return [
    ...ordered.filter((set) => set.kind !== 'commerce'),
    ...ordered.filter((set) => set.kind === 'commerce'),
  ];
}

/**
 * Each set's name, for a row's caption, only when the project has more than
 * one brand set to tell apart: Commerce's set is told by its rows' figures.
 */
export function rowSetNames(sets: readonly PromptSet[]): ReadonlyMap<string, string> {
  const brandSets = sets.filter((set) => set.kind !== 'commerce').length;
  return new Map(brandSets > 1 ? sets.map((set) => [set.id, set.name]) : []);
}

/**
 * The main brand set: the oldest set that is not Commerce's. Adds, imports,
 * generation and the launch and schedule defaults use it, never the newest set
 * (owner, 2026-11-15: all sets in one library).
 */
export function mainPromptSet(sets: readonly PromptSet[]): PromptSet | null {
  return oldestFirst(sets).find((set) => set.kind === 'brand') ?? null;
}
