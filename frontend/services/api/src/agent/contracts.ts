import { z } from 'zod';
import type { Selectable } from 'kysely';
import type { AgentChats, AgentRuns, AgentModelAttempts } from '../generated/db-schema.ts';
import { policy } from '../config.ts';

export const agentPolicy = policy.agent;
export type Chat = Selectable<AgentChats>;
export type Run = Selectable<AgentRuns>;
export type ModelAttempt = Selectable<AgentModelAttempts>;
export type Json = z.infer<ReturnType<typeof z.json>>;
export type Scope = { workspaceId: string; projectId: string; userId: string };
export type Lease = { runId: string; workspaceId: string; owner: string; attempt: number };
export class AgentError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  constructor(code: string, retryable = false) {
    super(code);
    this.code = code;
    this.retryable = retryable;
  }
}
export const budgetSchema = z.object({
  version: z.literal(1),
  max_steps: z.number().int().positive(),
  max_tool_calls: z.number().int().nonnegative(),
  execution_timeout_seconds: z.number().positive(),
  max_protocol_errors: z.number().int().positive(),
  tool_result_max_chars: z.number().int().positive(),
  context_package_max_chars: z.number().int().positive(),
  transcript_max_chars: z.number().int().positive(),
  history_max_messages: z.number().int().positive(),
  history_message_max_chars: z.number().int().positive(),
  prior_evidence_max_refs: z.number().int().positive(),
  reply_max_chars: z.number().int().positive(),
  output_body_max_chars: z.number().int().positive(),
  output_title_max_chars: z.number().int().positive(),
});
export function admittedBudget(executionTimeoutSeconds: number) {
  return budgetSchema.parse({
    ...agentPolicy,
    version: 1,
    execution_timeout_seconds: executionTimeoutSeconds,
  });
}
export const outputPayloadSchema = z
  .object({
    title: z.string().trim().min(1).max(agentPolicy.output_title_max_chars),
    body: z.string().trim().min(1).max(agentPolicy.output_body_max_chars),
    phase: z.enum(['outline', 'draft', 'final']),
    target_kind: z.enum(['page', 'planned_page']).nullish(),
    target: z.string().nullish(),
    format_id: z.string().nullish(),
  })
  .strict();
// Wire fields are nullable for structured providers; decisions narrow to a union.
const wireStep = z
  .object({
    action: z.enum(['select_skill', 'call_tool', 'respond']),
    skill_id: z.string().nullish(),
    tool: z.string().nullish(),
    arguments: z.record(z.string(), z.json()).nullish(),
    reply: z.string().nullish(),
    evidence: z.array(z.string()).nullish(),
    output: outputPayloadSchema.nullish(),
  })
  .strict();
export type OutputPayload = z.infer<typeof outputPayloadSchema>;
export type Step =
  | { action: 'select_skill'; skillId: string }
  | { action: 'call_tool'; tool: string; arguments: Record<string, Json> }
  | { action: 'respond'; reply: string; evidence: string[]; output: OutputPayload | null };
export function parseStep(content: string, skills?: ReadonlyMap<string, Skill>): Step {
  try {
    const value = wireStep.parse(JSON.parse(content));
    if (value.action === 'select_skill' && skills && !skills.has(value.skill_id ?? ''))
      throw new AgentError('protocol_violation');
    if (value.action === 'select_skill' && value.skill_id)
      return { action: value.action, skillId: value.skill_id };
    if (value.action === 'call_tool' && value.tool)
      return { action: value.action, tool: value.tool, arguments: value.arguments ?? {} };
    if (value.action === 'respond' && value.reply?.trim())
      return {
        action: value.action,
        reply: value.reply,
        evidence: value.evidence ?? [],
        output: value.output ?? null,
      };
  } catch {
    /* A provider response never leaks into an error. */
  }
  throw new AgentError('protocol_violation');
}
export type Skill = {
  id: string;
  description: string;
  version: number;
  outputKind: string;
  body: string;
  outlineFirst: boolean;
};
export type SkillCatalog = {
  version: string;
  operatingContract: string;
  skills: ReadonlyMap<string, Skill>;
  formatPreamble?: string;
  formats?: ReadonlyMap<string, { id: string; label: string; body: string }>;
};
export const stepJsonSchema = z.toJSONSchema(wireStep);
