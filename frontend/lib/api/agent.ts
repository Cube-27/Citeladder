/**
 * Agent endpoints + query/mutation options.
 *
 * Chats are the saved work: messages are append-only, a chat owns at most one
 * output with immutable revisions, and reads never execute a turn — the UI
 * polls persisted state while a run is active. Writes that queue a turn carry
 * an idempotency key bound to the full request, so a retried send replays the
 * same run instead of queueing a second one.
 */
import { infiniteQueryOptions, mutationOptions, queryOptions } from '@tanstack/react-query';
import type { z } from 'zod';

import { AGENT_CHAT_PAGE_SIZE } from '@/lib/config/agent';

import { apiClient, type ApiRequestOptions } from './client';
import { queryKeys } from './query-keys';
import {
  agentChatDetailSchema,
  agentChatSummarySchema,
  agentChatsPageSchema,
  agentInstructionsSchema,
  agentMessageSchema,
  agentOutputSchema,
  agentRevisionSchema,
  agentRevisionsPageSchema,
  agentRunSchema,
  agentSkillCatalogSchema,
  agentSkillSchema,
  agentTurnAcceptedSchema,
} from './schemas/agent';
import { strictValidate } from './schemas/validation';
import { definedQuery, withQuery } from './shared';

export type AgentRun = z.infer<typeof agentRunSchema>;
export type AgentRevision = z.infer<typeof agentRevisionSchema>;
export type AgentOutput = z.infer<typeof agentOutputSchema>;
export type AgentMessage = z.infer<typeof agentMessageSchema>;
export type AgentChatSummary = z.infer<typeof agentChatSummarySchema>;
export type AgentChatDetail = z.infer<typeof agentChatDetailSchema>;
export type AgentSkill = z.infer<typeof agentSkillSchema>;

/**
 * Typed evidence a new chat starts from. The server resolves and authorizes
 * every identifier on each run; the browser never sends evidence content.
 */
export type AgentContextRefs = {
  target_url?: string;
  target_site_url_id?: string;
  opportunity_id?: string;
  demand_signal_id?: string;
  site_health_reference?: {
    project_id: string;
    crawl_id: string;
    site_url_id: string;
    source_analysis_id: string;
    dimension: string;
    checkpoint_ids: string[];
  };
  search_intelligence_reference?: { dataset_id: string; row_ids: string[] };
};

export type NewChatInput = {
  message: string;
  skill_id?: string;
  action_id?: string;
  context?: AgentContextRefs;
};

const withKey = (idempotencyKey: string, options?: ApiRequestOptions): ApiRequestOptions => ({
  ...options,
  idempotencyKey,
  retryNetworkFailures: true,
});

const agentApi = {
  skills: async (options?: ApiRequestOptions) =>
    strictValidate(
      agentSkillCatalogSchema,
      await apiClient.get('/agent/skills', options),
      'agent.skills',
    ),
  listChats: async (
    projectId: string,
    params: { q?: string; action_id?: string; cursor?: string; limit?: number },
    options?: ApiRequestOptions,
  ) =>
    strictValidate(
      agentChatsPageSchema,
      await apiClient.get(
        withQuery(`/projects/${projectId}/agent/chats`, definedQuery(params)),
        options,
      ),
      'agent.listChats',
    ),
  createChat: async (
    projectId: string,
    input: NewChatInput,
    idempotencyKey: string,
    options?: ApiRequestOptions,
  ) =>
    strictValidate(
      agentTurnAcceptedSchema,
      await apiClient.post(
        `/projects/${projectId}/agent/chats`,
        input,
        withKey(idempotencyKey, options),
      ),
      'agent.createChat',
    ),
  getChat: async (chatId: string, options?: ApiRequestOptions) =>
    strictValidate(
      agentChatDetailSchema,
      await apiClient.get(`/agent/chats/${chatId}`, options),
      'agent.getChat',
    ),
  sendMessage: async (
    chatId: string,
    input: { message: string; skill_id?: string },
    idempotencyKey: string,
    options?: ApiRequestOptions,
  ) =>
    strictValidate(
      agentTurnAcceptedSchema,
      await apiClient.post(
        `/agent/chats/${chatId}/messages`,
        input,
        withKey(idempotencyKey, options),
      ),
      'agent.sendMessage',
    ),
  cancelRun: async (chatId: string, runId: string, options?: ApiRequestOptions) =>
    strictValidate(
      agentRunSchema,
      await apiClient.post(`/agent/chats/${chatId}/runs/${runId}/cancel`, {}, options),
      'agent.cancelRun',
    ),
  revisions: async (chatId: string, options?: ApiRequestOptions) =>
    strictValidate(
      agentRevisionsPageSchema,
      await apiClient.get(`/agent/chats/${chatId}/output/revisions`, options),
      'agent.revisions',
    ),
  editOutput: async (
    chatId: string,
    input: { base_revision_id: string; title: string; body: string },
    options?: ApiRequestOptions,
  ) =>
    strictValidate(
      agentRevisionSchema,
      await apiClient.post(`/agent/chats/${chatId}/output/revisions`, input, options),
      'agent.editOutput',
    ),
  restoreRevision: async (chatId: string, revisionId: string, options?: ApiRequestOptions) =>
    strictValidate(
      agentRevisionSchema,
      await apiClient.post(
        `/agent/chats/${chatId}/output/revisions/${revisionId}/restore`,
        {},
        options,
      ),
      'agent.restoreRevision',
    ),
  approveOutline: async (
    chatId: string,
    revisionId: string,
    idempotencyKey: string,
    options?: ApiRequestOptions,
  ) =>
    strictValidate(
      agentTurnAcceptedSchema,
      await apiClient.post(
        `/agent/chats/${chatId}/output/approve-outline`,
        { revision_id: revisionId },
        withKey(idempotencyKey, options),
      ),
      'agent.approveOutline',
    ),
  instructions: async (projectId: string, options?: ApiRequestOptions) =>
    strictValidate(
      agentInstructionsSchema,
      await apiClient.get(`/projects/${projectId}/agent/instructions`, options),
      'agent.instructions',
    ),
  saveInstructions: async (projectId: string, text: string, options?: ApiRequestOptions) =>
    strictValidate(
      agentInstructionsSchema,
      await apiClient.put(`/projects/${projectId}/agent/instructions`, { text }, options),
      'agent.saveInstructions',
    ),
};

export const agentQueries = {
  skills: (workspaceId: string) =>
    queryOptions({
      queryKey: queryKeys.agent.skills(),
      queryFn: ({ signal }) => agentApi.skills({ signal, workspaceId }),
      staleTime: Infinity,
    }),
  chats: (workspaceId: string, projectId: string, filters: { q?: string; actionId?: string }) =>
    infiniteQueryOptions({
      queryKey: queryKeys.agent.chats(projectId, {
        q: filters.q || null,
        actionId: filters.actionId ?? null,
      }),
      initialPageParam: undefined as string | undefined,
      queryFn: ({ signal, pageParam }) =>
        agentApi.listChats(
          projectId,
          {
            q: filters.q || undefined,
            action_id: filters.actionId,
            cursor: pageParam,
            limit: AGENT_CHAT_PAGE_SIZE,
          },
          { signal, workspaceId },
        ),
      getNextPageParam: (page) => page.next_cursor ?? undefined,
    }),
  chat: (workspaceId: string, chatId: string) =>
    queryOptions({
      queryKey: queryKeys.agent.chat(chatId),
      queryFn: ({ signal }) => agentApi.getChat(chatId, { signal, workspaceId }),
    }),
  revisions: (workspaceId: string, chatId: string) =>
    queryOptions({
      queryKey: queryKeys.agent.revisions(chatId),
      queryFn: ({ signal }) => agentApi.revisions(chatId, { signal, workspaceId }),
    }),
  instructions: (workspaceId: string, projectId: string) =>
    queryOptions({
      queryKey: queryKeys.agent.instructions(projectId),
      queryFn: ({ signal }) => agentApi.instructions(projectId, { signal, workspaceId }),
    }),
};

export const agentMutations = {
  createChat: (workspaceId: string) =>
    mutationOptions({
      mutationFn: (vars: { projectId: string; input: NewChatInput; idempotencyKey: string }) =>
        agentApi.createChat(vars.projectId, vars.input, vars.idempotencyKey, { workspaceId }),
    }),
  sendMessage: (workspaceId: string) =>
    mutationOptions({
      mutationFn: (vars: {
        chatId: string;
        message: string;
        skillId?: string;
        idempotencyKey: string;
      }) =>
        agentApi.sendMessage(
          vars.chatId,
          { message: vars.message, skill_id: vars.skillId },
          vars.idempotencyKey,
          { workspaceId },
        ),
    }),
  cancelRun: (workspaceId: string) =>
    mutationOptions({
      mutationFn: (vars: { chatId: string; runId: string }) =>
        agentApi.cancelRun(vars.chatId, vars.runId, { workspaceId }),
    }),
  editOutput: (workspaceId: string) =>
    mutationOptions({
      mutationFn: (vars: { chatId: string; baseRevisionId: string; title: string; body: string }) =>
        agentApi.editOutput(
          vars.chatId,
          { base_revision_id: vars.baseRevisionId, title: vars.title, body: vars.body },
          { workspaceId },
        ),
    }),
  restoreRevision: (workspaceId: string) =>
    mutationOptions({
      mutationFn: (vars: { chatId: string; revisionId: string }) =>
        agentApi.restoreRevision(vars.chatId, vars.revisionId, { workspaceId }),
    }),
  approveOutline: (workspaceId: string) =>
    mutationOptions({
      mutationFn: (vars: { chatId: string; revisionId: string; idempotencyKey: string }) =>
        agentApi.approveOutline(vars.chatId, vars.revisionId, vars.idempotencyKey, {
          workspaceId,
        }),
    }),
  saveInstructions: (workspaceId: string) =>
    mutationOptions({
      mutationFn: (vars: { projectId: string; text: string }) =>
        agentApi.saveInstructions(vars.projectId, vars.text, { workspaceId }),
    }),
};
