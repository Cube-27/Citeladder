import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Database } from '../db/database.ts';
import { createSecretCipher } from '../integrations/fernet.ts';
import { providerErrorCode } from '../models/http.ts';
import {
  approvedEndpoint,
  getConnection,
  requireActiveTransport,
  tenantConnections,
} from './connections.ts';
import { providerPolicy, type Engine, type ProviderSettings } from './config.ts';
import {
  ProbeError,
  sendProbe,
  type ProbeRequest,
  type ProbeTransport,
} from './probe-transport.ts';

const object = z.record(z.string(), z.unknown());
function probeSecret(encrypted: string, key: string) {
  try {
    return createSecretCipher(key).decrypt(encrypted);
  } catch {
    throw new ProbeError('auth_failure');
  }
}
const textBlock = z.object({ type: z.string(), text: z.string().optional() });
function requireAnswer(transport: string, body: unknown): string | undefined {
  const parsed = object.parse(body);
  if (['failed', 'cancelled', 'incomplete'].includes(String(parsed.status)))
    throw new ProbeError('parse_error');
  let blocks: z.infer<typeof textBlock>[];
  if (transport === 'openai') {
    blocks = z
      .array(z.object({ content: z.array(textBlock).optional() }))
      .parse(parsed.output)
      .flatMap((item) => item.content ?? []);
  } else if (transport === 'google') {
    blocks = z
      .array(z.object({ type: z.string(), content: z.array(textBlock).optional() }))
      .parse(parsed.steps)
      .filter((step) => step.type === 'model_output')
      .flatMap((step) => step.content ?? []);
  } else blocks = z.array(textBlock).parse(parsed.content);
  if (!blocks.some((block) => typeof block.text === 'string' && block.text.trim()))
    throw new ProbeError('parse_error');
  return typeof parsed.model === 'string' ? parsed.model : undefined;
}
export async function probeConnection(
  db: Database,
  workspaceId: string,
  id: string,
  encryptionKey: string,
  settings: ProviderSettings,
  send: ProbeTransport = sendProbe,
) {
  const connection = await getConnection(db, workspaceId, id);
  requireActiveTransport(connection);
  const apps = await db
    .selectFrom('provider_app_routes')
    .selectAll()
    .where('workspace_id', '=', workspaceId)
    .where('connection_id', '=', id)
    .where('active', '=', true)
    .orderBy('feature')
    .execute();
  const routes = await db
    .selectFrom('provider_routes')
    .selectAll()
    .where('workspace_id', '=', workspaceId)
    .where('connection_id', '=', id)
    .orderBy('created_at')
    .orderBy('id')
    .execute();
  const transport = connection.transport_provider;
  const defaultEngine = Object.entries(providerPolicy.routes).find(
    ([, route]) => route.transport_provider === transport,
  )![0];
  const engine = (routes[0]?.logical_engine ?? defaultEngine) as Engine;
  const catalog = providerPolicy.routes[engine];
  const work = apps.length
    ? apps.map((app) => ({ app, engine: app.feature, model: app.model, transport: app.protocol }))
    : [{ app: undefined, engine, model: catalog.transport_model, transport }];
  const results = [];
  for (const item of work) {
    const started = performance.now();
    let status: 'ok' | 'failed' = 'ok';
    let errorCode = '';
    let model = item.model;
    try {
      const secret = probeSecret(connection.api_key_encrypted, encryptionKey);
      const request = probeRequest(
        connection.base_url,
        transport,
        model,
        secret,
        item.app,
        settings,
        engine,
      );
      let response = await send(request);
      // A single bounded compatibility retry, only when the rejected parameter is named.
      if (
        item.app &&
        [400, 422].includes(response.status) &&
        JSON.stringify(response.body).includes('max_completion_tokens')
      ) {
        const payload = request.body as Record<string, unknown>;
        const { max_completion_tokens: cap, ...rest } = payload;
        response = await send({
          ...request,
          body: { ...rest, max_tokens: cap },
          timeoutSeconds: Math.max(
            0.001,
            request.timeoutSeconds - (performance.now() - started) / 1000,
          ),
        });
      }
      if (response.status < 200 || response.status >= 300)
        throw new ProbeError(providerErrorCode(response.status));
      if (item.app) {
        z.object({
          choices: z
            .array(z.object({ message: z.object({ content: z.string().trim().min(1) }) }))
            .min(1),
        }).parse(response.body);
      } else if (transport === 'dataforseo') {
        if (object.parse(response.body).status_code !== providerPolicy.dataforseo.success_status)
          throw new ProbeError('auth_failure');
      } else model = requireAnswer(transport, response.body) ?? model;
    } catch (error) {
      status = 'failed';
      errorCode = error instanceof ProbeError ? error.code : 'parse_error';
    }
    const testedAt = new Date();
    const latency = Math.round(performance.now() - started);
    const result = await db.transaction().execute(async (trx) => {
      const current = await tenantConnections(trx, workspaceId)
        .where('c.id', '=', id)
        .forUpdate('c')
        .executeTakeFirst();
      const app = item.app
        ? await trx
            .selectFrom('provider_app_routes')
            .selectAll()
            .where('workspace_id', '=', workspaceId)
            .where('id', '=', item.app.id)
            .forUpdate()
            .executeTakeFirst()
        : undefined;
      const matches =
        current?.credential_revision === connection.credential_revision &&
        current?.base_url === connection.base_url &&
        (!item.app || (app?.revision === item.app.revision && app.active));
      if (!matches) {
        status = 'failed';
        errorCode = 'revision_changed';
      }
      const detail =
        status === 'ok' ? 'Connection succeeded' : `Connection test failed: ${errorCode}`;
      if (current) {
        await trx
          .insertInto('provider_connection_tests')
          .values({
            id: randomUUID(),
            workspace_id: workspaceId,
            connection_id: id,
            status,
            error_code: errorCode,
            detail,
            latency_ms: latency,
            logical_engine: item.engine,
            transport_provider: item.transport,
            transport_model: model,
            created_at: testedAt,
          })
          .execute();
        if (matches) {
          await trx
            .updateTable('provider_connections')
            .set({ last_test_status: status, last_tested_at: testedAt, updated_at: testedAt })
            .where('id', '=', id)
            .execute();
          if (status === 'ok' && app)
            await trx
              .updateTable('provider_app_routes')
              .set({
                probed_revision: app.revision,
                probed_credential_revision: current.credential_revision,
                probed_at: testedAt,
                updated_at: testedAt,
              })
              .where('id', '=', app.id)
              .execute();
        }
      }
      return {
        connection_id: id,
        status,
        error_code: errorCode,
        detail,
        latency_ms: latency,
        logical_engine: item.engine,
        transport_provider: item.transport,
        transport_model: model,
        tested_at: testedAt.toISOString(),
      };
    });
    results.push(result);
  }
  return results.find((result) => result.status === 'failed') ?? results.at(-1)!;
}
function probeRequest(
  baseUrl: string,
  transport: string,
  model: string,
  secret: string,
  app: { api_base_url: string } | undefined,
  settings: ProviderSettings,
  engine: Engine,
): ProbeRequest {
  const common = {
    timeoutSeconds: settings.timeoutSeconds,
    maxBytes: providerPolicy.app.max_response_bytes,
    customerDestination: false,
  };
  if (app)
    return {
      ...common,
      customerDestination: true,
      timeoutSeconds: providerPolicy.app.probe_timeout_seconds,
      url: app.api_base_url.endsWith('/chat/completions')
        ? app.api_base_url
        : `${app.api_base_url}/chat/completions`,
      headers: { authorization: `Bearer ${secret}` },
      body: {
        model,
        messages: [{ role: 'user', content: providerPolicy.app.probe_prompt }],
        stream: false,
        max_completion_tokens: providerPolicy.app.probe_max_output_tokens,
      },
    };
  const url = approvedEndpoint(transport, baseUrl, settings);
  const prompt = providerPolicy.probe_prompt;
  const cap = settings.outputTokens;
  const effort = providerPolicy.routes[engine].reasoning_effort;
  if (transport === 'dataforseo') {
    const pair = z
      .object({ login: z.string().min(1), password: z.string().min(1) })
      .parse(JSON.parse(secret));
    return {
      ...common,
      timeoutSeconds: settings.dataforseoTimeout,
      url: `${url}${providerPolicy.dataforseo.probe_path}`,
      headers: {
        authorization: `Basic ${Buffer.from(`${pair.login}:${pair.password}`).toString('base64')}`,
      },
    };
  }
  if (transport === 'openai')
    return {
      ...common,
      url,
      headers: { authorization: `Bearer ${secret}` },
      body: {
        model,
        input: prompt,
        store: false,
        max_output_tokens: cap,
        ...(effort === 'off' ? { reasoning: { effort: 'none' } } : {}),
      },
    };
  if (transport === 'google')
    return {
      ...common,
      url,
      headers: { 'x-goog-api-key': secret },
      body: {
        model,
        input: prompt,
        system_instruction: '',
        store: false,
        max_output_tokens: cap,
        ...(['low', 'minimal'].includes(effort ?? '')
          ? { generation_config: { thinking_level: effort } }
          : {}),
      },
    };
  return {
    ...common,
    url,
    headers: { 'x-api-key': secret, 'anthropic-version': settings.anthropicVersion },
    body: {
      model,
      max_tokens: cap,
      messages: [{ role: 'user', content: prompt }],
      ...(effort === 'off' ? { thinking: { type: 'disabled' } } : {}),
    },
  };
}
