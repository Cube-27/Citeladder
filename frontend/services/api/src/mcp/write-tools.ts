import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { authorize } from '../commands/permission.ts';
import { payloadShape } from '../agent/payload-shape.ts';
import { previewTopics, PROMPTS_RUN } from '../commands/prompts.ts';
import type { ServiceConfig } from '../config.ts';
import { changeKinds } from '../changes/kinds.ts';
import type { Database } from '../db/database.ts';
import { plainJson } from '../db/json.ts';
import { listTopics } from '../prompts/topics.ts';
import { MCP_CHANGE_KINDS, PREPARE_CHANGE_DESCRIPTION } from './change-kinds.ts';
import { confirmChange, issueConfirmation } from './confirmations.ts';
import { writeActor } from './data.ts';
import { appLink } from './links.ts';
import { argumentProblem, inputSchema } from './tools.ts';
import { McpInputError, type Evidence, type McpPrincipal } from './types.ts';

type Context = { db: Database; config: ServiceConfig; principal: McpPrincipal; origin: string };
type Annotations = {
  readOnlyHint: false;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
};
type Definition<S extends z.ZodObject> = {
  title: string;
  description: string;
  schema: S;
  listed?: z.ZodObject;
  annotations: Annotations;
  run: (context: Context, args: z.output<S>) => Promise<Evidence>;
};
const tool = <S extends z.ZodObject>(definition: Definition<S>) => definition;
const hints = (destructive: boolean, idempotent: boolean): Annotations => ({
  readOnlyHint: false,
  destructiveHint: destructive,
  idempotentHint: idempotent,
  openWorldHint: false,
});
const uuid = z.uuid();
const project = {
  project_id: uuid.describe('A project id that list_projects returned.'),
};
const prepareFields = {
  ...project,
  kind: z.enum(MCP_CHANGE_KINDS).describe('The kind of change, from the list above.'),
};
const PAYLOAD_DESCRIPTION =
  'The change in its kind’s shape. Omit it to get the shape; nothing is prepared.';
const kindPayload = z.record(z.string(), z.json());

async function prepareChange(
  context: Context,
  args: { project_id: string; kind: (typeof MCP_CHANGE_KINDS)[number]; payload?: unknown },
): Promise<Evidence> {
  const { kind, project_id: projectId } = args;
  const entry = changeKinds[kind];
  if (args.payload === undefined)
    return { state: 'payload_shape', kind, payload: payloadShape(entry.proposal) };
  const checked = entry.proposal.safeParse(args.payload);
  if (!checked.success)
    throw new McpInputError(
      `${argumentProblem(checked.error)}. The ${kind} payload is ${payloadShape(entry.proposal)}`,
    );
  const actor = await writeActor(context.db, context.principal, projectId);
  const change = { id: randomUUID(), projectId };
  const scope = {
    db: context.db,
    config: context.config,
    workspaceId: actor.workspaceId,
    projectId,
  };
  const { payload, preview } = await entry.stage(scope, actor, change, args.payload);
  const { title, rows, spend, opens } = preview;
  return {
    state: 'needs_confirmation',
    kind,
    preview: {
      title,
      rows,
      spend,
      opens: opens && { label: opens.label, url: appLink(context.origin, opens.path, projectId) },
    },
    ...(await issueConfirmation(context.db, context.config, {
      change,
      principal: context.principal,
      actor,
      kind,
      payload: kindPayload.parse(plainJson(payload)),
    })),
  };
}

const writeDefinitions = {
  preview_topics: tool({
    title: 'Preview topics',
    description:
      'Propose buyer-facing topics for the project beside the topics it already has, as the Prompt Builder\'s topic step does. A topic is a category a buyer asks about (for example "golf nets"), never a product line, model, size or the brand. Spends one AI model call and saves nothing: show the user the existing and proposed topic names, let them keep, rename, delete or add, then save the plan they agreed to with confirm_topics. more lists proposals past the cap. Refused until the project lists at least one offering.',
    schema: z.strictObject(project),
    annotations: hints(false, false),
    run: async (context, args) => {
      const actor = authorize(
        await writeActor(context.db, context.principal, args.project_id),
        PROMPTS_RUN,
      );
      const preview = await previewTopics(context.db, actor, args.project_id);
      const existing = await listTopics(context.db, {
        workspaceId: actor.workspaceId,
        projectId: args.project_id,
      });
      return {
        state: 'proposed',
        existing_topics: existing.map(({ id, name }) => ({ id, name })),
        proposed_topics: preview.topics,
        more: preview.overflow,
        instruction:
          'Show the user the topic names without ids. Nothing is saved until confirm_topics.',
      };
    },
  }),
  prepare_change: tool({
    title: 'Prepare a change',
    description: PREPARE_CHANGE_DESCRIPTION,
    schema: z.strictObject({ ...prepareFields, payload: kindPayload.optional() }),
    listed: z.strictObject({
      ...prepareFields,
      payload: z
        .union(MCP_CHANGE_KINDS.map((kind) => changeKinds[kind].proposal))
        .optional()
        .describe(PAYLOAD_DESCRIPTION),
    }),
    annotations: hints(false, false),
    run: prepareChange,
  }),
  confirm_change: tool({
    title: 'Confirm a prepared change',
    description:
      'Make a change a prepare tool previewed. Call only after the user explicitly agreed to that preview in this conversation. A token works once, for ten minutes.',
    schema: z.strictObject({
      confirmation_token: z
        .string()
        .trim()
        .min(1)
        .max(64)
        .describe('The confirmation_token the prepare tool returned, exactly as given.'),
    }),
    annotations: { ...hints(true, false), openWorldHint: true },
    run: async ({ db, config, principal }, args) => {
      const { kind, result } = await confirmChange({
        db,
        config,
        principal,
        token: args.confirmation_token,
      });
      return { state: 'changed', change: kind, ...result };
    },
  }),
};

type WriteToolName = keyof typeof writeDefinitions;
export const writeTools = Object.entries(writeDefinitions).map(([name, definition]) => ({
  name,
  title: definition.title,
  description: definition.description,
  inputSchema: inputSchema(definition.listed ?? definition.schema),
  annotations: definition.annotations,
}));
export function isWriteTool(name: string): name is WriteToolName {
  return Object.hasOwn(writeDefinitions, name);
}

const output = z.record(z.string(), z.json());
export async function dispatchWrite(
  context: Context,
  name: WriteToolName,
  input: unknown,
): Promise<Evidence> {
  if (!context.principal.canWrite) throw new McpInputError(`Unknown tool: ${name}`);
  const definition: Definition<z.ZodObject> = writeDefinitions[name];
  const parsed = definition.schema.safeParse(input);
  if (!parsed.success) throw new McpInputError(argumentProblem(parsed.error));
  return output.parse(plainJson(await definition.run(context, parsed.data)));
}
