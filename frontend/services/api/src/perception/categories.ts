import { randomUUID } from 'node:crypto';

import { sql } from 'kysely';

import { countedMatches } from '../analysis/entity-assessment.ts';
import type { PerceptionPolicy } from '../config/perception.ts';
import { subjectXactLock } from '../db/advisory-lock.ts';
import type { Database } from '../db/database.ts';
import { cleanName, nameKey } from '../projects/themes.ts';
import type { ExtractedAspect, VerifiedAspect } from './validate.ts';

export type CategoryChoice =
  | { kind: 'theme'; theme_id: string }
  | { kind: 'new'; name: string }
  | { kind: 'other' };

type Names = { policy: Pick<PerceptionPolicy, 'project_themes'>; businesses: readonly string[] };
type ThemeName = { id: string; name: string };

const words = (name: string) => name.split(' ').filter(Boolean).length;

export const categoryKey = (name: string) => nameKey(name).replaceAll(/[^\p{L}\p{N}]+/gu, '');

export function categoryIds(themes: readonly ThemeName[]) {
  return new Map(themes.map((theme) => [categoryKey(theme.name), theme.id]));
}

export function chooseCategory(
  raw: string,
  existing: ReadonlyMap<string, string>,
  names: Names,
): CategoryChoice | null {
  const limits = names.policy.project_themes;
  const name = cleanName(raw);
  const key = categoryKey(name);
  if (key === categoryKey(limits.fallback)) return { kind: 'other' };
  const id = existing.get(key);
  if (id !== undefined) return { kind: 'theme', theme_id: id };
  const valid =
    key !== '' &&
    words(name) <= limits.model_name_max_words &&
    Array.from(name).length <= limits.name_max_chars &&
    countedMatches(names.businesses, name).length === 0;
  return valid ? { kind: 'new', name } : null;
}

export function cleanAttribute(
  raw: string,
  policy: Pick<PerceptionPolicy, 'attribute_max_words' | 'attribute_max_chars'>,
): string | null {
  const attribute = cleanName(raw);
  if (!categoryKey(attribute)) return null;
  if (words(attribute) > policy.attribute_max_words) return null;
  return Array.from(attribute).length > policy.attribute_max_chars ? null : attribute;
}

async function projectThemes(db: Database, scope: { workspaceId: string; projectId: string }) {
  return db
    .selectFrom('project_themes')
    .select(['id', 'name', 'source'])
    .where('workspace_id', '=', scope.workspaceId)
    .where('project_id', '=', scope.projectId)
    .execute();
}

export async function saveModelCategories(
  db: Database,
  input: {
    workspaceId: string;
    projectId: string;
    names: readonly string[];
    policy: Pick<PerceptionPolicy, 'project_themes'>;
  },
): Promise<ReadonlyMap<string, string>> {
  if (!input.names.length) return new Map();
  await subjectXactLock(db, `perception-categories:${input.projectId}`);
  const themes = await projectThemes(db, input);
  const known = categoryIds(themes);
  const room = Math.max(
    0,
    input.policy.project_themes.model_max - themes.filter((row) => row.source === 'model').length,
  );
  const fresh = [
    ...new Map(
      input.names
        .filter((name) => !known.has(categoryKey(name)))
        .map((name) => [categoryKey(name), name]),
    ).values(),
  ].slice(0, room);
  if (fresh.length) {
    const now = new Date();
    const next = sql<number>`(select coalesce(max(position) + 1, 0) from project_themes where workspace_id = ${input.workspaceId} and project_id = ${input.projectId})`;
    await db
      .insertInto('project_themes')
      .values(
        fresh.map((name, index) => ({
          id: randomUUID(),
          workspace_id: input.workspaceId,
          project_id: input.projectId,
          name,
          position: sql<number>`${next} + ${index}`,
          source: 'model',
          created_at: now,
          updated_at: now,
        })),
      )
      .onConflict((conflict) => conflict.doNothing())
      .execute();
  }
  return categoryIds(await projectThemes(db, input));
}

export function newCategoryNames(aspects: readonly ExtractedAspect[]) {
  return aspects.flatMap(({ category }) => (category.kind === 'new' ? [category.name] : []));
}

export function storedAspects(
  aspects: readonly ExtractedAspect[],
  ids: ReadonlyMap<string, string>,
): { aspects: VerifiedAspect[]; capped: number } {
  let capped = 0;
  const stored = aspects.map(({ category, ...aspect }): VerifiedAspect => {
    switch (category.kind) {
      case 'theme':
        return { ...aspect, theme_id: category.theme_id };
      case 'other':
        return { ...aspect, theme_id: null };
      case 'new': {
        const id = ids.get(categoryKey(category.name)) ?? null;
        if (id === null) capped++;
        return { ...aspect, theme_id: id };
      }
      default: {
        const _exhaustive: never = category;
        return _exhaustive;
      }
    }
  });
  return { aspects: stored, capped };
}
