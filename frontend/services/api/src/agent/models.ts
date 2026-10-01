import type { Database } from '../db/database.ts';
import { createModelGateway, type GatewaySettings } from '../models/gateway.ts';
import { defaultTransport, type Transport } from '../models/http.ts';
import {
  AppRouteUnavailable,
  createAppModelGateway,
  resolveAppRoute,
  retryableModelError,
} from '../providers/app-models.ts';
import { sendProbe, type ProbeTransport } from '../providers/probe-transport.ts';
import { AgentError, type Run } from './contracts.ts';
import type { AgentModel } from './model-calls.ts';

export function agentModels(
  db: Database,
  encryptionKey: string,
  platform: GatewaySettings,
  transports: { platform: Transport; customer: ProbeTransport } = {
    platform: defaultTransport,
    customer: sendProbe,
  },
) {
  return async (run: Run): Promise<AgentModel> => {
    let gateway;
    const customer = run.funding_source === 'customer_byok';
    if (customer) {
      try {
        const route = await resolveAppRoute(db, run.workspace_id);
        if (
          !route ||
          route.routeId !== run.route_id ||
          route.connectionId !== run.connection_id ||
          route.routeRevision !== run.route_revision ||
          route.credentialRevision !== run.credential_revision ||
          route.model !== run.requested_model
        )
          throw new AppRouteUnavailable();
        gateway = createAppModelGateway(
          route,
          encryptionKey,
          { ...platform, attempts: 1 },
          transports.customer,
        );
      } catch (error) {
        if (error instanceof AppRouteUnavailable) throw new AgentError('route_unavailable');
        throw error;
      }
    } else {
      if (run.requested_model !== platform.model) throw new AgentError('model_changed');
      gateway = createModelGateway({ ...platform, attempts: 1 }, transports.platform);
    }
    return {
      model: gateway.model,
      endpointHost: gateway.baseUrlHost,
      adapter: customer ? 'openai_compatible_byok' : 'openai_compatible',
      retryableError: retryableModelError,
      complete: (request, signal) =>
        gateway.completeStructured(request.system, request.user, request.schema, signal),
    };
  };
}
