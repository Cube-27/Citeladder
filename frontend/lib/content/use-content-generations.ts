'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  CONTENT_DETAIL_POLL_MS,
  CONTENT_LIST_DEFAULT_LIMIT,
  CONTENT_LIST_POLL_MS,
  contentApi,
  type SiteHealthReferenceInput,
} from '@/lib/api/content';
import { queryKeys } from '@/lib/api/query-keys';
import type {
  ContentFeedbackReason,
  ContentGenerationDetail,
  ContentGenerationStatus,
} from '@/lib/api/types';

const TERMINAL_STATUSES: ReadonlySet<ContentGenerationStatus> = new Set([
  'succeeded',
  'failed',
  'cancelled',
]);

export function isTerminalContentStatus(status: ContentGenerationStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

/** RFC 4122 v4 idempotency key: `randomUUID` when available, else built from
 * `getRandomValues` — the enqueue key must never be empty (the backend keys
 * replay-safety on it). */
function newIdempotencyKey(): string {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj?.randomUUID) return cryptoObj.randomUUID();
  const bytes = cryptoObj.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** The origins a new generation inherits from however the screen was reached. */
export type ContentGenerationsOptions = {
  limit?: number;
  opportunityId?: string | null;
  demandSignalId?: string | null;
  target?: { siteUrlId?: string; url?: string };
  siteHealthReference?: SiteHealthReferenceInput;
};

/**
 * Data orchestration for the Content screen.
 *
 * Progress is POLLING-ONLY (no SSE): the history list refetches at
 * `CONTENT_LIST_POLL_MS` while any visible item is non-terminal and stops
 * (`false`) once all are terminal; the selected detail refetches at
 * `CONTENT_DETAIL_POLL_MS` while the record is non-terminal (like `runs.ts`).
 * Every mutation invalidates the list; enqueue-like mutations also select the
 * new record so the screen follows it.
 */
export function useContentGenerations(
  projectId: string | null,
  {
    limit = CONTENT_LIST_DEFAULT_LIMIT,
    opportunityId,
    demandSignalId,
    target,
    siteHealthReference,
  }: ContentGenerationsOptions = {},
) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: queryKeys.content.list(projectId ?? '', limit),
    queryFn: ({ signal }) => contentApi.listGenerations(projectId ?? '', limit, { signal }),
    enabled: Boolean(projectId),
    refetchInterval: (query) => {
      const items = query.state.data;
      if (!items || items.length === 0) return false;
      return items.some((item) => !isTerminalContentStatus(item.status))
        ? CONTENT_LIST_POLL_MS
        : false;
    },
  });

  const detailQuery = useQuery({
    queryKey: queryKeys.content.detail(selectedId ?? ''),
    queryFn: ({ signal }) => contentApi.getGeneration(selectedId ?? '', { signal }),
    enabled: Boolean(selectedId),
    refetchInterval: (query) => {
      const record = query.state.data;
      if (!record) return CONTENT_DETAIL_POLL_MS;
      return isTerminalContentStatus(record.status) ? false : CONTENT_DETAIL_POLL_MS;
    },
  });

  useEffect(() => {
    if (!opportunityId || detailQuery.data?.status !== 'succeeded') return;
    void queryClient.invalidateQueries({
      queryKey: queryKeys.opportunities.detail(opportunityId),
    });
  }, [detailQuery.data?.status, opportunityId, queryClient]);

  const invalidateList = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.content.all });
  };

  const followRecord = (record: ContentGenerationDetail) => {
    queryClient.setQueryData(queryKeys.content.detail(record.id), record);
    setSelectedId(record.id);
    invalidateList();
  };

  const enqueueMutation = useMutation({
    // `skillId` is validated against the server-owned catalog, not a frontend
    // union — a skill added backend-side must not need a client release.
    mutationFn: (input: { userInstruction: string; skillId: string }) =>
      contentApi.enqueueGeneration(
        {
          project_id: projectId ?? '',
          user_instruction: input.userInstruction,
          skill_id: input.skillId,
          target_site_url_id: target?.siteUrlId,
          target_url: target?.url,
          opportunity_id: opportunityId ?? undefined,
          demand_signal_id: demandSignalId ?? undefined,
          site_health_reference: siteHealthReference,
        },
        newIdempotencyKey(),
      ),
    onSuccess: followRecord,
  });

  const regenerateMutation = useMutation({
    mutationFn: (generationId: string) => contentApi.regenerateGeneration(generationId),
    onSuccess: followRecord,
  });

  const tryAgainMutation = useMutation({
    mutationFn: (generationId: string) => contentApi.tryAgainGeneration(generationId),
    onSuccess: followRecord,
  });

  const cancelMutation = useMutation({
    mutationFn: (generationId: string) => contentApi.cancelGeneration(generationId),
    onSuccess: (record) => {
      queryClient.setQueryData(queryKeys.content.detail(record.id), record);
      invalidateList();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (generationId: string) => contentApi.deleteGeneration(generationId),
    onSuccess: (_result, generationId) => {
      queryClient.removeQueries({ queryKey: queryKeys.content.detail(generationId) });
      if (selectedId === generationId) setSelectedId(null);
      invalidateList();
    },
  });

  const clearHistoryMutation = useMutation({
    mutationFn: () => contentApi.clearGenerationHistory(projectId ?? ''),
    onSuccess: () => {
      const selectedStatus =
        detailQuery.data?.status ?? listQuery.data?.find((item) => item.id === selectedId)?.status;
      if (selectedId && (!selectedStatus || isTerminalContentStatus(selectedStatus))) {
        setSelectedId(null);
      }
      invalidateList();
    },
  });

  const feedbackMutation = useMutation({
    mutationFn: (input: {
      generationId: string;
      feedback: 'accepted' | 'rejected';
      reason?: ContentFeedbackReason;
    }) => contentApi.recordFeedback(input.generationId, input.feedback, input.reason),
    onSuccess: (record) => {
      queryClient.setQueryData(queryKeys.content.detail(record.id), record);
      invalidateList();
    },
  });

  return {
    listQuery,
    detailQuery,
    selectedId,
    setSelectedId,
    enqueueMutation,
    regenerateMutation,
    tryAgainMutation,
    cancelMutation,
    deleteMutation,
    clearHistoryMutation,
    feedbackMutation,
  };
}
