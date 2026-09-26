/**
 * `executions`: one execution's persisted analysis and citation evidence.
 *
 * Moved from `backend/app/api/executions.py`. `execution_id` is the
 * execution (`AuditTask`) id from `GET /audits/{id}/executions`; the read is
 * workspace-scoped and projection-only.
 */
import { z } from 'zod';

import { notFound } from '../errors.ts';
import { AnalysisNotFoundError } from '../visibility/selection.ts';
import { getExecutionEvidence } from '../visibility/execution.ts';
import { defineGetRoute } from './define.ts';

const aioLinkEvidence = z.object({
  url: z.string().default(''),
  domain: z.string().default(''),
  title: z.string().default(''),
  element_index: z.int().default(0),
});

const surfaceEntityEvidence = z.object({
  name: z.string(),
  kind: z.enum(['brand', 'competitor']),
  mentioned: z.boolean().default(false),
  linked: z.boolean().default(false),
  cited: z.boolean().default(false),
  first_offset: z.int().nullable().default(null),
  mention_order: z.int().nullable().default(null),
});

const searchSurfaceEvidence = z.object({
  outcome: z.string(),
  aio_present: z.boolean().nullable().default(null),
  aio_serp_position: z.int().nullable().default(null),
  provider_status_code: z.int().nullable().default(null),
  error_code: z.string().default(''),
  element_count: z.int().default(0),
  reference_count: z.int().default(0),
  location_code: z.int().default(0),
  language_code: z.string().default(''),
  device: z.string().default(''),
  observed_at: z.iso.datetime({ offset: true }).nullable().default(null),
  retrieved_at: z.iso.datetime({ offset: true }).nullable().default(null),
  links: z.array(aioLinkEvidence).optional(),
  entities: z.array(surfaceEntityEvidence).optional(),
});

const citationEvidence = z.object({
  ordinal: z.int(),
  url: z.string().default(''),
  title: z.string().default(''),
  domain: z.string().default(''),
  classification: z.string().default('third_party'),
  source_class: z.string().nullable().default(null),
  source_origin: z.string().default('external'),
  source_taxonomy_version: z.string().nullable().default(null),
  is_owned: z.boolean().default(false),
  is_unintended: z.boolean().default(false),
  matched_competitor: z.string().nullable().default(null),
});

const executionEvidenceResponse = z.object({
  id: z.uuid(),
  analysis_id: z.uuid(),
  audit_id: z.uuid(),
  task_id: z.uuid(),
  artifact_id: z.uuid().nullable().default(null),
  analyzer_version: z.string(),
  scoring_rule_version: z.string(),
  logical_engine: z.string().default(''),
  transport_provider: z.string().default(''),
  transport_model: z.string().default(''),
  retrieval_enabled: z.boolean().nullable().default(null),
  prompt_index: z.int(),
  repetition: z.int(),
  prompt_class: z.string().default(''),
  cohort: z.string().default('core'),
  brand_mentioned: z.boolean().default(false),
  brand_first_offset: z.int().nullable().default(null),
  owned_domain_cited: z.boolean().default(false),
  owned_citation_count: z.int().default(0),
  unintended_domain_cited: z.boolean().default(false),
  citation_count: z.int().default(0),
  search_used: z.boolean().default(false),
  search_query_count: z.int().default(0),
  sentiment: z.string().nullable().default(null),
  avg_position: z.number().nullable().default(null),
  score: z.record(z.string(), z.unknown()).nullable().default(null),
  citations: z.array(citationEvidence).optional(),
  competitors_mentioned: z.array(z.string()).optional(),
  search_surface: searchSurfaceEvidence.nullable().default(null),
  created_at: z.iso.datetime({ offset: true }),
});

export const executionRoutes = [
  defineGetRoute({
    family: 'executions',
    path: '/api/v1/executions/{execution_id}',
    params: { path: { execution_id: { scalar: { kind: 'uuid' }, required: true } }, query: {} },
    response: executionEvidenceResponse,
    async handle({ c, db }, { path }) {
      try {
        return await getExecutionEvidence(db, {
          workspaceId: c.get('workspace').workspaceId,
          taskId: path.execution_id,
        });
      } catch (error) {
        if (error instanceof AnalysisNotFoundError) throw notFound('Execution');
        throw error;
      }
    },
  }),
];
