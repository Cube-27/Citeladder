import assert from 'node:assert/strict';

const [marketing, app] = process.argv.slice(2);
assert.ok(
  marketing && app,
  'Usage: node scripts/frontend-ingress-smoke.mjs <marketing-origin> <app-origin>',
);

async function get(origin, path) {
  return fetch(new URL(path, origin), { redirect: 'manual', signal: AbortSignal.timeout(15_000) });
}

const home = await get(marketing, '/');
assert.equal(home.status, 200, 'Marketing homepage');
assert.match(await home.text(), /<h1[\s>]/, 'Marketing renders its content on the server');
for (const path of ['/not-a-real-page', '/login', '/api/v1/brand-discovery-catalog']) {
  const response = await get(marketing, path);
  assert.equal(response.status, 404, `The apex does not serve ${path}`);
}

for (const path of [
  '/login',
  '/register',
  '/projects',
  '/issues/',
  '/runs/11111111-1111-4111-8111-111111111111',
]) {
  const response = await get(app, path);
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
  if (path !== '/login') continue;
  for (const asset of assets) {
    const resource = await get(app, asset);
    assert.equal(resource.status, 200, asset);
    assert.match(
      resource.headers.get('content-type') ?? '',
      asset.endsWith('.css') ? /text\/css/ : /javascript/,
    );
    assert.match(resource.headers.get('cache-control') ?? '', /immutable/);
    assert.ok((await resource.text()).length > 0, `${asset} is nonempty`);
  }
}

const missing = await get(app, '/app-assets/missing-chunk.js');
assert.equal(missing.status, 404, 'A missing chunk must not become a successful SPA document');

// The app Worker is the only browser path to the API.
const catalog = await get(app, '/api/v1/brand-discovery-catalog');
assert.equal(catalog.status, 200, 'The app Worker proxies the API');
assert.match(catalog.headers.get('cache-control') ?? '', /no-store/);
await catalog.json();
console.log(
  'Frontend smoke passed: marketing, app routes, CSS/JS, cache policy, API proxy and 404s.',
);
