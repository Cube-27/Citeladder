/**
 * Answer perception reads: the selection summary, its quote pages and the
 * per-entity perception of one execution.
 *
 * Projections over persisted `answer_perceptions` / `entity_sentiments` and
 * the deterministic entity assessments; nothing is classified, called or
 * repaired here. A named entity without a perception row is pending.
 */
import { sql } from 'kysely';
import { z } from 'zod';
import {
  perceptionLabelSchema,
  type ExecutionPerception,
  type PerceptionQuote,
  type PerceptionResponse,
} from '@citeladder/contracts/visibility-perception';

import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import { utcTextOf, wireUtc } from '../db/timestamps.ts';
import { decodeKeysetCursor, encodeKeysetCursor } from '../http/keyset-cursor.ts';
import { frozenPerceptionVersions } from '../perception/admission.ts';
import {
  mentionStatus,
  perceptionSummary,
  quoteOf,
  type Mention,
  type PerceptionAnswer,
} from '../perception/metrics.ts';
import { compareText } from '../text-order.ts';
import {
  AnalysisNotFoundError,
  authorizedSelection,
  evidenceScope,
  observedAt,
  type RunSelection,
} from './selection.ts';

const visibility = policy.visibility;
const NOT_NAMED = new Set(['absent', 'unavailable']);

const assessmentsSchema = z.array(
  z.object({
    entity_id: z.string(),
    entity_name: z.string(),
    entity_kind: z.string(),
    state: z.string(),
  }),
);
const aspectsSchema = z.array(
  z.object({
    theme: z.string(),
    polarity: z.enum(['positive', 'negative']),
    quote: z.string(),
    start: z.number().int(),
    end: z.number().int(),
  }),
);

type AnalysisRow = { id: string; configuration: unknown };
type Perceived = {
  perception: { outcome: string; outcome_reason: string | null };
  entities: Map<
    string,
    { label: string; confidence: number | null; low_confidence: boolean; aspects: unknown }
  >;
};

/** Each analysis's perception (at its audit's frozen extractor) and entity rows. */
async function perceptionsOf(db: Database, workspaceId: string, analyses: readonly AnalysisRow[]) {
  const result = new Map<string, Perceived>();
  if (!analyses.length) return result;
  const wanted = new Map(
    analyses.map((row) => [row.id, frozenPerceptionVersions(row.configuration).extractor_version]),
  );
  const perceptions = (
    await db
      .selectFrom('answer_perceptions')
      .select(['id', 'analysis_id', 'extractor_version', 'outcome', 'outcome_reason'])
      .where('workspace_id', '=', workspaceId)
      .where('analysis_id', 'in', [...wanted.keys()])
      .execute()
  ).filter((row) => wanted.get(row.analysis_id) === row.extractor_version);
  const entities = perceptions.length
    ? await db
        .selectFrom('entity_sentiments')
        .select(['perception_id', 'entity_id', 'label', 'confidence', 'low_confidence', 'aspects'])
        .where('workspace_id', '=', workspaceId)
        .where(
          'perception_id',
          'in',
          perceptions.map((row) => row.id),
        )
        .execute()
    : [];
  for (const row of perceptions)
    result.set(row.analysis_id, {
      perception: row,
      entities: new Map(
        entities
          .filter((entity) => entity.perception_id === row.id)
          .map((entity) => [entity.entity_id, entity]),
      ),
    });
  return result;
}

/** The named entities of one analysis as mentions with their status and aspects. */
function mentionsOf(assessments: unknown, perceived: Perceived | undefined) {
  const parsed = assessmentsSchema.safeParse(assessments);
  if (!parsed.success) return [];
  return parsed.data
    .filter((row) => !NOT_NAMED.has(row.state))
    .map((row) => {
      const entity = perceived?.entities.get(row.entity_id);
      const status = mentionStatus(perceived?.perception, entity);
      const aspects =
        status.kind === 'classified' ? aspectsSchema.catch([]).parse(entity?.aspects) : [];
      return {
        entityId: row.entity_id,
        confidence: entity?.confidence ?? null,
        label: perceptionLabelSchema
          .nullable()
          .catch(null)
          .parse(entity?.label ?? null),
        mention: {
          entity: row.entity_name,
          isBrand: row.entity_kind === 'brand',
          status,
          aspects,
        } satisfies Mention,
      };
    });
}

/** The runs a perception read covers: the selection, or the latest dashboard-ready run. */
async function scopedSelection(db: Database, selection: RunSelection): Promise<RunSelection> {
  const scoped = await authorizedSelection(db, selection);
  if (scoped.auditId || scoped.auditIds?.length || scoped.fromAt || scoped.toAt) return scoped;
  const latest = await db
    .selectFrom('audits')
    .select('id')
    .where('workspace_id', '=', scoped.workspaceId)
    .where('project_id', '=', scoped.projectId)
    .where('audit_scope', '=', visibility.brand_audit_scope)
    .where('status', 'in', visibility.dashboard_audit_statuses)
    .orderBy(sql`completed_at desc nulls last`)
    .orderBy('created_at', 'desc')
    .limit(1)
    .executeTakeFirst();
  if (!latest) throw new AnalysisNotFoundError('No completed audit for project');
  return { ...scoped, auditId: latest.id };
}

async function selectionAnswers(db: Database, selection: RunSelection) {
  const scoped = await scopedSelection(db, selection);
  const rows = await evidenceScope(db, scoped)
    .where('audit.audit_scope', '=', visibility.brand_audit_scope)
    .select([
      'ra.id',
      'ra.audit_id',
      'ra.task_id',
      'ra.logical_engine',
      'ra.entity_assessments',
      'audit.configuration',
      'snapshot.text as prompt',
      'snapshot.theme as topic',
      utcTextOf(observedAt).as('observed_at'),
    ])
    .execute();
  const perceived = await perceptionsOf(db, scoped.workspaceId, rows);
  const citations = rows.length
    ? await db
        .selectFrom('citations')
        .select(['analysis_id', 'domain', 'url'])
        .where('workspace_id', '=', scoped.workspaceId)
        .where(
          'analysis_id',
          'in',
          rows.map((row) => row.id),
        )
        .orderBy('ordinal')
        .execute()
    : [];
  const answers = rows.map((row): PerceptionAnswer => {
    const versions = frozenPerceptionVersions(row.configuration);
    const named = mentionsOf(row.entity_assessments, perceived.get(row.id));
    const brand = assessmentsSchema
      .catch([])
      .parse(row.entity_assessments)
      .find((assessment) => assessment.entity_kind === 'brand');
    return {
      auditId: row.audit_id,
      executionId: row.task_id,
      observedAt: wireUtc(row.observed_at),
      logicalEngine: row.logical_engine,
      prompt: row.prompt,
      topic: row.topic || 'Untagged',
      versions: {
        extractor: versions.extractor_version,
        template: versions.template_version,
        metrics: versions.metrics_version,
      },
      mentions: named.map((item) => item.mention),
      brandRecommendation: brand?.state ?? null,
      citations: citations
        .filter((citation) => citation.analysis_id === row.id)
        .map(({ domain, url }) => ({ domain, url })),
    };
  });
  return { answers, auditIds: [...new Set(rows.map((row) => row.audit_id))].sort(compareText) };
}

export async function getPerception(
  db: Database,
  selection: RunSelection,
): Promise<PerceptionResponse> {
  const { answers, auditIds } = await selectionAnswers(db, selection);
  return { ...perceptionSummary(answers, policy.perception), source_audit_ids: auditIds };
}

type QuotePosition = Pick<PerceptionQuote, 'observed_at' | 'execution_id' | 'entity'> & {
  start: number;
};

/** Newest answer first, then execution, entity and position: a total order. */
function quoteOrder(a: QuotePosition, b: QuotePosition) {
  return (
    compareText(b.observed_at, a.observed_at) ||
    compareText(a.execution_id, b.execution_id) ||
    compareText(a.entity, b.entity) ||
    a.start - b.start
  );
}

const quoteKey = (quote: QuotePosition) => [
  quote.observed_at,
  quote.execution_id,
  quote.entity,
  String(quote.start),
];

export async function getPerceptionQuotes(
  db: Database,
  selection: RunSelection,
  filters: {
    entity: string | null;
    theme: string | null;
    polarity: 'positive' | 'negative' | null;
    cursor: string | null;
    limit: number;
  },
) {
  const { answers } = await selectionAnswers(db, selection);
  const fingerprint = {
    selection: JSON.stringify(selection),
    entity: filters.entity,
    theme: filters.theme,
    polarity: filters.polarity,
  };
  const quotes = answers
    .flatMap((answer) =>
      answer.mentions
        .filter((mention) => mention.status.kind === 'classified')
        .filter((mention) => filters.entity === null || mention.entity === filters.entity)
        .flatMap((mention) =>
          mention.aspects.map((aspect) => ({
            ...quoteOf(answer, mention, aspect),
            start: aspect.start,
          })),
        ),
    )
    .filter((quote) => filters.theme === null || quote.theme === filters.theme)
    .filter((quote) => filters.polarity === null || quote.polarity === filters.polarity)
    .sort(quoteOrder);
  let from = 0;
  if (filters.cursor) {
    const [at = '', execution = '', entity = '', start = '0'] = decodeKeysetCursor(
      filters.cursor,
      'visibility.perception.quotes',
      fingerprint,
    );
    const after: QuotePosition = {
      observed_at: at,
      execution_id: execution,
      entity,
      start: Number(start),
    };
    from = quotes.findIndex((quote) => quoteOrder(quote, after) > 0);
    if (from === -1) from = quotes.length;
  }
  const page = quotes.slice(from, from + filters.limit);
  const last = page.at(-1);
  return {
    items: page.map(({ start: _start, ...quote }) => quote),
    next_cursor:
      last && from + filters.limit < quotes.length
        ? encodeKeysetCursor('visibility.perception.quotes', fingerprint, quoteKey(last))
        : null,
  };
}

/** One execution's per-entity perception; empty for an answer outside brand visibility. */
export async function executionPerception(
  db: Database,
  input: {
    workspaceId: string;
    analysisId: string;
    assessments: unknown;
    audit: { audit_scope: string; configuration: unknown } | undefined;
  },
): Promise<ExecutionPerception[]> {
  if (input.audit?.audit_scope !== visibility.brand_audit_scope) return [];
  const perceived = await perceptionsOf(db, input.workspaceId, [
    { id: input.analysisId, configuration: input.audit.configuration },
  ]);
  return mentionsOf(input.assessments, perceived.get(input.analysisId)).map(
    ({ mention, confidence, label }) => {
      const { status } = mention;
      const classified = status.kind === 'classified' || status.kind === 'not_assessable';
      return {
        entity: mention.entity,
        is_brand: mention.isBrand,
        state: classified ? 'classified' : status.kind,
        reason: status.kind === 'unavailable' ? status.reason : null,
        label: classified || status.kind === 'low_confidence' ? label : null,
        confidence,
        aspects: mention.aspects,
      };
    },
  );
}
