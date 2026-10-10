import assert from 'node:assert/strict';

const [marketing, app, api] = process.argv.slice(2);
assert.ok(
  marketing && app,
  'Usage: node scripts/frontend-ingress-smoke.mjs <marketing-origin> <app-origin> [api-origin]',
);
const MACHINE_PATH = '/v1/crawl-logs/ingest/11111111-1111-4111-8111-111111111111';
const MCP_METADATA = '/.well-known/oauth-authorization-server';

async function get(origin, path, accept = '*/*') {
  return fetch(new URL(path, origin), {
    headers: { Accept: accept },
    redirect: 'manual',
    signal: AbortSignal.timeout(15_000),
  });
}

async function apexRejects(path) {
  const response = await get(marketing, path);
  assert.equal(response.status, 404, `The apex does not serve ${path}`);
}

async function assetLoads(asset) {
  const resource = await get(app, asset);
  assert.equal(resource.status, 200, asset);
  assert.match(
    resource.headers.get('content-type') ?? '',
    asset.endsWith('.css') ? /text\/css/ : /javascript/,
  );
  assert.match(resource.headers.get('cache-control') ?? '', /immutable/);
  assert.ok((await resource.text()).length > 0, `${asset} is nonempty`);
}

async function appServes(path) {
  // Browsers navigate with Accept: text/html; only that receives the SPA shell.
  const response = await get(app, path, 'text/html');
  assert.equal(response.status, 200, `${path} serves the application`);
  assert.match(response.headers.get('cache-control') ?? '', /no-store/, `${path} is not cached`);
  const html = await response.text();
  assert.match(html, /id="root"/, `${path} has the application root`);
  const assets = [...html.matchAll(/(?:src|href)="(\/app-assets\/[^"?]+\.(?:js|css))"/g)].map(
    (match) => match[1],
  );
  assert.ok(
    assets.some((asset) => asset.endsWith('.js')),
    `${path} loads its module`,
  );
  assert.ok(
    assets.some((asset) => asset.endsWith('.css')),
    `${path} loads its stylesheet`,
  );
  if (path === '/login') await Promise.all(assets.map(assetLoads));
}

const home = await get(marketing, '/');
assert.equal(home.status, 200, 'Marketing homepage');
assert.match(await home.text(), /<h1[\s>]/, 'Marketing renders its content on the server');
await Promise.all(
  [
    '/not-a-real-page',
    '/login',
    '/api/v1/brand-discovery-catalog',
    MACHINE_PATH,
    '/mcp',
    MCP_METADATA,
  ].map(apexRejects),
);
// Machine routes belong to the API host alone.
assert.equal((await get(app, MACHINE_PATH)).status, 404, 'The app host refuses /v1 machine paths');
async function apiHostRejects(path) {
  const refused = await get(api, path);
  assert.equal(refused.status, 404, `The API host does not serve ${path}`);
  assert.deepEqual(await refused.json(), { error: { code: 'not_found' } });
}
if (api) {
  await Promise.all(
    ['/', '/pricing', '/api/v1/brand-discovery-catalog', '/mcp/oauth/consent'].map(apiHostRejects),
  );
  // MCP lives on the API host: its issuer is that origin.
  const metadata = await get(api, MCP_METADATA);
  assert.equal(metadata.status, 200, 'The API host serves MCP metadata');
  assert.equal(
    (await metadata.json()).issuer,
    new URL(api).origin,
    'The MCP issuer is the API host',
  );
}
await Promise.all(
  [
    '/login',
    '/register',
    '/projects',
    '/issues/',
    '/runs/11111111-1111-4111-8111-111111111111',
  ].map(appServes),
);

const missing = await get(app, '/app-assets/missing-chunk.js');
assert.equal(missing.status, 404, 'A missing chunk must not become a successful SPA document');

// The app Worker is the only browser path to the API.
const catalog = await get(app, '/api/v1/brand-discovery-catalog');
assert.equal(catalog.status, 200, 'The app Worker proxies the API');
assert.match(catalog.headers.get('cache-control') ?? '', /no-store/);
await catalog.json();
console.log(
  `Frontend smoke passed: marketing, app routes, CSS/JS, cache policy, API proxy and 404s${api ? ', API host allowlist and MCP metadata' : ''}.`,
);
