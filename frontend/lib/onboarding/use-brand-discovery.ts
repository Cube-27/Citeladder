'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';

import { brandDiscoveriesApi, type BrandDiscoveryInput } from '@/lib/api/brand-discoveries';

let fallbackOperationSequence = 0;

function operationKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  fallbackOperationSequence += 1;
  return `discovery-${Date.now()}-${fallbackOperationSequence}`;
}

export function useBrandDiscovery(
  input: BrandDiscoveryInput | null,
  resumeId: string | null = null,
  workspaceId: string | null = null,
) {
  // The workspace is part of the operation's identity, not just its transport:
  // a discovery belongs to ONE workspace, so switching workspace must start a
  // new one rather than let `createdFor` suppress creation for the new one.
  const fingerprint = useMemo(() => JSON.stringify({ input, workspaceId }), [input, workspaceId]);
  const createdFor = useRef<string | null>(null);
  const [responseFor, setResponseFor] = useState<string | null>(null);
  const create = useMutation({
    // The fingerprint AND the workspace travel with the request, so the
    // response is matched against the operation that actually produced it —
    // not against whatever the hook happens to be rendering for now.
    mutationFn: ({
      payload,
      idempotencyKey,
      workspace,
    }: {
      payload: BrandDiscoveryInput;
      idempotencyKey: string;
      fingerprint: string;
      workspace: string | null;
    }) => brandDiscoveriesApi.create(payload, idempotencyKey, { workspaceId: workspace }),
    onSuccess: (_data, variables) => {
      setResponseFor(variables.fingerprint);
    },
  });

  useEffect(() => {
    if (resumeId || !input || createdFor.current === fingerprint) return;
    createdFor.current = fingerprint;
    create.mutate({
      payload: input,
      idempotencyKey: operationKey(),
      fingerprint,
      workspace: workspaceId,
    });
  }, [create, fingerprint, input, resumeId, workspaceId]);

  const createdDiscoveryId = responseFor === fingerprint ? create.data?.id : undefined;
  // A successful retry supersedes a resumed row. Until that response arrives,
  // the persisted resume id remains visible instead of blanking the timeline.
  const discoveryId = createdDiscoveryId ?? resumeId;
  const query = useQuery({
    queryKey: ['brand-discovery', workspaceId ?? 'unresolved', discoveryId],
    queryFn: ({ signal }) => brandDiscoveriesApi.get(String(discoveryId), { signal, workspaceId }),
    enabled: Boolean(discoveryId),
    initialData: !createdDiscoveryId ? undefined : create.data,
    // `completing` is the portfolio generation the completion request queued.
    // It runs on a worker precisely because it outlives a client request, so
    // this poll is how the review screen learns the project exists.
    refetchInterval: (result) =>
      result.state.data?.status === 'queued' ||
      result.state.data?.status === 'running' ||
      result.state.data?.status === 'completing'
        ? 1000
        : false,
  });
  const discovery = query.data ?? (createdDiscoveryId ? create.data : undefined);
  const retry = () => {
    if (!input || create.isPending) return;
    createdFor.current = fingerprint;
    create.mutate({
      payload: input,
      idempotencyKey: operationKey(),
      fingerprint,
      workspace: workspaceId,
    });
  };
  return {
    discovery,
    isRunning:
      create.isPending || discovery?.status === 'queued' || discovery?.status === 'running',
    error: create.error ?? query.error,
    retry,
  };
}
