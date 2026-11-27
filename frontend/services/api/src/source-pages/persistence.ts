import { randomUUID } from 'node:crypto';

import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import type { QueueTask } from '../queue/task-queue.ts';
import { acquireProjectLock } from '../prompts/locks.ts';
import type { SourceScope } from './admission.ts';
import type { ExtractedPage } from './extract.ts';
import type { assessPage } from './assessment.ts';
import { lockOwnedTask } from './task-fence.ts';

type PageResponse = {
  finalUrl: string;
  status: number;
  type: string;
  charset: string | null;
  bytes: number;
  redirects: string[];
  headers: Record<string, string> | null;
};
export type FetchOutcome = { requestedUrl: string } & (
  | { outcome: 'inspected'; response: PageResponse }
  | { outcome: 'failed'; reason: string; response: PageResponse | null }
  | { outcome: 'blocked'; reason: 'robots_disallowed' }
);
function fetchFacts(fetch: FetchOutcome) {
  switch (fetch.outcome) {
    case 'inspected':
      return { response: fetch.response, reason: null, robots: 'allowed' };
    case 'failed':
      return { response: fetch.response, reason: fetch.reason, robots: failedRobots(fetch) };
    case 'blocked':
      return { response: null, reason: fetch.reason, robots: 'disallowed' };
    default: {
      const unknownFetch: never = fetch;
      throw new Error(`Unknown fetch outcome: ${JSON.stringify(unknownFetch)}`);
    }
  }
}
function failedRobots(fetch: { reason: string; response: PageResponse | null }) {
  if (fetch.response) return 'allowed';
  return fetch.reason === 'robots_unavailable' ? 'unavailable' : null;
}
const strength = policy.source_pages.format_method_strength;
const rank = (method: string | null) => {
  const index = strength.indexOf(method ?? '');
  return index < 0 ? strength.length : index;
};

type InspectionInput = {
  scope: SourceScope;
  pageId: string;
  lease: Date | null;
  fetch: FetchOutcome;
  auditId: string;
  roster: string;
  extracted?: ExtractedPage;
  assessment?: ReturnType<typeof assessPage>;
};
export function recordInspection(db: Database, task: QueueTask, input: InspectionInput) {
  const { scope, pageId, lease, fetch, auditId, roster, extracted, assessment } = input;
  const { response, reason, robots } = fetchFacts(fetch);
  return db.transaction().execute(async (trx) => {
    if (!(await lockOwnedTask(trx, task))) return null;
    const audit = await trx
      .selectFrom('audits')
      .select('id')
      .where('id', '=', auditId)
      .where('workspace_id', '=', scope.workspaceId)
      .where('project_id', '=', scope.projectId)
      .executeTakeFirst();
    if (!audit) return null;
    await acquireProjectLock(trx, scope.projectId);
    const page = await trx
      .selectFrom('source_pages')
      .selectAll()
      .where('id', '=', pageId)
      .where('workspace_id', '=', scope.workspaceId)
      .where('project_id', '=', scope.projectId)
      .forUpdate()
      .executeTakeFirst();
    if (!page) return null;
    const now = new Date();
    if (
      lease &&
      (page.inspection_state !== 'queued' ||
        page.claim_expires_at?.getTime() !== lease.getTime() ||
        lease <= now)
    )
      return null;
    if (
      !lease &&
      page.inspection_state === 'queued' &&
      page.claim_expires_at &&
      page.claim_expires_at > now
    )
      return null;
    const id = randomUUID();
    await trx
      .insertInto('source_page_snapshots')
      .values({
        id,
        workspace_id: scope.workspaceId,
        project_id: scope.projectId,
        source_page_id: pageId,
        audit_id: auditId,
        requested_url: fetch.requestedUrl,
        final_url: response?.finalUrl ?? '',
        status_code: response?.status ?? null,
        content_type: response?.type ?? null,
        charset: response?.charset ?? null,
        body_bytes: response?.bytes ?? 0,
        redirect_chain: response?.redirects.length ? JSON.stringify(response.redirects) : null,
        redacted_headers: response?.headers ? JSON.stringify(response.headers) : null,
        robots_state: robots,
        outcome: fetch.outcome,
        outcome_reason: reason,
        content_hash: extracted?.content_hash ?? null,
        page_facts: extracted ? JSON.stringify(extracted.facts) : null,
        evidence_passages: assessment ? JSON.stringify(assessment.passages) : null,
        extracted_chars: extracted?.extracted_chars ?? 0,
        extractor_version: policy.source_pages.extractor_version,
        inspector_version: policy.source_pages.inspector_version,
        fetched_at: now,
        created_at: now,
      })
      .execute();
    if (assessment?.presences.length)
      await trx
        .insertInto('source_page_entity_presences')
        .values(
          assessment.presences.map((presence) => ({
            ...presence,
            id: randomUUID(),
            workspace_id: scope.workspaceId,
            project_id: scope.projectId,
            source_page_id: pageId,
            snapshot_id: id,
            roster_version: roster,
            passage_refs: JSON.stringify(presence.passage_refs),
            detector_version: policy.source_pages.presence_version,
            created_at: now,
          })),
        )
        .execute();
    const replaceFormat =
      assessment &&
      assessment.format !== 'unresolved' &&
      rank(assessment.method) <= rank(page.page_format_method);
    await trx
      .updateTable('source_pages')
      .set({
        inspection_state: fetch.outcome,
        inspection_reason: reason,
        claim_expires_at: null,
        latest_snapshot_id: id,
        updated_at: now,
        ...(fetch.outcome === 'inspected'
          ? {
              last_inspected_at: now,
              content_hash: extracted?.content_hash ?? null,
              inspector_version: policy.source_pages.inspector_version,
            }
          : {}),
        ...(replaceFormat
          ? {
              page_format: assessment.format,
              page_format_method: assessment.method,
              page_format_version: policy.source_pages.format_version,
            }
          : {}),
      })
      .where('id', '=', pageId)
      .where('workspace_id', '=', scope.workspaceId)
      .where('project_id', '=', scope.projectId)
      .execute();
    return id;
  });
}
