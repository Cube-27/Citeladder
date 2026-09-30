import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config.ts';
import type { AppEnv } from '../src/context.ts';
import type { Database } from '../src/db/database.ts';
import { registerMcpRoutes } from '../src/mcp/server.ts';
import { authenticateMcp } from '../src/mcp/oauth.ts';
import { dispatchTool } from '../src/mcp/tools.ts';

vi.mock('../src/mcp/oauth.ts', () => ({ authenticateMcp: vi.fn() }));
vi.mock('../src/mcp/oauth-routes.ts', () => ({ registerOAuthRoutes: (app: Hono) => {
  app.get('/mcp/oauth/consent', (c) => c.text('consent'));
  app.post('/token', (c) => c.text('token'));
  app.get('/.well-known/oauth-authorization-server', (c) => c.json({ issuer: 'https://protocol.example.test' }));
} }));
vi.mock('../src/mcp/tools.ts', () => ({ tools: [{ name: 'list_projects', inputSchema: { type: 'object' } }], dispatchTool: vi.fn(), McpInputError: class extends Error {} }));
const config = loadConfig({ APP_ENV: 'test', DATABASE_URL: 'postgresql://test:test@127.0.0.1/test', JWT_SECRET_KEY: 'test-secret' });
const db = {} as Database;
function app() {
  const result = new Hono<AppEnv>();
  registerMcpRoutes(result, config, db);
  result.get('/health', (c) => c.text('ok'));
  return result;
}
const meta = { 'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientInfo': { name: 'test', version: '1' }, 'io.modelcontextprotocol/clientCapabilities': {} };
function request(method: string, params: Record<string, unknown> = {}, modern = false, headers: Record<string, string> = {}) {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(modern ? { 'mcp-protocol-version': '2026-07-28', 'mcp-method': method, ...(typeof (params.name ?? params.uri) === 'string' ? { 'mcp-name': String(params.name ?? params.uri) } : {}) } : {}), ...headers },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: modern ? { ...params, _meta: meta } : params }),
  };
}
beforeEach(() => {
  vi.stubEnv('MCP_ENABLED', 'true');
  vi.stubEnv('MCP_PUBLIC_BASE_URL', 'https://protocol.example.test');
  vi.stubEnv('FRONTEND_URL', 'https://app.example.test');
  vi.mocked(authenticateMcp).mockResolvedValue({ userId: 'user', grantId: 'grant', workspaceIds: ['workspace'], tokenHash: 'hash' });
  vi.mocked(dispatchTool).mockResolvedValue({ projects: [{ id: 'project' }] });
});
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe('hosted MCP transport', () => {
  it('serves legacy initialize and independently accepts modern per-request discovery and tools', async () => {
    const service = app();
    const initialized = await service.request('https://protocol.example.test/mcp', request('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1' } }));
    expect((await initialized.json()).result.protocolVersion).toBe('2025-11-25');
    const discovery = await service.request('https://protocol.example.test/mcp', request('server/discover', {}, true));
    expect((await discovery.json()).result).toMatchObject({ resultType: 'complete', supportedVersions: ['2026-07-28', '2025-11-25'], _meta: { 'io.modelcontextprotocol/serverInfo': { name: 'citeladder' } } });
    const called = await service.request('https://protocol.example.test/mcp', request('tools/call', { name: 'list_projects', arguments: {} }, true));
    expect((await called.json()).result).toMatchObject({ resultType: 'complete', isError: false, structuredContent: { projects: [{ id: 'project' }] } });
    expect(dispatchTool).toHaveBeenCalledWith(db, expect.objectContaining({ tokenHash: 'hash' }), 'list_projects', {}, 'https://app.example.test');
  });
  it('rejects mismatched or missing modern request headers and unsupported versions before tool dispatch', async () => {
    const service = app();
    for (const headers of [{ 'mcp-method': 'tools/list' }, { 'mcp-name': 'fetch' }, { 'mcp-protocol-version': '2025-11-25' }]) {
      const response = await service.request('https://protocol.example.test/mcp', request('tools/call', { name: 'list_projects' }, true, headers));
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe(-32020);
    }
    const unsupported = await service.request('https://protocol.example.test/mcp', request('tools/list', {}, false, { 'mcp-protocol-version': '2099-01-01' }));
    expect((await unsupported.json()).error).toMatchObject({ code: -32022, data: { supported: ['2026-07-28', '2025-11-25'] } });
    expect(dispatchTool).not.toHaveBeenCalled();
  });
  it('revalidates bearer admission on each request and advertises the protected resource', async () => {
    const service = app();
    await service.request('https://protocol.example.test/mcp', request('tools/list'));
    vi.mocked(authenticateMcp).mockResolvedValueOnce(null);
    const denied = await service.request('https://protocol.example.test/mcp', request('tools/list'));
    expect(denied.status).toBe(401);
    expect(denied.headers.get('www-authenticate')).toContain('https://protocol.example.test/.well-known/oauth-protected-resource/mcp');
    expect(authenticateMcp).toHaveBeenCalledTimes(2);
  });
  it('guards protocol host/origin and admits consent only on the browser origin', async () => {
    const service = app();
    expect((await service.request('https://app.example.test/token', { method: 'POST' })).status).toBe(403);
    expect((await service.request('https://protocol.example.test/mcp', request('tools/list', {}, false, { origin: 'https://evil.example.test' }))).status).toBe(403);
    expect((await service.request('https://app.example.test/mcp/oauth/consent', { headers: { origin: 'https://app.example.test:443' } })).status).toBe(200);
    expect((await service.request('https://app.example.test/mcp/oauth/consent', { headers: { origin: 'https://someone@app.example.test' } })).status).toBe(403);
    expect((await service.request('https://protocol.example.test/mcp/oauth/consent', { method: 'POST' })).status).toBe(409);
  });
  it('rejects declared and streamed oversized bodies before bearer or tool handling', async () => {
    const service = app();
    const declared = await service.request('https://protocol.example.test/mcp', request('tools/list', {}, false, { 'content-length': '3000000' }));
    expect(declared.status).toBe(413);
    const streamed = await service.request('https://protocol.example.test/mcp', { method: 'POST', body: 'x'.repeat(3_000_000) });
    expect(streamed.status).toBe(413);
    expect(authenticateMcp).not.toHaveBeenCalled();
  });
  it('keeps disabled MCP absent and unrelated startup healthy even with an unsafe origin', async () => {
    vi.stubEnv('MCP_ENABLED', 'false'); vi.stubEnv('MCP_PUBLIC_BASE_URL', 'not-an-origin');
    const service = app();
    expect((await service.request('https://protocol.example.test/mcp', request('tools/list'))).status).toBe(404);
    expect((await service.request('https://protocol.example.test/.well-known/oauth-authorization-server')).status).toBe(404);
    expect((await service.request('/health')).status).toBe(200);
  });
  it('renders domain tool failures as safe errors without exposing exceptions', async () => {
    vi.mocked(dispatchTool).mockRejectedValueOnce(new Error('postgres password secret'));
    const response = await app().request('https://protocol.example.test/mcp', request('tools/call', { name: 'list_projects' }));
    expect((await response.json()).result).toEqual({ content: [{ type: 'text', text: 'Evidence is unavailable.' }], isError: true });
  });
});
