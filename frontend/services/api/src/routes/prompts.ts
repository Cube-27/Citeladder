import {
  promptCandidateReviewResponseSchema,
  promptGenerateResponseSchema,
  promptCandidateSchema,
  promptSchema,
  promptSetSchema,
  topicSchema,
} from '@citeladder/contracts/project';
import { z } from 'zod';

import { enforceWorkspaceRequest } from '../abuse/usage.ts';
import { generationInput } from '../prompts/generation-input.ts';
import { generatePrompts } from '../prompts/generation.ts';
import { policy, resolveSettingSpec } from '../config.ts';
import { ApiError } from '../errors.ts';
import { readBody } from '../http/body.ts';
import { candidateReview, listCandidates, reviewCandidates } from '../prompts/candidates.ts';
import {
  createPromptSet,
  deletePromptSet,
  listPromptSets,
  promptSetCreate,
  promptSetUpdate,
  readPromptSet,
  updatePromptSet,
} from '../prompts/prompt-sets.ts';
import {
  bulkSetStatus,
  createPrompt,
  deletePrompt,
  importPrompts,
  listPrompts,
  promptBulkStatus,
  promptImport,
  promptInput,
  promptUpdate,
  updatePrompt,
} from '../prompts/prompts.ts';
import {
  createTopic,
  deleteTopic,
  listTopics,
  topicCreate,
  topicUpdate,
  updateTopic,
} from '../prompts/topics.ts';
import { defineDeleteRoute, defineGetRoute, definePatchRoute, definePostRoute } from './define.ts';

const family = 'prompts';
const api = '/api/v1';
const uuid = { scalar: { kind: 'uuid' }, required: true } as const;
const setPath = { prompt_set_id: uuid } as const;
const setRoot = `${api}/prompt-sets/{prompt_set_id}`;
const noQuery = {} as const;
/** A retried request with the same key replays the staged run without provider I/O. */
const generationHeaders = z.object({
  'Idempotency-Key': z.string().max(policy.prompts.generation.idempotency_key_max_chars).nullish(),
});

/** CSV import's own budget under the `bulk_import` request window. */
function bulkImportLimit() {
  return {
    operation: 'bulk_import',
    limit: resolveSettingSpec(policy.abuse.bulk_import_limit) as number,
    windowSeconds: resolveSettingSpec(policy.abuse.bulk_import_window_seconds) as number,
  };
}

export const promptRoutes = [
  definePostRoute({
    family: 'prompt-generation',
    path: `${setRoot}/generate`,
    capability: 'run',
    status: 201,
    params: { path: setPath, query: noQuery },
    body: generationInput,
    headers: generationHeaders,
    response: promptGenerateResponseSchema,
    async handle({ c, db }, { path }) {
      const key = c.req.header('Idempotency-Key')?.trim() ?? '';
      if (key.length > policy.prompts.generation.idempotency_key_max_chars)
        throw new ApiError(422, 'Idempotency-Key is too long', { code: 'generation_invalid' });
      return generatePrompts(
        db,
        c.get('workspace').workspaceId,
        path.prompt_set_id,
        await readBody(c, generationInput),
        undefined,
        key || null,
      );
    },
  }),
  defineGetRoute({
    family,
    path: `${api}/prompt-sets`,
    params: { path: {}, query: { project_id: { scalar: { kind: 'uuid' } } } },
    response: z.array(promptSetSchema),
    handle: ({ c, db }, { query }) =>
      listPromptSets(db, c.get('workspace').workspaceId, query.project_id ?? null),
  }),
  definePostRoute({
    family,
    path: `${api}/prompt-sets`,
    capability: 'write',
    status: 201,
    params: { path: {}, query: noQuery },
    body: promptSetCreate,
    response: promptSetSchema,
    async handle({ c, db }) {
      const input = await readBody(c, promptSetCreate);
      return createPromptSet(db, c.get('workspace').workspaceId, input);
    },
  }),
  defineGetRoute({
    family,
    path: setRoot,
    params: { path: setPath, query: noQuery },
    response: promptSetSchema,
    handle: ({ c, db }, { path }) =>
      readPromptSet(db, c.get('workspace').workspaceId, path.prompt_set_id),
  }),
  definePatchRoute({
    family,
    path: setRoot,
    capability: 'write',
    params: { path: setPath, query: noQuery },
    body: promptSetUpdate,
    response: promptSetSchema,
    async handle({ c, db }, { path }) {
      const input = await readBody(c, promptSetUpdate);
      return updatePromptSet(db, c.get('workspace').workspaceId, path.prompt_set_id, input);
    },
  }),
  defineDeleteRoute({
    family,
    path: setRoot,
    capability: 'write',
    params: { path: setPath, query: noQuery },
    handle: ({ c, db }, { path }) =>
      deletePromptSet(db, c.get('workspace').workspaceId, path.prompt_set_id),
  }),
  defineGetRoute({
    family,
    path: `${setRoot}/prompts`,
    params: { path: setPath, query: noQuery },
    response: z.array(promptSchema),
    handle: ({ c, db }, { path }) =>
      listPrompts(db, c.get('workspace').workspaceId, path.prompt_set_id),
  }),
  definePostRoute({
    family,
    path: `${setRoot}/prompts`,
    capability: 'write',
    status: 201,
    params: { path: setPath, query: noQuery },
    body: promptInput,
    response: promptSchema,
    async handle({ c, db }, { path }) {
      const input = await readBody(c, promptInput);
      return createPrompt(db, c.get('workspace').workspaceId, path.prompt_set_id, input);
    },
  }),
  definePostRoute({
    family,
    path: `${setRoot}/prompts/bulk-status`,
    capability: 'write',
    params: { path: setPath, query: noQuery },
    body: promptBulkStatus,
    response: promptSetSchema,
    async handle({ c, db }, { path }) {
      const input = await readBody(c, promptBulkStatus);
      return bulkSetStatus(db, c.get('workspace').workspaceId, path.prompt_set_id, input);
    },
  }),
  definePostRoute({
    family,
    path: `${setRoot}/import`,
    capability: 'write',
    status: 201,
    params: { path: setPath, query: noQuery },
    body: promptImport,
    response: promptSetSchema,
    async handle({ c, db }, { path }) {
      const workspaceId = c.get('workspace').workspaceId;
      await enforceWorkspaceRequest(db, workspaceId, bulkImportLimit());
      if (Buffer.byteLength(await c.req.text(), 'utf8') > policy.prompts.import_max_bytes) {
        throw new ApiError(413, 'Import body too large');
      }
      const input = await readBody(c, promptImport);
      return importPrompts(db, workspaceId, path.prompt_set_id, input);
    },
  }),
  defineGetRoute({
    family,
    path: `${setRoot}/candidates`,
    params: { path: setPath, query: noQuery },
    response: z.array(promptCandidateSchema),
    handle: ({ c, db }, { path }) =>
      listCandidates(db, c.get('workspace').workspaceId, path.prompt_set_id),
  }),
  definePostRoute({
    family,
    path: `${setRoot}/candidates/review`,
    capability: 'write',
    params: { path: setPath, query: noQuery },
    body: candidateReview,
    response: promptCandidateReviewResponseSchema,
    async handle({ c, db }, { path }) {
      const input = await readBody(c, candidateReview);
      return reviewCandidates(db, c.get('workspace').workspaceId, path.prompt_set_id, input);
    },
  }),
  definePatchRoute({
    family,
    path: `${api}/prompts/{prompt_id}`,
    capability: 'write',
    params: { path: { prompt_id: uuid }, query: noQuery },
    body: promptUpdate,
    response: promptSchema,
    async handle({ c, db }, { path }) {
      const input = await readBody(c, promptUpdate);
      return updatePrompt(db, c.get('workspace').workspaceId, path.prompt_id, input);
    },
  }),
  defineDeleteRoute({
    family,
    path: `${api}/prompts/{prompt_id}`,
    capability: 'write',
    params: { path: { prompt_id: uuid }, query: noQuery },
    handle: ({ c, db }, { path }) =>
      deletePrompt(db, c.get('workspace').workspaceId, path.prompt_id),
  }),
  defineGetRoute({
    family,
    path: `${api}/projects/{project_id}/topics`,
    params: { path: { project_id: uuid }, query: noQuery },
    response: z.array(topicSchema),
    handle: ({ c, db }, { path }) =>
      listTopics(db, c.get('workspace').workspaceId, path.project_id),
  }),
  definePostRoute({
    family,
    path: `${api}/projects/{project_id}/topics`,
    capability: 'write',
    status: 201,
    params: { path: { project_id: uuid }, query: noQuery },
    body: topicCreate,
    response: topicSchema,
    async handle({ c, db }, { path }) {
      const input = await readBody(c, topicCreate);
      return createTopic(db, c.get('workspace').workspaceId, path.project_id, input);
    },
  }),
  definePatchRoute({
    family,
    path: `${api}/topics/{topic_id}`,
    capability: 'write',
    params: { path: { topic_id: uuid }, query: noQuery },
    body: topicUpdate,
    response: topicSchema,
    async handle({ c, db }, { path }) {
      const input = await readBody(c, topicUpdate);
      return updateTopic(db, c.get('workspace').workspaceId, path.topic_id, input);
    },
  }),
  defineDeleteRoute({
    family,
    path: `${api}/topics/{topic_id}`,
    capability: 'write',
    params: { path: { topic_id: uuid }, query: noQuery },
    handle: ({ c, db }, { path }) => deleteTopic(db, c.get('workspace').workspaceId, path.topic_id),
  }),
];
