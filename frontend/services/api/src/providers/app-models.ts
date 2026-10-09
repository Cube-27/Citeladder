/** The verified customer destination, using the provider owner's pinned transport. */
import type { Database } from '../db/database.ts';
import { createSecretCipher } from '../integrations/fernet.ts';
import { createModelGateway, type GatewaySettings } from '../models/gateway.ts';
import { defaultTransport, ModelError, transientStatus } from '../models/http.ts';
import { appModelUrl } from './inputs.ts';
import { providerPolicy } from './config.ts';
import { ProbeError, sendProbe, type ProbeTransport } from './probe-transport.ts';

export class AppRouteUnavailable extends Error {
  constructor() {
    super('Customer model route unavailable');
  }
}
export async function resolveAppRoute(db: Database, workspaceId: string, at = new Date()) {
  const rows = await db
    .selectFrom('provider_app_routes as r')
    .innerJoin('provider_connections as c', (join) =>
      join.onRef('c.id', '=', 'r.connection_id').onRef('c.workspace_id', '=', 'r.workspace_id'),
    )
    .select([
      'r.id as routeId',
      'r.revision as routeRevision',
      'r.model',
      'r.api_base_url as baseUrl',
      'r.protocol',
      'r.active as routeActive',
      'r.probed_at',
      'r.probed_revision',
      'r.probed_credential_revision',
      'c.id as connectionId',
      'c.credential_revision as credentialRevision',
      'c.api_key_encrypted as encryptedKey',
      'c.active as connectionActive',
      'c.paused_at',
      'c.pause_until',
    ])
    .where('r.workspace_id', '=', workspaceId)
    .where('r.feature', '=', 'agent')
    .execute();
  if (!rows.length) return null;
  const active = rows.filter((row) => row.routeActive && row.connectionActive);
  const row = active[0];
  if (
    active.length !== 1 ||
    !row?.encryptedKey ||
    row.protocol !== 'openai_chat' ||
    !row.probed_at ||
    row.probed_revision !== row.routeRevision ||
    row.probed_credential_revision !== row.credentialRevision ||
    (row.paused_at && (!row.pause_until || row.pause_until > at))
  )
    throw new AppRouteUnavailable();
  try {
    appModelUrl(row.baseUrl);
  } catch {
    throw new AppRouteUnavailable();
  }
  return row;
}
export function createAppModelGateway(
  route: NonNullable<Awaited<ReturnType<typeof resolveAppRoute>>>,
  encryptionKey: string,
  settings: GatewaySettings,
  send: ProbeTransport = sendProbe,
) {
  let apiKey: string;
  try {
    apiKey = createSecretCipher(encryptionKey).decrypt(route.encryptedKey);
  } catch {
    throw new AppRouteUnavailable();
  }
  const baseUrl = appModelUrl(route.baseUrl);
  const gateway = createModelGateway(
    { ...settings, apiKey, baseUrl, model: route.model },
    {
      sleep: defaultTransport.sleep,
      fetch: async (input, init) => {
        let body: Awaited<ReturnType<ProbeTransport>>;
        try {
          body = await send({
            url: String(input),
            headers: { authorization: `Bearer ${apiKey}` },
            body: JSON.parse(String(init?.body)),
            timeoutSeconds: settings.timeoutSeconds,
            maxBytes: providerPolicy.app.max_response_bytes,
            customerDestination: true,
            signal: init?.signal ?? undefined,
          });
        } catch (error) {
          if (error instanceof ProbeError) {
            if (['timeout', 'connection', 'dns_resolution_failed'].includes(error.code))
              throw new ModelError('connection');
            throw new ModelError(error.code === 'parse_error' ? 'parse' : 'not_configured');
          }
          throw error;
        }
        return Response.json(body.body, { status: body.status });
      },
    },
    { api: 'openai_compatible' },
  );
  return gateway;
}
export function retryableModelError(error: unknown) {
  return (
    error instanceof ModelError &&
    (error.code === 'connection' || (error.code === 'http' && transientStatus(error.status ?? 0)))
  );
}
