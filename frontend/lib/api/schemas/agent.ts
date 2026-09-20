import { z } from 'zod';

const responseObject = <Shape extends z.ZodRawShape>(shape: Shape) => z.object(shape);

export const agentTaskTypeSchema = z.enum(['explain', 'build_roadmap']);
export const agentArtifactReferenceSchema = responseObject({ kind: z.string(), id: z.uuid() });
export const agentRoadmapItemSchema = responseObject({
  rank: z.number().int(),
  title: z.string(),
  remediation: z.string(),
  target_url: z.string().nullable(),
  priority_score: z.number(),
  severity: z.string(),
});
export const agentEvidenceSourceSchema = responseObject({
  key: z.enum(['site_health', 'search_demand', 'opportunities', 'ai_visibility']),
  label: z.string(),
  availability: z.enum(['available', 'unavailable']),
  window: z.record(z.string(), z.string()).nullable(),
  coverage: z.record(z.string(), z.union([z.number(), z.string(), z.null()])).nullable(),
  reason: z.string().nullable(),
});
export const agentResultSchema = responseObject({
  summary: z.string(),
  observations: z.array(z.string()),
  roadmap_items: z.array(agentRoadmapItemSchema),
  sources: z.array(agentEvidenceSourceSchema),
  limitations: z.array(z.string()),
  artifact_refs: z.array(agentArtifactReferenceSchema),
});
export const agentTaskRunSummarySchema = responseObject({
  id: z.uuid(),
  project_id: z.uuid(),
  task_type: agentTaskTypeSchema,
  objective: z.string(),
  status: z.string(),
  error_code: z.string(),
  error_detail: z.string(),
  attempt_count: z.number().int(),
  completed_at: z.string().nullable(),
  cancelled_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export const agentTaskRunSchema = agentTaskRunSummarySchema.extend({
  result: agentResultSchema.nullable(),
});
