import type { Database } from '../db/database.ts';
import { providerPolicy } from './config.ts';
import { tenantConnections } from './connections.ts';

export async function connectionStates(db: Database, workspaceId: string, at = new Date()) {
  const connections = await tenantConnections(db, workspaceId)
    .where('c.active', '=', true)
    .orderBy('c.created_at', 'desc')
    .orderBy('c.id', 'desc')
    .execute();
  const ids = connections.map((row) => row.id);
  const probes = ids.length
    ? await db
        .selectFrom('provider_connection_tests')
        .selectAll()
        .where('workspace_id', '=', workspaceId)
        .where('connection_id', 'in', ids)
        .distinctOn('connection_id')
        .orderBy('connection_id')
        .orderBy('created_at', 'desc')
        .orderBy('id', 'desc')
        .execute()
    : [];
  return {
    workspace_id: workspaceId,
    providers: providerPolicy.catalog.map((entry) => {
      const route = providerPolicy.routes[entry.key as keyof typeof providerPolicy.routes];
      const connection = connections.find(
        (row) => row.transport_provider === route?.transport_provider,
      );
      const probe = probes.find((row) => row.connection_id === connection?.id);
      const { state, reason, pause } = resolveState({ entry, connection, probe, at });
      return {
        key: entry.key,
        label: entry.label,
        state,
        safe_reason: reason,
        pause,
        grant_key: entry.grant_key,
        latest_probe:
          state === 'missing' || state === 'unavailable' || !probe
            ? null
            : {
                status: probe.status === 'ok' ? ('ok' as const) : ('failed' as const),
                safe_reason: reason,
                tested_at: probe.created_at.toISOString(),
                model: probe.transport_model || null,
                latency_ms: probe.latency_ms,
              },
      };
    }),
  };
}

type Connection = Awaited<ReturnType<ReturnType<typeof tenantConnections>['execute']>>[number];

function resolveState(o: {
  entry: (typeof providerPolicy.catalog)[number];
  connection: Connection | undefined;
  probe: { status: string; error_code: string } | undefined;
  at: Date;
}): {
  state: 'unavailable' | 'missing' | 'failed' | 'connected';
  reason: string | null;
  pause: { until: string | null } | null;
} {
  const { entry, connection, probe, at } = o;
  if (!entry.adapter_shipped)
    return { state: 'unavailable', reason: entry.unavailable_reason, pause: null };
  if (!connection?.api_key_encrypted || !probe || connection.last_tested_at == null)
    return { state: 'missing', reason: 'verification_required', pause: null };
  const paused =
    connection.paused_at != null && (connection.pause_until == null || connection.pause_until > at);
  if (paused)
    return {
      state: 'failed',
      reason: connection.pause_reason || 'unknown',
      pause: { until: connection.pause_until?.toISOString() ?? null },
    };
  if (probe.status !== 'ok')
    return { state: 'failed', reason: probe.error_code || 'unknown', pause: null };
  return { state: 'connected', reason: null, pause: null };
}
