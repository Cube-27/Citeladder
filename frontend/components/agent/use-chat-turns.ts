'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { agentWriteFailure } from '@/lib/agent/errors';
import { useRequestKey } from '@/lib/agent/idempotency';
import { isRunActive } from '@/lib/agent/run-state';
import {
  agentMutations,
  agentQueries,
  type AgentChatDetail,
  type AgentContextRefs,
} from '@/lib/api/agent';
import { queryKeys } from '@/lib/api/query-keys';
import { AGENT_RUN_POLL_MS } from '@/lib/config/agent';

/**
 * The persisted chat. Reads never run the agent, so while a turn is active the
 * chat is polled until the run reaches a terminal state.
 */
export function useChatDetail(workspaceId: string, chatId: string) {
  return useQuery({
    ...agentQueries.chat(workspaceId, chatId),
    enabled: Boolean(workspaceId && chatId),
    refetchInterval: (state) =>
      isRunActive(state.state.data?.latest_run) ? AGENT_RUN_POLL_MS : false,
  });
}

export type NewChatInput = {
  message: string;
  skillId: string | null;
  actionId?: string;
  context: AgentContextRefs;
};

/** Starts a chat once per accepted request; `onCreated` receives its id. */
export function useCreateChat(
  workspaceId: string,
  projectId: string,
  onCreated: (chatId: string) => void,
) {
  const queryClient = useQueryClient();
  const requestKey = useRequestKey();
  const mutation = useMutation({
    ...agentMutations.createChat(workspaceId),
    onSuccess: (accepted) => {
      requestKey.accepted();
      void queryClient.invalidateQueries({ queryKey: queryKeys.agent.chatLists(projectId) });
      onCreated(accepted.chat_id);
    },
  });
  const start = ({ message, skillId, actionId, context }: NewChatInput) => {
    const input = {
      message: message.trim(),
      skill_id: skillId ?? undefined,
      action_id: actionId,
      context,
    };
    mutation.mutate({ projectId, idempotencyKey: requestKey.keyFor({ projectId, input }), input });
  };
  return {
    start,
    pending: mutation.isPending,
    failure: mutation.isError ? agentWriteFailure(mutation.error) : null,
  };
}

/** A follow-up turn: revises the chat's output when there is one. */
export function useFollowUp(workspaceId: string, detail: AgentChatDetail) {
  const chatId = detail.chat.id;
  const [draft, setDraft] = useState('');
  const [skillId, setSkillId] = useState<string | null>(null);
  const [lastMessage, setLastMessage] = useState('');
  const requestKey = useRequestKey();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    ...agentMutations.sendMessage(workspaceId),
    onSuccess: async () => {
      requestKey.accepted();
      setDraft('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.agent.chat(chatId) }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.agent.chatLists(detail.chat.project_id),
        }),
      ]);
    },
  });
  const send = (message: string) => {
    const text = message.trim();
    if (!text) return;
    setLastMessage(text);
    const request = { chatId, message: text, skillId: skillId ?? undefined };
    mutation.mutate({ ...request, idempotencyKey: requestKey.keyFor(request) });
  };
  return {
    draft,
    setDraft,
    skillId,
    setSkillId,
    lastMessage,
    send,
    pending: mutation.isPending,
    failure: mutation.isError ? agentWriteFailure(mutation.error) : null,
  };
}

export type FollowUp = ReturnType<typeof useFollowUp>;

export function useCancelRun(workspaceId: string, chatId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    ...agentMutations.cancelRun(workspaceId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.agent.chat(chatId) }),
  });
}
