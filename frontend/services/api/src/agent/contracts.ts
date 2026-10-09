import { z } from 'zod';
import type { Selectable } from 'kysely';
import type { AgentChats, AgentRuns, AgentModelAttempts } from '../generated/db-schema.ts';
import { policy } from '../config.ts';
import type { ContentFormat } from '../config/skill-inputs.ts';
import type { WorkflowCatalog } from './workflows.ts';

export const agentPolicy = policy.agent;
export type Chat = Selectable<AgentChats>;
export type Run = Selectable<AgentRuns>;
export type ModelAttempt = Selectable<AgentModelAttempts>;
export type Json = z.infer<ReturnType<typeof z.json>>;
export type Scope = { workspaceId: string; projectId: string; userId: string };
export type Lease = { runId: string; workspaceId: string; owner: string; attempt: number };
export class AgentError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
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
/**
 * What one step may return. The provider is held to exactly this shape and the
 * reply is parsed against it, so the model is never told one thing and judged
 * by another. An omitted list allows any value (checked against the catalog);
 * an empty list allows only null.
 */
export type StepSpec = {
  actions: readonly [Step['action'], ...Step['action'][]];
  skillIds?: readonly string[];
  /** `false` forbids an output; `formatIds` lists the formats it may name. */
  output?: false | { formatIds?: readonly string[] };
};
const ANY_STEP: StepSpec = { actions: ['use_skill', 'call_tool', 'respond'] };

/** Strict providers need every field present (nullable); parsing accepts an omitted null. */
function field<T extends z.ZodType>(type: T, strict: boolean) {
  return strict ? type.nullable() : type.nullish();
}
/** The provider sees the allowed values; parsing reads any string so a miss gets a precise hint. */
function choice(values: readonly string[] | undefined, strict: boolean) {
  if (!strict || values === undefined) return field(z.string(), strict);
  const [first, ...rest] = values;
  return first === undefined ? z.null() : field(z.enum([first, ...rest]), strict);
}
function stepSchema(spec: StepSpec, strict: boolean) {
  // Parsing still reads a forbidden output so the runtime can repair it with a precise hint.
  const output =
    spec.output === false && strict
      ? z.null()
      : field(
          z
            .object({
              title: z.string(),
              body: z.string(),
              phase: z.enum(['outline', 'draft', 'final']),
              target_kind: field(z.enum(['page', 'planned_page']), strict),
              target: field(z.string(), strict),
              format_id: choice(spec.output ? spec.output.formatIds : undefined, strict),
            })
            .strict(),
          strict,
        );
  return z
    .object({
      // Parsing reads every action so a refused one is recorded as a refused read, not a malformed step.
      action: z.enum(strict ? spec.actions : ANY_STEP.actions),
      skill_id: choice(spec.skillIds, strict),
      tool: field(z.string(), strict),
      // Tool arguments differ per tool; a strict schema cannot hold an open object.
      arguments_json: field(z.string(), strict),
      reply: field(z.string(), strict),
      output,
    })
    .strict();
}
/** The schema a structured-output provider enforces: every field required, every object closed. */
export function stepJsonSchema(spec: StepSpec): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(z.toJSONSchema(stepSchema(spec, true))).filter(([key]) => key !== '$schema'),
  );
}
const toolArguments = z.record(z.string(), z.json());

// Repair hints contain only server-owned instructions and catalog IDs, never provider values.
export function parseStep(
  content: string,
  skills?: ReadonlyMap<string, Skill>,
  bounds: OutputBounds = agentPolicy,
  spec: StepSpec = ANY_STEP,
): Step {
  let decoded: unknown;
  try {
    decoded = JSON.parse(content);
  } catch {
    throw new AgentProtocolError(
      'Return one JSON object without surrounding prose or Markdown fences.',
    );
  }
  const parsed = stepSchema(spec, false).safeParse(decoded);
  if (!parsed.success)
    throw new AgentProtocolError(
      'Match the supplied schema exactly: action, skill_id, tool, arguments_json, reply and output. Put deliverable fields inside output.',
    );
  const value = parsed.data;
  const allowed = spec.skillIds ?? (skills ? [...skills.keys()] : undefined);
  if (value.skill_id && allowed && !allowed.includes(value.skill_id))
    throw new AgentProtocolError(
      spec.skillIds?.length
        ? `Set skill_id to null or one of: ${spec.skillIds.join(', ')}. Do not use a label or output kind as skill_id.`
        : 'Set skill_id to null on this step.',
    );
  const skill = value.skill_id ? { skillId: value.skill_id } : {};
  if (value.action === 'use_skill' && value.skill_id)
    return { action: value.action, skillId: value.skill_id };
  if (value.action === 'call_tool' && value.tool?.trim())
    return {
      action: value.action,
      ...skill,
      tool: value.tool,
      arguments: decodeArguments(value.arguments_json),
    };
  if (value.action === 'respond' && value.reply?.trim())
    return {
      action: value.action,
      ...skill,
      reply: value.reply,
      output: value.output ? boundedOutput(value.output, bounds, spec) : null,
    };
  throw new AgentProtocolError(
    'For use_skill, provide skill_id. For call_tool, provide a nonblank tool name and arguments_json. For respond, provide a nonblank reply.',
  );
}
function decodeArguments(text: string | null | undefined): Record<string, Json> {
  if (!text?.trim()) return {};
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new AgentProtocolError('Set arguments_json to a JSON object encoded as a string.');
  }
  const parsed = toolArguments.safeParse(value);
  if (!parsed.success)
    throw new AgentProtocolError('Set arguments_json to a JSON object encoded as a string.');
  return parsed.data;
}
function boundedOutput(output: unknown, bounds: OutputBounds, spec: StepSpec): OutputPayload {
  const parsed = outputSchema(bounds).safeParse(output);
  if (!parsed.success)
    throw new AgentProtocolError(
      `Give output a nonblank title of at most ${bounds.output_title_max_chars} characters and a nonblank body of at most ${bounds.output_body_max_chars} characters.`,
    );
  const formats = spec.output ? spec.output.formatIds : undefined;
  const format = parsed.data.format_id;
  if (!format || formats === undefined || formats.includes(format)) return parsed.data;
  // A deliverable without content formats has nothing to name; the value is dropped.
  if (formats.length === 0) return { ...parsed.data, format_id: null };
  throw new AgentProtocolError(`Set output.format_id to null or one of: ${formats.join(', ')}.`);
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
  workflows?: WorkflowCatalog;
};
