import { citationClassificationSchema } from '@citeladder/contracts/audits';
import type { ProbePage } from '@citeladder/contracts/probes';

import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import type { ProjectScope as Scope } from '../projects/brand-profile.ts';
import { pageStandings } from '../visibility/page-standing.ts';
import type { ProbeAnswer } from './answers.ts';

export async function citedPages(db: Database, scope: Scope, asked: readonly ProbeAnswer[]) {
  const taskIds = asked.map((answer) => answer.taskId);
  const rows = taskIds.length
    ? await db
        .selectFrom('citations as c')
        .innerJoin('response_analyses as ra', 'ra.id', 'c.analysis_id')
        .select(['ra.task_id', 'c.url', 'c.url_hash', 'c.title', 'c.domain', 'c.classification'])
        .distinctOn(['ra.task_id', 'c.url'])
        .where('ra.workspace_id', '=', scope.workspaceId)
        .where('c.workspace_id', '=', scope.workspaceId)
        .where('ra.task_id', 'in', taskIds)
        .orderBy('ra.task_id')
        .orderBy('c.url')
        .orderBy('c.ordinal')
        .execute()
    : [];
  const byTask = Map.groupBy(rows, (row) => row.task_id);
  const hashes = [...new Set(rows.flatMap((row) => (row.url_hash ? [row.url_hash] : [])))];
  const known = hashes.length ? await pageStandings(db, scope, hashes) : undefined;
  return (cites: (answer: ProbeAnswer) => boolean) => {
    const pages = new Map<string, ProbePage>();
    for (const answer of asked)
      if (cites(answer))
        for (const row of byTask.get(answer.taskId) ?? []) {
          const source = row.url_hash ? known?.get(row.url_hash) : undefined;
          const page = pages.get(row.url) ?? {
            url: row.url,
            title: row.title,
            domain: row.domain,
            classification: citationClassificationSchema.parse(row.classification),
            page_format: source?.page_format ?? null,
            standing: source?.standing ?? null,
            citations: 0,
          };
          page.citations += 1;
          pages.set(row.url, page);
        }
    const sorted = [...pages.values()].sort(
      (a, b) => b.citations - a.citations || a.url.localeCompare(b.url),
    );
    return { sources: sorted.length, pages: sorted.slice(0, policy.probes.max_sources_per_group) };
  };
}
