'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { providersApi } from '@/lib/api/providers';
import { queryKeys } from '@/lib/api/query-keys';
import type { ProviderConnection } from '@/lib/api/types';
import {
  connectionForTransport,
  isConnectable,
  isConfigured,
  mergeRoutePayload,
  type EngineCardModel,
} from './catalog';

/** Result of an inline "Test connection" run (the EngineCard alert model). */
export type ConnectionTestState = { status: 'ok' | 'failed'; message: string } | null;

/** Shared human-readable mutation error (matches the EngineCard fallback). */
export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'Something went wrong. Please try again.';
}

/**
 * Shared BYOK connection state machine for one logical engine (extracted from
 * `EngineCard` so the guided connect dialog can reuse it, Task 3.2).
 *
 * Owns the write-only API-key input state (never pre-filled — the stored
 * secret is never on the wire), the save mutation (create or rotate the
 * direct-transport connection and record the engine's catalog route), and the
 * "Test connection" mutation with the EngineCard success/failure alert model.
 *
 * SAVING ALWAYS PROBES. Storing a key does not make it executable: admission
 * only resolves a BYOK route whose LATEST probe succeeded, so a key that was
 * saved and never tested is invisible to the planner and a launch refuses with
 * `execution_credentials_unavailable`. Settings hid that because the card stays
 * on screen and users click "Test connection" themselves; the guided connect
 * dialog closes on save, so the probe never happened and the very next launch
 * failed. Folding the probe into the save makes "connected" mean the same
 * thing — verified — on every surface.
 *
 * A save clears the key and invalidates the shared `providers.connections()`
 * query either way; `onSaved` fires ONLY on a verified save, so a host (e.g.
 * the connect dialog) closes on success and stays open showing the failure.
 */
export function useEngineConnection({
  model,
  connections,
  onSaved,
}: Readonly<{
  model: EngineCardModel;
  connections: ProviderConnection[];
  onSaved?: () => void;
}>) {
  const queryClient = useQueryClient();

  const route = model.route;
  const transport = route?.transport_provider ?? null;
  const [apiKey, setApiKey] = useState('');
  const [testResult, setTestResult] = useState<ConnectionTestState>(null);

  const connection = transport ? connectionForTransport(connections, transport) : undefined;
  const configured = isConfigured(connection);

  /**
   * Probe one connection and fold the outcome into the alert model. Returns
   * the state so the save path can decide whether the connect flow is done.
   */
  const probe = async (connectionId: string): Promise<ConnectionTestState> => {
    const result = await providersApi.testConnection(connectionId);
    const state: ConnectionTestState =
      result.status === 'ok'
        ? { status: 'ok', message: `Connection succeeded (${result.transport_model || 'model'}).` }
        : { status: 'failed', message: result.detail || 'Connection failed.' };
    setTestResult(state);
    return state;
  };

  const saveMutation = useMutation({
    onMutate: () => setTestResult(null),
    mutationFn: async () => {
      // Availability gate, not just a null check: a planned provider has no
      // adapter and no route, so it must not be able to construct a mutation
      // at all — a saved key for it would be a credential we can never use.
      if (!isConnectable(model) || !transport || !route) {
        throw new Error('No route available.');
      }
      const routes = mergeRoutePayload(connection, model.logical_engine);
      const saved = connection
        ? await providersApi.updateConnection(connection.id, {
            api_key: apiKey || undefined,
            routes,
          })
        : await providersApi.createConnection({
            transport_provider: transport,
            api_key: apiKey,
            routes,
          });
      // The key IS stored at this point, so a probe fault is reported as a
      // failed test rather than a failed save — telling the user their key
      // did not save would be wrong, and would send them to rotate a key
      // that is already there.
      let verified: ConnectionTestState;
      try {
        verified = await probe(saved.id);
      } catch (error) {
        verified = { status: 'failed', message: errorMessage(error) };
        setTestResult(verified);
      }
      return { saved, verified };
    },
    onSuccess: async ({ verified }) => {
      setApiKey('');
      await queryClient.invalidateQueries({ queryKey: queryKeys.providers.connections() });
      if (verified?.status === 'ok') onSaved?.();
    },
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      if (!connection) throw new Error('Save a key before testing.');
      return probe(connection.id);
    },
    // The probe denormalizes its outcome onto the connection, and that outcome
    // is what gates launching — so the connections query is stale afterwards.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.providers.connections() }),
    onError: (error) => setTestResult({ status: 'failed', message: errorMessage(error) }),
  });

  const busy = saveMutation.isPending || testMutation.isPending;

  return {
    route,
    transport,
    connection,
    configured,
    apiKey,
    setApiKey,
    testResult,
    saveMutation,
    testMutation,
    busy,
  };
}
