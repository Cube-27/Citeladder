import { z } from 'zod';
import type { Selectable } from 'kysely';
import type { AgentChats, AgentRuns, AgentModelAttempts } from '../generated/db-schema.ts';
import { policy } from '../config.ts';
import type { ContentFormat } from '../config/skill-inputs.ts';

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
export class AgentProtocolError extends AgentError {
  readonly instruction: string;
  constructor(instruction: string) {
    super('protocol_violation');
    this.instruction = instruction;
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
type OutputBounds = Pick<typeof agentPolicy, 'output_title_max_chars' | 'output_body_max_chars'>;
export function outputSchema(bounds: OutputBounds = agentPolicy) {
  return outputPayloadSchema.extend({
    title: z.string().trim().min(1).max(bounds.output_title_max_chars),
    body: z.string().trim().min(1).max(bounds.output_body_max_chars),
  });
}
// Wire fields are nullable for structured providers; decisions narrow to a union.
const wireStep = z
  .object({
    action: z.enum(['use_skill', 'call_tool', 'respond']),
    skill_id: z.string().nullish(),
    tool: z.string().nullish(),
    arguments: z.record(z.string(), z.json()).nullish(),
    reply: z.string().nullish(),
    output: outputPayloadSchema.nullish(),
  })
  .strict();
export type OutputPayload = z.infer<typeof outputPayloadSchema>;
export type Step =
  | { action: 'use_skill'; skillId: string }
  | { action: 'call_tool'; skillId?: string; tool: string; arguments: Record<string, Json> }
  | {
      action: 'respond';
      skillId?: string;
      reply: string;
      output: OutputPayload | null;
    };
export function parseStep(
  content: string,
  skills?: ReadonlyMap<string, Skill>,
  bounds: OutputBounds = agentPolicy,
): Step {
  let decoded: unknown;
  try {
    decoded = JSON.parse(content);
  } catch {
    throw new AgentProtocolError(
      'Return one JSON object without surrounding prose or Markdown fences.',
    );
  }
  const parsed = wireSchema(bounds).safeParse(decoded);
  // Repair hints contain only server-owned instructions, never provider values.
  if (!parsed.success)
    throw new AgentProtocolError(
      'Match the supplied schema exactly. Use only action, skill_id, tool, arguments, reply and output. Put deliverable fields inside output.',
    );
  const value = parsed.data;
  if (value.skill_id && skills && !skills.has(value.skill_id))
    throw new AgentProtocolError(
      'Use an exact skill_id from the supplied catalog, or null for no new selection. Do not use a label or output kind as skill_id.',
    );
  const skill = value.skill_id ? { skillId: value.skill_id } : {};
  if (value.action === 'use_skill' && value.skill_id)
    return { action: value.action, skillId: value.skill_id };
  if (value.action === 'call_tool' && value.tool)
    return { action: value.action, ...skill, tool: value.tool, arguments: value.arguments ?? {} };
  if (value.action === 'respond' && value.reply?.trim())
    return {
      action: value.action,
      ...skill,
      reply: value.reply,
      output: value.output ?? null,
    };
  throw new AgentProtocolError(
    'For use_skill, provide skill_id. For call_tool, provide a nonblank tool name and arguments. For respond, provide a nonblank reply.',
  );
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
  formats?: ReadonlyMap<string, ContentFormat>;
};
function wireSchema(bounds: OutputBounds) {
  return wireStep.extend({ output: outputSchema(bounds).nullish() });
}
export function stepJsonSchemaFor(
  bounds: OutputBounds,
  actions?: Step['action'][],
  replyOnly = false,
  skillIds?: readonly string[],
  outputAllowed = true,
) {
  const schema = wireSchema(bounds).extend({
    ...(actions ? { action: z.enum(actions) } : {}),
    ...(skillIds ? { skill_id: z.enum(skillIds).nullish() } : {}),
    // A deliverable is written only after its methodology is supplied.
    ...(outputAllowed ? {} : { output: z.null().optional() }),
    ...(replyOnly ? { skill_id: z.null().optional(), output: z.null().optional() } : {}),
  });
  return z.toJSONSchema(schema);
}
