/**
 * The page evidence the earned-page detector reads, assembled from what the
 * source-page inspector already committed (`earned_page_hits.py`).
 *
 * The answer set is every analyzed answer in the audit, not only the gap
 * prompts: that filter is what made correction and defence unreachable.
 * Presence verdicts are compared against the roster in force now; a verdict
 * judged under another roster is not current and is never compared.
 */
import { sql } from 'kysely';

import { policy } from '../config.ts';
import { detectEarnedPageOpportunities } from '../analysis/opportunities/earned-pages.ts';
import type {
  AnalysisEvidence,
  DetectorHit,
  SourcePageEvidence,
  VisibilityEvidence,
} from '../analysis/opportunities/evidence.ts';
import type { Database } from '../db/database.ts';
import { WorkspaceScope } from '../db/workspace-scope.ts';
import { passageTexts, projectRoster } from '../source-pages/reading.ts';
import { record } from '../db/json.ts';
import { compareText, scalarText } from '../text-order.ts';

const e = policy.opportunity.earned_actions;
const s = policy.opportunity.source_pages;
/** Latest plus the one before it: deterioration compares against the last usable one. */
const SNAPSHOTS_PER_PAGE = 2;

type Snapshot = {
  id: string;
  source_page_id: string;
  extracted_chars: number;
  content_hash: string | null;
  page_facts: unknown;
  evidence_passages: unknown;
};
type Presence = {
  snapshot_id: string;
  entity_kind: string;
  entity_name: string;
  presence: string;
  match_method: string;
  match_count: number;
  roster_version: string;
  passage_refs: unknown;
};

/** Which analyses in this audit cited each identified third-party page. */
async function citedByHash(db: Database, workspaceId: string, auditId: string) {
  const rows = await new WorkspaceScope(workspaceId)
    .selectFrom(db, 'citations')
    .select(['url_hash', 'analysis_id'])
    .where('audit_id', '=', auditId)
    .where('url_hash', 'is not', null)
    .where('is_owned', 'is', false)
    .execute();
  const grouped = new Map<string, Set<string>>();
  for (const row of rows) {
    const set = grouped.get(row.url_hash!) ?? new Set<string>();
    set.add(row.analysis_id);
    grouped.set(row.url_hash!, set);
  }
  return grouped;
}

/** The two most recent successful readings of each page, newest first. */
async function readings(db: Database, workspaceId: string, projectId: string, pageIds: string[]) {
  const grouped = new Map<string, Snapshot[]>();
  if (!pageIds.length) return grouped;
  const rows = await sql<Snapshot>`
    select id, source_page_id, extracted_chars, content_hash, page_facts, evidence_passages
    from (
      select *, row_number() over (
        partition by source_page_id order by fetched_at desc, id desc
      ) as rank
      from source_page_snapshots
      where workspace_id = ${workspaceId}
        and project_id = ${projectId}
        and source_page_id in (${sql.join(pageIds)})
        and outcome = ${policy.opportunity.refresh.source_page_outcome_inspected}
    ) ranked
    where rank <= ${SNAPSHOTS_PER_PAGE}
    order by source_page_id asc, fetched_at desc, id desc
  `.execute(db);
  for (const row of rows.rows)
    grouped.set(row.source_page_id, [...(grouped.get(row.source_page_id) ?? []), row]);
  return grouped;
}

async function presences(
  db: Database,
  workspaceId: string,
  projectId: string,
  snapshotIds: string[],
) {
  const grouped = new Map<string, Presence[]>();
  if (!snapshotIds.length) return grouped;
  const rows = await new WorkspaceScope(workspaceId)
    .selectFrom(db, 'source_page_entity_presences')
    .select([
      'snapshot_id',
      'entity_kind',
      'entity_name',
      'presence',
      'match_method',
      'match_count',
      'roster_version',
      'passage_refs',
    ])
    .where('project_id', '=', projectId)
    .where('snapshot_id', 'in', snapshotIds)
    .orderBy(sql`entity_kind <> ${s.ENTITY_KIND_BRAND}`)
    .orderBy('entity_name')
    .execute();
  for (const row of rows) {
    grouped.set(row.snapshot_id, [...(grouped.get(row.snapshot_id) ?? []), row]);
  }
  return grouped;
}

const entities = (snapshot: Snapshot, rows: Presence[]) =>
  rows.map((row) => ({
    entity_kind: row.entity_kind,
    entity_name: row.entity_name,
    presence: row.presence,
    match_method: row.match_method,
    match_count: row.match_count,
    passages: passageTexts(snapshot.evidence_passages, row.passage_refs),
  }));

/** The last usable reading, or null when it was judged under another roster. */
function prior(
  snapshot: Snapshot | undefined,
  rows: Presence[],
  roster: string,
): SourcePageEvidence['prior'] {
  if (snapshot === undefined || !rows.length) return null;
  if (rows.some((row) => row.roster_version !== roster)) return null;
  const found = entities(snapshot, rows);
  const brand = found.find((item) => item.entity_kind === s.ENTITY_KIND_BRAND);
  return {
    snapshot_id: snapshot.id,
    brand_present: brand?.presence === s.PRESENCE_PRESENT,
    brand_match_count: brand ? brand.match_count : 0,
    present_competitors: found
      .filter(
        (item) => item.entity_kind !== s.ENTITY_KIND_BRAND && item.presence === s.PRESENCE_PRESENT,
      )
      .map((item) => item.entity_name),
    content_hash: snapshot.content_hash,
  };
}

/** The audit's answers, indexed once for every page that cites them. */
function answerIndex(visibility: VisibilityEvidence) {
  const byId = new Map(visibility.analyses.map((row) => [row.analysis_id, row]));
  const themes = new Map(
    visibility.prompt_snapshots
      .filter((row) => row.theme)
      .map((row) => [row.prompt_index, row.theme]),
  );
  return (analysisIds: Set<string>) => {
    const selected = [...analysisIds].flatMap((id) => byId.get(id) ?? []) as AnalysisEvidence[];
    const indices = [...new Set(selected.map((row) => row.prompt_index))].sort((a, b) => a - b);
    return {
      prompt_indices: indices,
      themes: [...new Set(indices.flatMap((index) => themes.get(index) ?? []))].sort(compareText),
      analysis_ids: selected.map((row) => row.analysis_id).sort(compareText),
      // Descriptive only: every name in an answer attaches to every page it cited.
      answer_competitors: [...new Set(selected.flatMap((row) => row.competitor_names))].sort(
        compareText,
      ),
    };
  };
}

type Page = {
  id: string;
  url_hash: string;
  canonical_url: string;
  registrable_domain: string;
  page_format: string;
  page_format_method: string | null;
  inspection_state: string;
  inspection_reason: string | null;
  source_class: string | null;
  recurrence_count: number;
  inspection_requested_at: Date | null;
};

function pageEvidence(
  page: Page,
  context: {
    snapshots: Snapshot[];
    presences: Map<string, Presence[]>;
    answers: ReturnType<typeof answerIndex>;
    analysisIds: Set<string>;
    roster: string;
  },
): SourcePageEvidence {
  const [latest, previous] = context.snapshots;
  const rows = latest ? (context.presences.get(latest.id) ?? []) : [];
  const facts = record(latest?.page_facts);
  const listed = (key: string) =>
    Array.isArray(facts[key]) ? (facts[key] as unknown[]).map(String) : [];
  const extracted = latest?.extracted_chars ?? 0;
  return {
    url_hash: page.url_hash,
    canonical_url: page.canonical_url,
    registrable_domain: page.registrable_domain,
    page_format: page.page_format,
    page_format_method: page.page_format_method,
    inspection_state: page.inspection_state,
    inspection_reason: page.inspection_reason,
    snapshot_id: latest?.id ?? null,
    extracted_chars: extracted,
    sufficient_coverage:
      page.inspection_state === s.INSPECTION_INSPECTED &&
      extracted >= s.SOURCE_PAGE_MIN_COVERAGE_CHARS,
    title: scalarText(facts.title),
    headings: listed('headings'),
    outbound_domains: listed('outbound_domains'),
    content_hash: latest?.content_hash ?? null,
    entities: latest ? entities(latest, rows) : [],
    prior: prior(
      previous,
      previous ? (context.presences.get(previous.id) ?? []) : [],
      context.roster,
    ),
    roster_current: rows.length > 0 && rows.every((row) => row.roster_version === context.roster),
    source_class: page.source_class,
    recurrence_count: page.recurrence_count,
    answer_count: context.analysisIds.size,
    ...context.answers(context.analysisIds),
    requested: page.inspection_requested_at !== null,
  };
}

/** Page-keyed earned hits for this audit, over its full answer set. */
export async function earnedPageHits(
  db: Database,
  scope: { workspaceId: string; projectId: string },
  audit: { id: string; configuration: unknown },
  visibility: VisibilityEvidence,
): Promise<DetectorHit[]> {
  const workspace = new WorkspaceScope(scope.workspaceId);
  const cited = await citedByHash(db, scope.workspaceId, audit.id);
  const hashes = [...cited.keys()].sort(compareText);
  if (!hashes.length) return [];
  const pages = await workspace
    .selectFrom(db, 'source_pages')
    .select([
      'id',
      'url_hash',
      'canonical_url',
      'registrable_domain',
      'page_format',
      'page_format_method',
      'inspection_state',
      'inspection_reason',
      'source_class',
      'recurrence_count',
      'inspection_requested_at',
    ])
    .where('project_id', '=', scope.projectId)
    .where('url_hash', 'in', hashes)
    .orderBy('recurrence_count', 'desc')
    .orderBy('url_hash')
    .limit(e.EARNED_PAGE_DETECTOR_MAX_PAGES)
    .execute();
  if (!pages.length) return [];
  const snapshots = await readings(
    db,
    scope.workspaceId,
    scope.projectId,
    pages.map((page) => page.id),
  );
  const verdicts = await presences(
    db,
    scope.workspaceId,
    scope.projectId,
    [...snapshots.values()].flat().map((row) => row.id),
  );
  const coverage = await workspace
    .selectFrom(db, 'source_pages')
    .select([
      sql<string>`count(id) filter (where inspection_state = ${s.INSPECTION_INSPECTED})`.as(
        'inspected',
      ),
      sql<string>`count(id)`.as('total'),
    ])
    .where('project_id', '=', scope.projectId)
    .executeTakeFirstOrThrow();
  const roster = projectRoster(audit.configuration ?? {});
  const answers = answerIndex(visibility);
  return detectEarnedPageOpportunities({
    pages: pages.map((page) =>
      pageEvidence(page, {
        snapshots: snapshots.get(page.id) ?? [],
        presences: verdicts,
        answers,
        analysisIds: cited.get(page.url_hash) ?? new Set(),
        roster,
      }),
    ),
    owned_domains: visibility.owned_domains,
    eligible_answers: visibility.analyses.length,
    inspected_pages: Number(coverage.inspected),
    total_pages: Number(coverage.total),
  });
}
