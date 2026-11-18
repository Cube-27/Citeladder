/**
 * The untracked business names the perception model labelled (AV-11). The
 * model only names; a name survives when the passages it was sent contain it
 * and no tracked business or alias matches it, and every drop is counted.
 */
import { normalizeAlias } from '../analysis/aliases.ts';
import { countedMatches } from '../analysis/entity-assessment.ts';
import type { PerceptionPolicy } from '../config/perception.ts';
import type { PerceptionPackage } from './passages.ts';

/** A verified name as the passages write it, with the key suggestions group by. */
export type UntrackedName = { name: string; name_key: string };

export type NameDropReason =
  | 'names_missing'
  | 'name_not_found'
  | 'name_too_long'
  | 'name_tracked'
  | 'name_duplicate'
  | 'name_limit';

type Tracked = readonly { name: string; aliases: readonly string[] }[];

/** Whether a tracked business's name or alias matches `name`, either way round. */
export function isTracked(name: string, tracked: Tracked): boolean {
  const key = normalizeAlias(name);
  return tracked.some(({ name: own, aliases }) => {
    const names = [own, ...aliases].filter(Boolean);
    return (
      names.some((alias) => normalizeAlias(alias) === key) ||
      countedMatches(names, name).length > 0 ||
      names.some((alias) => countedMatches([name], alias).length > 0)
    );
  });
}

/**
 * The verified, deduplicated names; null when the model returned no list,
 * so an answer whose names are unknown never reads as naming none.
 */
export function untrackedNames(input: {
  pkg: PerceptionPackage;
  names: readonly string[] | undefined;
  tracked: Tracked;
  policy: Pick<PerceptionPolicy, 'max_untracked_names_per_answer' | 'max_untracked_name_chars'>;
}): { names: UntrackedName[] | null; drops: Partial<Record<NameDropReason, number>> } {
  const drops: Partial<Record<NameDropReason, number>> = {};
  const drop = (reason: NameDropReason) => {
    drops[reason] = (drops[reason] ?? 0) + 1;
  };
  if (input.names === undefined) {
    drop('names_missing');
    return { names: null, drops };
  }
  const passages = input.pkg.entities.flatMap((entity) => entity.spans.map((span) => span.text));
  const seen = new Set<string>();
  const names: UntrackedName[] = [];
  for (const raw of input.names) {
    const name = raw.trim();
    const key = normalizeAlias(name);
    if (Array.from(name).length > input.policy.max_untracked_name_chars) drop('name_too_long');
    else if (!key || !passages.some((text) => countedMatches([name], text).length > 0))
      drop('name_not_found');
    else if (isTracked(name, input.tracked)) drop('name_tracked');
    else if (seen.has(key)) drop('name_duplicate');
    else if (names.length >= input.policy.max_untracked_names_per_answer) drop('name_limit');
    else {
      seen.add(key);
      names.push({ name, name_key: key });
    }
  }
  return { names, drops };
}
