'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';

import { brandDiscoveriesApi, type BrandDiscoveryInput } from '@/lib/api/brand-discoveries';

function operationKey() {
  return globalThis.crypto?.randomUUID?.() ?? `discovery-${Date.now()}`;
}

export function useBrandDiscovery(
  input: BrandDiscoveryInput | null,
  resumeId: string | null = null,
) {
  const key = useRef(operationKey());
  const fingerprint = useMemo(() => JSON.stringify(input), [input]);
  const createdFor = useRef<string | null>(null);
  const [responseFor, setResponseFor] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: (payload: BrandDiscoveryInput) => brandDiscoveriesApi.create(payload, key.current),
    onSuccess: (_data, payload) => {
      setResponseFor(JSON.stringify(payload));
    },
  });

  useEffect(() => {
    if (resumeId || !input || createdFor.current === fingerprint) return;
    createdFor.current = fingerprint;
    key.current = operationKey();
    create.mutate(input);
  }, [create, fingerprint, input, resumeId]);

  const createdDiscoveryId = responseFor === fingerprint ? create.data?.id : undefined;
  // A successful retry supersedes a resumed row. Until that response arrives,
  // the persisted resume id remains visible instead of blanking the timeline.
  const discoveryId = createdDiscoveryId ?? resumeId;
  const query = useQuery({
    queryKey: ['brand-discovery', discoveryId],
    queryFn: ({ signal }) => brandDiscoveriesApi.get(discoveryId!, { signal }),
    enabled: Boolean(discoveryId),
    initialData: !createdDiscoveryId ? undefined : create.data,
    refetchInterval: (result) =>
      result.state.data?.status === 'queued' || result.state.data?.status === 'running'
        ? 1000
        : false,
  });
  const discovery = query.data ?? (createdDiscoveryId ? create.data : undefined);
  const retry = () => {
    if (!input || create.isPending) return;
    key.current = operationKey();
    createdFor.current = fingerprint;
    create.mutate(input);
  };
  return {
    discovery,
    isRunning:
      create.isPending || discovery?.status === 'queued' || discovery?.status === 'running',
    error: create.error ?? query.error,
    retry,
  };
}
