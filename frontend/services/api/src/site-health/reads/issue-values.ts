import type { IssueValue } from '@citeladder/contracts/site-health';
import { sql } from 'kysely';
import { z } from 'zod';

import { policy } from '../../config.ts';
import { record } from '../../db/json.ts';
import { limits } from '../analysis/policy.ts';

const valueKindSchema = z.enum(['title', 'meta_description', 'h1_count', 'word_count']);
type ValueKind = z.infer<typeof valueKindSchema>;

const VALUE_KINDS: ReadonlyMap<string, ValueKind> = new Map(
  Object.entries(
    z.record(z.string(), valueKindSchema).parse(policy.site_health.reads.issue_values),
  ),
);

export type PageText = { fact_title: string | null; fact_meta_description: string | null };

const readsPageText = (ruleId: string) => {
  const kind = VALUE_KINDS.get(ruleId);
  return kind === 'title' || kind === 'meta_description';
};

export function pageTextColumns(ruleId: string) {
  if (!readsPageText(ruleId))
    return sql<PageText>`null::text as fact_title, null::text as fact_meta_description`;
  return sql<PageText>`left(f.normalized_facts->>'title', ${limits.title_chars}) as fact_title,
    left(f.normalized_facts->>'meta_description', ${limits.meta_chars}) as fact_meta_description`;
}

export const pageTextJoin = sql`left join site_fetch_artifacts f on f.workspace_id = i.workspace_id
  and f.crawl_id = i.crawl_id and f.id = i.source_artifact_id`;

function textValue(kind: 'title' | 'meta_description', raw: string | null): IssueValue {
  if (raw === null) return { kind: 'unavailable' };
  const text = raw.replaceAll(/\s+/gu, ' ').trim();
  return { kind, text, length: [...text].length };
}

function countValue(kind: 'h1_count' | 'word_count', evidence: unknown): IssueValue {
  const value = record(evidence)[kind];
  return typeof value === 'number' ? { kind, count: Math.trunc(value) } : { kind: 'unavailable' };
}

export function issueValue(ruleId: string, evidence: unknown, page: PageText): IssueValue {
  const kind = VALUE_KINDS.get(ruleId);
  switch (kind) {
    case undefined:
      return { kind: 'none' };
    case 'title':
      return textValue(kind, page.fact_title);
    case 'meta_description':
      return textValue(kind, page.fact_meta_description);
    case 'h1_count':
    case 'word_count':
      return countValue(kind, evidence);
    default: {
      const unhandled: never = kind;
      return unhandled;
    }
  }
}
