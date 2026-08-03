'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef } from 'react';

import { brandDiscoveriesApi, type BrandDiscoveryInput } from '@/lib/api/brand-discoveries';

function operationKey() {
  return globalThis.crypto?.randomUUID?.() ?? `discovery-${Date.now()}`;
}

export function useBrandDiscovery(input: BrandDiscoveryInput | null) {
  const key = useRef(operationKey());
  const fingerprint = useMemo(() => JSON.stringify(input), [input]);
  const createdFor = useRef<string | null>(null);
  const create = useMutation({
    mutationFn: (payload: BrandDiscoveryInput) => brandDiscoveriesApi.create(payload, key.current),
  });

  useEffect(() => {
    if (!input || createdFor.current === fingerprint) return;
    createdFor.current = fingerprint;
    key.current = operationKey();
    create.mutate(input);
  }, [create, fingerprint, input]);

  const discoveryId = create.data?.id;
  const query = useQuery({
    queryKey: ['brand-discovery', discoveryId],
    queryFn: ({ signal }) => brandDiscoveriesApi.get(discoveryId!, { signal }),
    enabled: Boolean(discoveryId),
    initialData: create.data,
    refetchInterval: (result) =>
      result.state.data?.status === 'queued' || result.state.data?.status === 'running'
        ? 1000
        : false,
  });
  const discovery = query.data ?? create.data;
  const retry = () => {
    if (!input) return;
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
