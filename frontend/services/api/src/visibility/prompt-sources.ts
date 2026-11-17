/**
 * What the Prompts table filters each prompt's latest measurement by: every
 * brand its answers named and every domain they cited. Both come from the
 * persisted mentions and citations over the same answers the row's rates
 * count, never a re-read of the answers themselves.
 */
import type { CitedDomain } from '@citeladder/contracts/visibility';
import { sql } from 'kysely';

import type { Database } from '../db/database.ts';
import { groupBy } from '../lists.ts';
import { compareText } from '../text-order.ts';
import type { PromptRow } from './prompts.ts';
import { selectedCohorts } from './selection.ts';

type DomainRow = CitedDomain & { audit_id: string; prompt_index: number };

const rowKey = (auditId: string, promptIndex: number) => `${auditId}:${promptIndex}`;

/** Each (run, prompt index)'s cited domains in one cohort, most citations first. */
export async function citedDomains(
  db: Database,
  scope: { workspaceId: string },
  query: { auditIds: readonly string[]; cohort: string },
): Promise<Map<string, CitedDomain[]>> {
  if (!query.auditIds.length) return new Map();
  const { rows } = await sql<DomainRow>`
    select answer.audit_id, answer.prompt_index, citation.domain,
      count(*)::int as citations, bool_or(citation.is_owned) as owned
    from response_analyses answer
    join citations citation on citation.analysis_id = answer.id
      and citation.workspace_id = ${scope.workspaceId}
    where answer.workspace_id = ${scope.workspaceId}
      and answer.audit_id in (${sql.join(query.auditIds)})
      and answer.cohort in (${sql.join([...selectedCohorts(query.cohort)])})
      and citation.domain <> ''
    group by answer.audit_id, answer.prompt_index, citation.domain`.execute(db);
  const found = new Map<string, CitedDomain[]>();
  for (const [key, domains] of groupBy(rows, (row) => rowKey(row.audit_id, row.prompt_index)))
    found.set(
      key,
      domains
        .map(({ domain, citations, owned }) => ({ domain, citations, owned }))
        .sort(
          (left, right) =>
            right.citations - left.citations || compareText(left.domain, right.domain),
        ),
    );
  return found;
}

/** Each latest row's named brands and cited domains, in place; rows are read per cohort. */
export async function attachNamedAndSources(
  db: Database,
  scope: { workspaceId: string },
  rows: readonly PromptRow[],
): Promise<void> {
  const reads = [...groupBy(rows, (row) => row.item.cohort)].map(([cohort, measured]) =>
    citedDomains(db, scope, {
      auditIds: [...new Set(measured.map((row) => row.item.audit_id))],
      cohort,
    }).then((domains) => ({ measured, domains })),
  );
  for (const { measured, domains } of await Promise.all(reads))
    for (const { item, named } of measured) {
      item.named = named.map(({ kind, name }) => ({ kind, name }));
      item.sources = domains.get(rowKey(item.audit_id, item.prompt_index)) ?? [];
    }
}
