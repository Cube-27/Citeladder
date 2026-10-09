/** Stateless Streamable HTTP delivery over persisted MCP owners. */
import type { Hono } from 'hono';
import type { ServiceConfig } from '../config.ts';
import type { AppEnv } from '../context.ts';
import type { Database } from '../db/database.ts';
import { loadMcpConfig, mcpPolicy } from './config.ts';
import { authenticateMcp } from './oauth.ts';
import { admitToolCall } from './registration.ts';
import { registerOAuthRoutes } from './oauth-routes.ts';
import { dispatchTool, presentationTools, tools } from './tools.ts';
import { callerMessage } from './types.ts';
import { getLogger } from '../logging.ts';
import { parseUuid } from '../http/uuid.ts';
import { appResource, appToolMetadata, readAppResource } from './app-resource.ts';
const logger = getLogger('mcp');

const MCP_PROTOCOL_PATHS = [
  '/mcp',
  '/mcp/',
  '/mcp/register',
  '/mcp/oauth/consent',
  '/authorize',
  '/token',
  '/revoke',
  '/.well-known/oauth-authorization-server',
  '/.well-known/oauth-protected-resource/mcp',
] as const;
const PUBLIC_OAUTH_PATHS: ReadonlySet<string> = new Set([
  '/mcp/register',
  '/authorize',
  '/token',
  '/revoke',
  '/.well-known/oauth-authorization-server',
  '/.well-known/oauth-protected-resource/mcp',
]);
const VERSIONS = ['2026-07-28', '2025-11-25'];
const INSTRUCTIONS = [
  "Read-only CiteLadder data about a business's visibility in AI answers and search.",
  'Start with list_projects, then get_project_business_context; use the focused reads for detail.',
  'Missing evidence is unavailable, never zero. Report change without claiming its cause.',
  'IDs and citeladder:// references are for your tool calls only: never show them to the user. Name the page, prompt, competitor or Action instead, and give app links as links.',
].join(' ');
const toolNames = new Set(tools.map((tool) => tool.name));
const listedTools = tools.map((tool) =>
  presentationTools.has(tool.name) ? { ...tool, _meta: appToolMetadata(tool.name) } : tool,
);
const CAPABILITIES = { tools: {}, resources: {}, prompts: {} };
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
/** Credential-free origin identities normalize explicit default ports. */
function origin(value: string): string | null {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      url.pathname === '/'
      ? url.origin
      : null;
  } catch {
    return null;
  }
}
function rpcError(id: unknown, code: number, message: string, data?: unknown) {
  return {
    jsonrpc: '2.0',
    id: id ?? null,
    error: { code, message, ...(data === undefined ? {} : { data }) },
  };
}
function decodedHeader(value: string | undefined): string | undefined {
  if (!value?.startsWith('=?base64?') || !value.endsWith('?=')) return value;
  const encoded = value.slice(9, -2);
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(encoded))
    return undefined;
  return Buffer.from(encoded, 'base64').toString('utf8');
}

export function registerMcpRoutes(app: Hono<AppEnv>, config: ServiceConfig, db: Database): void {
  const settings = loadMcpConfig(config);
  for (const path of MCP_PROTOCOL_PATHS)
    app.use(path, async (c, next) => {
      if (!settings.enabled) return c.notFound();
      const consent = c.req.path === '/mcp/oauth/consent';
      const allowed = consent ? settings.browserOrigin : settings.origin;
      const host = c.get('publicHost') ?? c.req.header('host') ?? new URL(c.req.url).host;
      const hostOrigin = origin(`${new URL(allowed).protocol}//${host}`);
      if (
        consent &&
        c.req.method === 'POST' &&
        hostOrigin === settings.origin &&
        settings.origin !== settings.browserOrigin
      )
        return c.text('Consent moved. Restart the MCP authorization request.', 409);
      // Credential-free OAuth endpoints serve browser-hosted clients from any origin.
      const supplied = PUBLIC_OAUTH_PATHS.has(c.req.path) ? undefined : c.req.header('origin');
      if (hostOrigin !== allowed || (supplied && origin(supplied) !== allowed))
        return c.text('Invalid MCP request origin.', 403);
      c.header('Cache-Control', 'no-store');
      const declared = c.req.header('content-length');
      if (
        c.req.path !== '/mcp/register' &&
        declared !== undefined &&
        (!/^\d+$/u.test(declared) || Number(declared) > mcpPolicy.api_request_body_max_bytes)
      )
        return c.text('Request body too large.', 413);
      // Bounded clone leaves the original body available to OAuth/tool owners.
      const reader =
        c.req.path === '/mcp/register' ? undefined : c.req.raw.clone().body?.getReader();
      if (reader) {
        let bytes = 0;
        try {
          for (;;) {
            const part = await reader.read();
            if (part.done) break;
            bytes += part.value.byteLength;
            if (bytes > mcpPolicy.api_request_body_max_bytes) {
              void reader.cancel();
              return c.text('Request body too large.', 413);
            }
          }
        } finally {
          reader.releaseLock();
        }
      }
      await next();
    });
  registerOAuthRoutes(app, config, db);
  for (const path of ['/mcp', '/mcp/'])
    app.all(path, async (c) => {
      const principal = await authenticateMcp(db, config, c.req.raw, settings);
      if (!principal) {
        c.header(
          'WWW-Authenticate',
          // RFC 6750 §3: a presented but rejected token is invalid_token, prompting refresh.
          `Bearer resource_metadata="${settings.origin}/.well-known/oauth-protected-resource/mcp", scope="${mcpPolicy.read_scope}"${c.req.header('authorization') ? ', error="invalid_token"' : ''}`,
        );
        return c.json(
          { error: 'invalid_token', error_description: 'A valid MCP access token is required.' },
          401,
        );
      }
      if (c.req.method !== 'POST') {
        c.header('Allow', 'POST');
        return c.text('Method not allowed', 405);
      }
      const accept = c.req.header('accept') ?? '';
      if (!accept.includes('application/json') || !accept.includes('text/event-stream'))
        return c.json(
          rpcError(null, -32600, 'Accept must include application/json and text/event-stream'),
          406,
        );
      if (c.req.header('content-type')?.split(';')[0]?.trim() !== 'application/json')
        return c.json(rpcError(null, -32600, 'Content-Type must be application/json'), 415);
      let message: unknown;
      try {
        message = await c.req.json();
      } catch {
        return c.json(rpcError(null, -32700, 'Parse error'), 400);
      }
      if (
        !object(message) ||
        message.jsonrpc !== '2.0' ||
        typeof message.method !== 'string' ||
        (message.params !== undefined && !object(message.params)) ||
        (message.id !== undefined &&
          typeof message.id !== 'string' &&
          !Number.isSafeInteger(message.id))
      )
        return c.json(rpcError(null, -32600, 'Invalid request'), 400);
      const params = object(message.params) ? message.params : {};
      const meta = object(params._meta) ? params._meta : {};
      const headerVersion = c.req.header('mcp-protocol-version');
      const requestedVersion = meta['io.modelcontextprotocol/protocolVersion'] ?? headerVersion;
      const modern = requestedVersion === VERSIONS[0] || headerVersion === VERSIONS[0];
      if (requestedVersion !== undefined && !VERSIONS.includes(String(requestedVersion)))
        return c.json(
          rpcError(message.id, -32022, 'Unsupported protocol version', {
            supported: VERSIONS,
            requested: requestedVersion,
          }),
          400,
        );
      if (modern) {
        if (
          headerVersion !== meta['io.modelcontextprotocol/protocolVersion'] ||
          c.req.header('mcp-method') !== message.method ||
          (['tools/call', 'prompts/get', 'resources/read'].includes(message.method) &&
            decodedHeader(c.req.header('mcp-name')) !== (params.name ?? params.uri))
        )
          return c.json(
            rpcError(message.id, -32020, 'Request headers do not match body metadata'),
            400,
          );
        const info = meta['io.modelcontextprotocol/clientInfo'];
        if (
          !object(info) ||
          typeof info.name !== 'string' ||
          typeof info.version !== 'string' ||
          !object(meta['io.modelcontextprotocol/clientCapabilities'])
        )
          return c.json(rpcError(message.id, -32602, 'Required client metadata is missing'), 400);
      }
      if (message.id === undefined) return c.body(null, 202);
      const info = {
        name: 'citeladder',
        title: 'CiteLadder Business Context',
        version: mcpPolicy.server_version,
        websiteUrl: mcpPolicy.documentation_url,
      };
      let result: Record<string, unknown>;
      switch (message.method) {
        case 'initialize':
          if (modern) return c.json(rpcError(message.id, -32601, 'Method not found'), 404);
          result = {
            protocolVersion: VERSIONS[1],
            capabilities: CAPABILITIES,
            serverInfo: info,
            instructions: INSTRUCTIONS,
          };
          break;
        case 'server/discover':
          result = {
            supportedVersions: VERSIONS,
            capabilities: CAPABILITIES,
            instructions: INSTRUCTIONS,
            _meta: { 'io.modelcontextprotocol/serverInfo': info },
          };
          break;
        case 'ping':
          result = {};
          break;
        case 'tools/list':
          result = {
            tools: listedTools,
          };
          break;
        case 'tools/call': {
          if (
            typeof params.name !== 'string' ||
            (params.arguments !== undefined && !object(params.arguments))
          )
            return c.json(rpcError(message.id, -32602, 'Invalid tool arguments'), 400);
          if (!toolNames.has(params.name))
            return c.json(rpcError(message.id, -32602, `Unknown tool: ${params.name}`), 400);
          try {
            await admitToolCall(db, principal.grantId, principal.userId);
            const value = await dispatchTool(
              db,
              principal,
              params.name,
              params.arguments ?? {},
              settings.browserOrigin,
            );
            result = {
              content: [{ type: 'text', text: JSON.stringify(value) }],
              structuredContent: value,
              isError: false,
              ...(presentationTools.has(params.name)
                ? { _meta: appToolMetadata(params.name) }
                : {}),
            };
          } catch (error) {
            // A caller's mistake is a tool error the model can read and correct.
            const problem = callerMessage(error);
            if (problem === null)
              logger.warning('MCP evidence read failed', {
                tool: params.name,
                exceptionType: error instanceof Error ? error.name : 'unknown',
              });
            result = {
              content: [{ type: 'text', text: problem ?? 'Evidence is unavailable.' }],
              isError: true,
            };
          }
          break;
        }
        case 'resources/list':
          result = { resources: [appResource] };
          break;
        case 'resources/templates/list':
          result = {
            resourceTemplates: [
              {
                uriTemplate: 'citeladder://projects/{project_id}/context',
                name: 'project-business-context',
                title: 'Project business context',
                mimeType: 'application/json',
              },
            ],
          };
          break;
        case 'resources/read': {
          if (params.uri === appResource.uri) {
            result = await readAppResource();
            break;
          }
          const match =
            typeof params.uri === 'string'
              ? /^citeladder:\/\/projects\/([^/]+)\/context$/u.exec(params.uri)
              : null;
          if (!match) return c.json(rpcError(message.id, -32602, 'Unknown resource'), 400);
          try {
            const value = await dispatchTool(
              db,
              principal,
              'get_project_business_context',
              { project_id: match[1] },
              settings.browserOrigin,
            );
            result = {
              contents: [
                { uri: params.uri, mimeType: 'application/json', text: JSON.stringify(value) },
              ],
            };
          } catch (error) {
            if (callerMessage(error) !== null)
              return c.json(rpcError(message.id, -32602, 'Resource not found'), 400);
            logger.warning('MCP resource read failed', {
              exceptionType: error instanceof Error ? error.name : 'unknown',
            });
            return c.json(rpcError(message.id, -32603, 'Resource is unavailable'), 500);
          }
          break;
        }
        case 'prompts/list':
          result = {
            prompts: [
              {
                name: 'business_health_review',
                title: 'Review company growth health',
                arguments: [{ name: 'project_id', required: true }],
              },
            ],
          };
          break;
        case 'prompts/get':
          if (
            params.name !== 'business_health_review' ||
            !object(params.arguments) ||
            typeof params.arguments.project_id !== 'string' ||
            !parseUuid(params.arguments.project_id)
          )
            return c.json(rpcError(message.id, -32602, 'Invalid prompt arguments'), 400);
          result = {
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: `Review project ${params.arguments.project_id} with get_project_business_context: what its AI visibility is, what holds it back and which Actions come first. Keep unavailable evidence distinct from zero, do not claim causes, and show no IDs.`,
                },
              },
            ],
          };
          break;
        default:
          return c.json(rpcError(message.id, -32601, 'Method not found'), modern ? 404 : 200);
      }
      return c.json({
        jsonrpc: '2.0',
        id: message.id,
        result: modern ? { ...result, resultType: 'complete' } : result,
      });
    });
}
