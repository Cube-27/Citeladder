/**
 * Fact-check reads: the selection's accuracy summary, its claim pages and
 * export rows, its frozen facts with the verdicts citing them, and the claims
 * of one execution.
 *
 * Projections over persisted `answer_claims`, `fact_verifications`,
 * `claim_verdicts` and the frozen fact revisions; nothing is extracted,
 * verified, called or repaired here. Only audits that froze a fact-check
 * contribute, and a workspace outside the pilot reads `not_enabled`.
 */
import {
  claimVerdictSchema,
  factTopicSchema,
  type AccuracyFactList,
  type AccuracyResponse,
  type ExecutionClaim,
} from '@citeladder/contracts/fact-checking';
import { marketLabel } from '@citeladder/contracts/markets';
import { z } from 'zod';

import { frozenComparisonKey } from '../analysis/comparison.ts';
import { readFrozenConfiguration } from '../audits/frozen-configuration.ts';
import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import { utcTextOf, wireUtc } from '../db/timestamps.ts';
import {
  decodeKeysetCursor,
  encodeKeysetCursor,
  InvalidCursorError,
} from '../http/keyset-cursor.ts';
import { assertExportBound } from '../http/table-export.ts';
import { chunked, groupBy } from '../lists.ts';
import {
  checkedTopics,
  frozenFactCheck,
  frozenPerceptionVersions,
  type FrozenFactCheck,
  type PerceptionVersions,
} from '../perception/admission.ts';
import {
  accuracySummary,
  accuracyTrend,
  claimOrder,
  claimStatus,
  claimView,
  factBreakdown,
  positionedClaims,
  score,
  unavailableReason,
  type ClaimRow,
  type Extraction,
  type FactAnswer,
  type FactRevision,
} from '../perception/fact-metrics.ts';
import { isNamed } from '../perception/passages.ts';
import { editedMark, newestOverrides } from '../perception/verdict-overrides.ts';
import { factCheckingEnabled } from '../projects/brand-facts.ts';
import { listMarkets } from '../projects/markets.ts';
import { compareText } from '../text-order.ts';
import { scopedSelection } from './dashboard.ts';
import { perceptionRows } from './perception.ts';
import { periodTrendSelection } from './runs.ts';
import { citationsByAnalysis, evidenceScope, observedAt, type RunSelection } from './selection.ts';

const settings = policy.perception.fact_check;
const CLAIMS_CURSOR_SCOPE = 'visibility.accuracy.claims';

const brandNamedSchema = z
  .array(z.object({ entity_kind: z.string(), state: z.string() }))
  .catch([])
  .transform((rows) => rows.some((row) => row.entity_kind === 'brand' && isNamed(row.state)));
const revisionIdsSchema = z.array(z.string()).catch([]);

type Frozen = {
  versions: PerceptionVersions;
  factCheck: FrozenFactCheck;
  /** Claim topics with a frozen fact in scope; a claim on any other topic is not covered. */
  topics: ReadonlySet<string>;
};
type Subject = { analysisId: string; frozen: Frozen };

function frozenOf(configuration: unknown): Frozen | null {
  const versions = frozenPerceptionVersions(configuration);
  const factCheck = frozenFactCheck(configuration);
  if (!versions || !factCheck) return null;
  return { versions, factCheck, topics: checkedTopics(factCheck) };
}

function identityOf({ versions, factCheck }: Frozen) {
  return JSON.stringify([
    versions.template_version,
    versions.model,
    factCheck.verify_template_version,
    factCheck.metrics_version,
    factCheck.fact_set_hash,
  ]);
}

/** The workspace's fact revisions by id; a revision on an unknown topic is left out. */
async function factRevisions(
  db: Database,
  workspaceId: string,
  revisionIds: readonly string[],
): Promise<Map<string, FactRevision>> {
  const rows = await chunked([...new Set(revisionIds)], (ids) =>
    db
      .selectFrom('brand_fact_revisions')
      .select(['id', 'fact_id', 'revision', 'topic', 'statement', 'source_url'])
      .where('workspace_id', '=', workspaceId)
      .where('id', 'in', ids)
      .execute(),
  );
  return new Map(
    rows.flatMap((row) => {
      const topic = factTopicSchema.safeParse(row.topic);
      if (!topic.success) return [];
      const fact: FactRevision = {
        revision_id: row.id,
        fact_id: row.fact_id,
        revision: row.revision,
        topic: topic.data,
        statement: row.statement,
        source_url: row.source_url,
      };
      return [[row.id, fact] as const];
    }),
  );
}

/** Each analysis's extraction and claim rows with their statuses and cited facts. */
async function claimsOf(
  db: Database,
  workspaceId: string,
  subjects: readonly Subject[],
): Promise<Map<string, { extraction: Extraction; claims: ClaimRow[] }>> {
  const byAnalysis = new Map(subjects.map((subject) => [subject.analysisId, subject]));
  const perceptions = await perceptionRows(
    db,
    workspaceId,
    new Map(
      subjects.map(({ analysisId, frozen }) => [analysisId, frozen.versions.extractor_version]),
    ),
  );
  if (!perceptions.length) return new Map();
  const perceptionIds = perceptions.map((row) => row.id);
  const [claimRows, verifications] = await Promise.all([
    chunked(perceptionIds, (ids) =>
      db
        .selectFrom('answer_claims')
        .selectAll()
        .where('workspace_id', '=', workspaceId)
        .where('perception_id', 'in', ids)
        .orderBy('ordinal')
        .execute(),
    ),
    chunked(perceptionIds, (ids) =>
      db
        .selectFrom('fact_verifications')
        .select(['id', 'perception_id', 'verify_template_version', 'outcome', 'outcome_reason'])
        .where('workspace_id', '=', workspaceId)
        .where('perception_id', 'in', ids)
        .execute(),
    ),
  ]);
  // Only the verification at the audit's frozen template version counts.
  const versionOf = new Map(
    perceptions.map((row) => [
      row.id,
      byAnalysis.get(row.analysis_id)!.frozen.factCheck.verify_template_version,
    ]),
  );
  const verificationOf = new Map(
    verifications
      .filter((row) => versionOf.get(row.perception_id) === row.verify_template_version)
      .map((row) => [row.perception_id, row]),
  );
  const verdictRows = await chunked(
    [...verificationOf.values()].map((row) => row.id),
    (ids) =>
      db
        .selectFrom('claim_verdicts')
        .select([
          'id',
          'claim_id',
          'verdict',
          'low_confidence',
          'model_omitted',
          'fact_revision_ids',
        ])
        .where('workspace_id', '=', workspaceId)
        .where('verification_id', 'in', ids)
        .execute(),
  );
  const overrides = await newestOverrides(
    db,
    workspaceId,
    verdictRows.filter((row) => !row.model_omitted).map((row) => row.id),
  );
  const verdicts = new Map(
    verdictRows.map((row) => {
      const verdict = claimVerdictSchema.parse(row.verdict);
      const override = overrides.get(row.id);
      return [
        row.claim_id,
        {
          id: row.id,
          verdict,
          low_confidence: row.low_confidence,
          model_omitted: row.model_omitted,
          override: override?.verdict ?? null,
          edited: editedMark({ verdict, low_confidence: row.low_confidence }, override),
          revisionIds: revisionIdsSchema.parse(row.fact_revision_ids),
        },
      ];
    }),
  );
  const revisions = await factRevisions(
    db,
    workspaceId,
    [...verdicts.values()].flatMap((row) => row.revisionIds),
  );
  const claimsByPerception = groupBy(claimRows, (row) => row.perception_id);
  const result = new Map<string, { extraction: Extraction; claims: ClaimRow[] }>();
  for (const perception of perceptions) {
    const { topics } = byAnalysis.get(perception.analysis_id)!.frozen;
    const reason = unavailableReason(perception);
    if (reason) {
      result.set(perception.analysis_id, {
        extraction: { kind: 'unavailable', reason },
        claims: [],
      });
      continue;
    }
    const verification = verificationOf.get(perception.id);
    const claims = (claimsByPerception.get(perception.id) ?? []).flatMap((row): ClaimRow[] => {
      const topic = factTopicSchema.safeParse(row.topic);
      if (!topic.success) return [];
      const verdict = verdicts.get(row.id);
      // Only a verdict the claim's status reads from can be overridden.
      const target =
        verdict && !verdict.model_omitted && !row.low_confidence && topics.has(topic.data)
          ? verdict
          : undefined;
      return [
        {
          ordinal: row.ordinal,
          claim: row.claim,
          topic: topic.data,
          quote: row.quote,
          start: row.quote_start,
          end: row.quote_end,
          status: claimStatus({
            lowConfidenceClaim: row.low_confidence,
            topicHasFact: topics.has(topic.data),
            verification,
            verdict,
          }),
          facts: (verdict?.revisionIds ?? []).flatMap((id) => revisions.get(id) ?? []),
          verdictId: target?.id ?? null,
          edited: target?.edited ?? null,
        },
      ];
    });
    result.set(perception.analysis_id, { extraction: { kind: 'done' }, claims });
  }
  return result;
}

/** The selection's fact-checked answers that name the brand. */
async function selectionAnswers(
  db: Database,
  selection: RunSelection,
  options: { citations: boolean },
) {
  const scoped = await scopedSelection(db, selection);
  const rows = (
    await evidenceScope(db, scoped)
      .select([
        'ra.id',
        'ra.audit_id',
        'ra.task_id',
        'ra.logical_engine',
        'ra.entity_assessments',
        'audit.configuration',
        'audit.market_id',
        'snapshot.text as prompt',
        utcTextOf(observedAt).as('observed_at'),
      ])
      .execute()
  ).flatMap((row) => {
    const frozen = frozenOf(row.configuration);
    return frozen ? [{ ...row, frozen }] : [];
  });
  const factChecked = rows.length > 0;
  const named = rows.filter((row) => brandNamedSchema.parse(row.entity_assessments));
  const ids = named.map((row) => row.id);
  const [extracted, citations] = await Promise.all([
    claimsOf(
      db,
      scoped.workspaceId,
      named.map((row) => ({ analysisId: row.id, frozen: row.frozen })),
    ),
    options.citations
      ? citationsByAnalysis(db, scoped.workspaceId, ids)
      : new Map<string, { domain: string; url: string }[]>(),
  ]);
  const answers = named.map((row): FactAnswer => {
    const found = extracted.get(row.id);
    return {
      auditId: row.audit_id,
      executionId: row.task_id,
      observedAt: wireUtc(row.observed_at),
      logicalEngine: row.logical_engine,
      prompt: row.prompt,
      identity: JSON.stringify([
        frozenComparisonKey(row.configuration, scoped.logicalEngine) ?? row.audit_id,
        identityOf(row.frozen),
      ]),
      extraction: found?.extraction ?? { kind: 'pending' },
      claims: found?.claims ?? [],
      citations: citations.get(row.id) ?? [],
    };
  });
  return {
    answers,
    factChecked,
    auditIds: [...new Set(rows.map((row) => row.audit_id))].sort(compareText),
    frozenRevisionIds: rows.flatMap((row) => row.frozen.factCheck.facts.map((f) => f.revision_id)),
    marketOf: new Map(
      rows.map((row) => {
        const { country_code = '', language_code = '' } = readFrozenConfiguration(
          row.configuration,
        );
        return [row.audit_id, { id: row.market_id, country_code, language_code }];
      }),
    ),
  };
}

function notEnabled(): AccuracyResponse {
  return {
    state: 'not_enabled',
    reason: null,
    source_audit_ids: [],
    score: score([]),
    topics: [],
    engines: [],
    contradicted: [],
    cited_alongside: [],
    trend: [],
  };
}

export async function getAccuracy(
  db: Database,
  selection: RunSelection,
): Promise<AccuracyResponse> {
  if (!(await factCheckingEnabled(db, selection.workspaceId))) return notEnabled();
  const scoped = await scopedSelection(db, selection);
  const [{ answers, factChecked, auditIds }, period] = await Promise.all([
    selectionAnswers(db, scoped, { citations: true }),
    periodTrendSelection(db, scoped),
  ]);
  const summary = accuracySummary(answers, factChecked, settings);
  // The headline reads the pool; a pooled period's trend reads every run in it.
  const trend = period
    ? accuracyTrend((await selectionAnswers(db, period, { citations: false })).answers)
    : summary.trend;
  return { ...summary, trend, source_audit_ids: auditIds };
}

/** The decoded cursor position; a malformed one is refused, never read as the start. */
function cursorPosition(cursor: string, fingerprint: Record<string, unknown>) {
  const [observed_at, execution_id, ordinal] = decodeKeysetCursor(
    cursor,
    CLAIMS_CURSOR_SCOPE,
    fingerprint,
  );
  const offset = Number(ordinal);
  if (observed_at === undefined || execution_id === undefined)
    throw new InvalidCursorError('invalid cursor');
  if (!Number.isSafeInteger(offset) || offset < 0) throw new InvalidCursorError('invalid cursor');
  return { observed_at, execution_id, ordinal: offset };
}

type ClaimFilters = { topic: string | null; verdict: string | null };

function claimFilter(filters: ClaimFilters) {
  return (claim: ClaimRow) =>
    (filters.topic === null || claim.topic === filters.topic) &&
    (filters.verdict === null ||
      (claim.status.kind === 'verdict' && claim.status.verdict === filters.verdict));
}

/** The selection's frozen fact revisions, each with the verdicts that cite it. */
export async function getAccuracyFacts(
  db: Database,
  selection: RunSelection,
): Promise<AccuracyFactList> {
  if (!(await factCheckingEnabled(db, selection.workspaceId))) return { enabled: false, facts: [] };
  const { answers, frozenRevisionIds } = await selectionAnswers(db, selection, {
    citations: false,
  });
  const cited = answers.flatMap((answer) =>
    answer.claims.flatMap((claim) => claim.facts.map((fact) => fact.revision_id)),
  );
  const revisions = await factRevisions(db, selection.workspaceId, [
    ...frozenRevisionIds,
    ...cited,
  ]);
  return { enabled: true, facts: factBreakdown(answers, [...revisions.values()]) };
}

export const CLAIM_EXPORT_COLUMNS = [
  'claim',
  'facts',
  'verdict',
  'model_verdict',
  'engine',
  'market',
  'run_date',
  'prompt',
] as const;

/**
 * The selection's claims under `filters`, newest answer first, as export rows.
 * A claim without a verdict carries its status (pending, low confidence,
 * unavailable) in the verdict column, never a blank. An edited claim's verdict
 * is the person's, with the model's beside it.
 */
export async function accuracyClaimRows(
  db: Database,
  selection: RunSelection,
  filters: ClaimFilters,
): Promise<Record<(typeof CLAIM_EXPORT_COLUMNS)[number], string>[]> {
  if (!(await factCheckingEnabled(db, selection.workspaceId))) return [];
  const { answers, marketOf } = await selectionAnswers(db, selection, { citations: false });
  const keep = claimFilter(filters);
  const claims = answers
    .flatMap((answer) =>
      answer.claims.filter(keep).map((claim) => ({
        answer,
        claim,
        observed_at: answer.observedAt,
        execution_id: answer.executionId,
        ordinal: claim.ordinal,
      })),
    )
    .sort(claimOrder);
  assertExportBound(claims.length, settings.claims_export_max_rows);
  // An additional market keeps its own label while it exists; the default market
  // and a deleted one read as the country and language the run froze.
  const labels = new Map(
    (await listMarkets(db, selection)).map((market) => [market.id, market.label]),
  );
  const marketName = (auditId: string) => {
    const market = marketOf.get(auditId);
    if (!market) return '';
    return (market.id !== null && labels.get(market.id)) || marketLabel(market);
  };
  return claims.map(({ answer, claim }) => ({
    claim: claim.claim,
    facts: claim.facts.map((fact) => `${fact.statement} (revision ${fact.revision})`).join('; '),
    verdict: claim.status.kind === 'verdict' ? claim.status.verdict : claim.status.kind,
    // Filled only when a person changed the verdict (AV-12).
    model_verdict: claim.edited?.model_verdict ?? '',
    engine: answer.logicalEngine,
    market: marketName(answer.auditId),
    run_date: answer.observedAt,
    prompt: answer.prompt,
  }));
}

export async function getAccuracyClaims(
  db: Database,
  selection: RunSelection,
  filters: {
    topic: string | null;
    verdict: string | null;
    cursor: string | null;
    limit: number;
  },
) {
  const fingerprint = {
    selection: JSON.stringify(selection),
    topic: filters.topic,
    verdict: filters.verdict,
  };
  const after = filters.cursor ? cursorPosition(filters.cursor, fingerprint) : null;
  if (!(await factCheckingEnabled(db, selection.workspaceId)))
    return { items: [], next_cursor: null };
  const { answers } = await selectionAnswers(db, selection, { citations: false });
  const claims = positionedClaims(answers, claimFilter(filters)).filter(
    (claim) => after === null || claimOrder(claim, after) > 0,
  );
  const page = claims.slice(0, filters.limit);
  const last = page.at(-1);
  return {
    items: page.map(({ ordinal: _ordinal, ...claim }) => claim),
    next_cursor:
      last && claims.length > filters.limit
        ? encodeKeysetCursor(CLAIMS_CURSOR_SCOPE, fingerprint, [
            last.observed_at,
            last.execution_id,
            String(last.ordinal),
          ])
        : null,
  };
}

/** One execution's brand claims; empty outside the pilot or for an audit without a fact-check. */
export async function executionClaims(
  db: Database,
  input: { workspaceId: string; analysisId: string; configuration: unknown },
): Promise<ExecutionClaim[]> {
  const frozen = frozenOf(input.configuration);
  if (!frozen || !(await factCheckingEnabled(db, input.workspaceId))) return [];
  const found = await claimsOf(db, input.workspaceId, [{ analysisId: input.analysisId, frozen }]);
  return (found.get(input.analysisId)?.claims ?? []).map((claim) => ({
    ...claimView(claim),
    start: claim.start,
    end: claim.end,
  }));
}
