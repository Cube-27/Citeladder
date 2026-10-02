import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Context } from 'hono';
import type { AppEnv } from '../context.ts';
import type { Database } from '../db/database.ts';
import { ApiError, notFound } from '../errors.ts';
import {
  agentRequestSchemas,
  agentChatDetailSchema,
  agentChatsPageSchema,
  agentTurnAcceptedSchema,
  agentRunSchema,
  agentRevisionsPageSchema,
  agentRevisionSchema,
  agentSkillCatalogSchema,
  agentInstructionsSchema,
} from '@citeladder/contracts/agent';
import { asApiErrorCode } from '@citeladder/contracts/error-codes';
import { readBody } from '../http/body.ts';
import { agentBindings } from '../agent/bindings.ts';
import { agentPolicy, AgentError, type Scope } from '../agent/contracts.ts';
import { authorize } from '../agent/access.ts';
import { readChat, listChats, listRevisions, runView, revisionView } from '../agent/reads.ts';
import { defineGetRoute, definePostRoute, definePutRoute, defineDeleteRoute } from './define.ts';

const family = 'agent',
  body = agentRequestSchemas(agentPolicy);
const projectPath = { project_id: { scalar: { kind: 'uuid' }, required: true } } as const;
const chatPath = { chat_id: { scalar: { kind: 'uuid' }, required: true } } as const;
const revisionPath = {
  ...chatPath,
  revision_id: { scalar: { kind: 'uuid' }, required: true },
} as const;
const headers = z.object({
  'Idempotency-Key': z.string().max(agentPolicy.idempotency_key_max_chars).nullish(),
});
function key(c: Context<AppEnv>) {
  const value = c.req.header('Idempotency-Key') ?? '';
  if (value.length > agentPolicy.idempotency_key_max_chars)
    throw new ApiError(422, 'Idempotency-Key is too long');
  return value.trim() || randomUUID();
}
function scope(c: Context<AppEnv>, projectId: string): Scope {
  return { workspaceId: c.get('workspace').workspaceId, userId: c.get('user').id, projectId };
}
async function chatScope(db: Database, c: Context<AppEnv>, id: string) {
  const row = await db
    .selectFrom('agent_chats')
    .select('project_id')
    .where('workspace_id', '=', c.get('workspace').workspaceId)
    .where('id', '=', id)
    .executeTakeFirst();
  if (!row) throw notFound('Chat');
  const value = scope(c, row.project_id);
  await authorize(db, value, false);
  return value;
}
async function mapped<T>(action: () => Promise<T>) {
  try {
    return await action();
  } catch (error) {
    if (!(error instanceof AgentError)) throw error;
    if (['funding_unavailable', 'route_unavailable', 'model_changed'].includes(error.code))
      throw new ApiError(402, 'Agent funding is unavailable', {
        code: asApiErrorCode('agent_funding_unavailable'),
      });
    if (error.code === 'access_revoked' || error.code === 'capability_unavailable')
      throw new ApiError(403, 'Agent run permission is unavailable');
    if (error.code === 'agent_context_unavailable') throw notFound('Agent context');
    if (error.code === 'agent_legacy_replay')
      throw new ApiError(
        409,
        'This key belongs to a pre-cutover Agent run. Read the existing chat; use a new key for new work.',
        {
          code: asApiErrorCode('agent_idempotency_conflict'),
          details: { reason: 'legacy_runtime' },
        },
      );
    throw new ApiError(409, 'Agent request conflicts with the current state', {
      code: asApiErrorCode(conflictCode(error.code)),
    });
  }
}
function conflictCode(code: string) {
  if (code === 'output_conflict') return 'agent_output_conflict';
  if (code === 'protocol_violation') return 'validation_error';
  return code;
}
export const agentRoutes = [
  defineGetRoute({
    family,
    path: '/api/v1/agent/skills',
    params: { path: {}, query: {} },
    response: agentSkillCatalogSchema,
    async handle({ db }) {
      const { catalog } = await agentBindings(db);
      return { skills: [...catalog.skills.values()] };
    },
  }),
  defineGetRoute({
    family,
    path: '/api/v1/projects/{project_id}/agent/chats',
    params: {
      path: projectPath,
      query: {
        limit: {
          scalar: { kind: 'int', ge: 1, le: agentPolicy.list_max_limit },
          default: agentPolicy.list_default_limit,
        },
        q: { scalar: { kind: 'str', maxLength: 120 } },
        action_id: { scalar: { kind: 'uuid' } },
        cursor: { scalar: { kind: 'str', maxLength: 512 } },
      },
    },
    response: agentChatsPageSchema,
    async handle({ db, c }, { path, query }) {
      try {
        return await listChats(db, scope(c, path.project_id), {
          limit: query.limit,
          query: query.q ?? undefined,
          actionId: query.action_id ?? undefined,
          cursor: query.cursor ?? undefined,
        });
      } catch (error) {
        if (error instanceof SyntaxError || error instanceof z.ZodError)
          throw new ApiError(400, 'Invalid chat cursor', {
            code: asApiErrorCode('invalid_cursor'),
          });
        throw error;
      }
    },
  }),
  definePostRoute({
    family,
    path: '/api/v1/projects/{project_id}/agent/chats',
    capability: 'run',
    params: { path: projectPath, query: {} },
    headers,
    body: body.create,
    response: agentTurnAcceptedSchema,
    status: 202,
    async handle({ db, c }, { path }) {
      const input = await readBody(c, body.create),
        { store } = await agentBindings(db);
      const run = await mapped(() =>
        store.enqueue(scope(c, path.project_id), {
          message: input.message,
          skillId: input.skill_id ?? undefined,
          actionId: input.action_id ?? undefined,
          refs: z
            .record(z.string(), z.json())
            .parse(
              Object.fromEntries(
                Object.entries(input.context).filter(([, value]) => value != null),
              ),
            ),
          mentionIds: input.mentions,
          key: key(c),
        }),
      );
      return { chat_id: run.chat_id, run: runView(run) };
    },
  }),
  defineGetRoute({
    family,
    path: '/api/v1/agent/chats/{chat_id}',
    params: { path: chatPath, query: {} },
    response: agentChatDetailSchema,
    async handle({ db, c }, { path }) {
      return readChat(db, await chatScope(db, c, path.chat_id), path.chat_id);
    },
  }),
  definePostRoute({
    family,
    path: '/api/v1/agent/chats/{chat_id}/messages',
    capability: 'run',
    params: { path: chatPath, query: {} },
    headers,
    body: body.message,
    response: agentTurnAcceptedSchema,
    status: 202,
    async handle({ db, c }, { path }) {
      const input = await readBody(c, body.message),
        value = await chatScope(db, c, path.chat_id),
        { store } = await agentBindings(db);
      const run = await mapped(() =>
        store.enqueue(value, {
          chatId: path.chat_id,
          message: input.message,
          skillId: input.skill_id ?? undefined,
          mentionIds: input.mentions,
          key: key(c),
        }),
      );
      return { chat_id: run.chat_id, run: runView(run) };
    },
  }),
  definePostRoute({
    family,
    path: '/api/v1/agent/chats/{chat_id}/runs/{run_id}/cancel',
    capability: 'run',
    params: {
      path: { ...chatPath, run_id: { scalar: { kind: 'uuid' }, required: true } },
      query: {},
    },
    response: agentRunSchema,
    async handle({ db, c }, { path }) {
      const value = await chatScope(db, c, path.chat_id),
        { store } = await agentBindings(db);
      await mapped(() => store.cancel(value, path.chat_id, path.run_id));
      const run = await db
        .selectFrom('agent_runs')
        .selectAll()
        .where('workspace_id', '=', value.workspaceId)
        .where('chat_id', '=', path.chat_id)
        .where('id', '=', path.run_id)
        .executeTakeFirstOrThrow();
      return runView(run);
    },
  }),
  defineDeleteRoute({
    family,
    path: '/api/v1/agent/chats/{chat_id}',
    capability: 'run',
    params: { path: chatPath, query: {} },
    async handle({ db, c }, { path }) {
      const value = await chatScope(db, c, path.chat_id),
        { store } = await agentBindings(db);
      await mapped(() => store.archive(value, path.chat_id));
    },
  }),
  defineGetRoute({
    family,
    path: '/api/v1/agent/chats/{chat_id}/output/revisions',
    params: { path: chatPath, query: {} },
    response: agentRevisionsPageSchema,
    async handle({ db, c }, { path }) {
      return listRevisions(db, await chatScope(db, c, path.chat_id), path.chat_id);
    },
  }),
  definePostRoute({
    family,
    path: '/api/v1/agent/chats/{chat_id}/output/revisions',
    capability: 'run',
    params: { path: chatPath, query: {} },
    body: body.edit,
    response: agentRevisionSchema,
    status: 201,
    async handle({ db, c }, { path }) {
      const input = await readBody(c, body.edit),
        value = await chatScope(db, c, path.chat_id),
        { outputs } = await agentBindings(db);
      return revisionView(
        await mapped(() =>
          outputs.edit(value, path.chat_id, input.base_revision_id, input.title, input.body),
        ),
      );
    },
  }),
  definePostRoute({
    family,
    path: '/api/v1/agent/chats/{chat_id}/output/revisions/{revision_id}/restore',
    capability: 'run',
    params: { path: revisionPath, query: {} },
    response: agentRevisionSchema,
    status: 201,
    async handle({ db, c }, { path }) {
      const value = await chatScope(db, c, path.chat_id),
        { outputs } = await agentBindings(db);
      return revisionView(
        await mapped(() => outputs.restore(value, path.chat_id, path.revision_id)),
      );
    },
  }),
  definePostRoute({
    family,
    path: '/api/v1/agent/chats/{chat_id}/output/approve-outline',
    capability: 'run',
    params: { path: chatPath, query: {} },
    headers,
    body: body.approve,
    response: agentTurnAcceptedSchema,
    status: 202,
    async handle({ db, c }, { path }) {
      const input = await readBody(c, body.approve),
        value = await chatScope(db, c, path.chat_id),
        { store } = await agentBindings(db);
      const run = await mapped(() =>
        store.approveOutline(value, path.chat_id, input.revision_id, key(c)),
      );
      return { chat_id: run.chat_id, run: runView(run) };
    },
  }),
  defineGetRoute({
    family,
    path: '/api/v1/projects/{project_id}/agent/instructions',
    params: { path: projectPath, query: {} },
    response: agentInstructionsSchema,
    async handle({ db, c }, { path }) {
      const value = scope(c, path.project_id);
      await authorize(db, value, false);
      const row = await db
        .selectFrom('agent_instruction_revisions')
        .selectAll()
        .where('workspace_id', '=', value.workspaceId)
        .where('project_id', '=', value.projectId)
        .orderBy('revision', 'desc')
        .executeTakeFirst();
      return {
        revision: row?.revision ?? null,
        text: row?.text ?? '',
        created_at: row?.created_at.toISOString() ?? null,
      };
    },
  }),
  definePutRoute({
    family,
    path: '/api/v1/projects/{project_id}/agent/instructions',
    capability: 'run',
    params: { path: projectPath, query: {} },
    body: body.instructions,
    response: agentInstructionsSchema,
    async handle({ db, c }, { path }) {
      const input = await readBody(c, body.instructions),
        { outputs } = await agentBindings(db);
      const row = await mapped(() =>
        outputs.saveInstructions(scope(c, path.project_id), input.text.trim()),
      );
      return { revision: row.revision, text: row.text, created_at: row.created_at.toISOString() };
    },
  }),
];
