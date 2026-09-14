import assert from 'node:assert/strict';

const origin = process.argv[2];
assert.ok(origin, 'Usage: node scripts/frontend-ingress-smoke.mjs <origin>');

async function get(path) {
  return fetch(new URL(path, origin), { redirect: 'manual', signal: AbortSignal.timeout(15_000) });
}

const home = await get('/');
assert.equal(home.status, 200, 'Marketing homepage');
assert.match(await home.text(), /<h1[\s>]/, 'Marketing renders its content on the server');

for (const path of ['/login', '/register', '/projects', '/issues/', '/runs/11111111-1111-4111-8111-111111111111']) {
  const response = await get(path);
  assert.equal(response.status, 200, `${path} serves the application`);
  assert.match(response.headers.get('cache-control') ?? '', /no-store/, `${path} is not cached`);
  const html = await response.text();
  assert.match(html, /id="root"/, `${path} has the application root`);
  const assets = [...html.matchAll(/(?:src|href)="(\/app-assets\/[^"?]+\.(?:js|css))"/g)].map((match) => match[1]);
  assert.ok(assets.some((asset) => asset.endsWith('.js')), `${path} loads its module`);
  assert.ok(assets.some((asset) => asset.endsWith('.css')), `${path} loads its stylesheet`);
  if (path !== '/login') continue;
  for (const asset of assets) {
    const resource = await get(asset);
    assert.equal(resource.status, 200, asset);
    assert.match(resource.headers.get('content-type') ?? '', asset.endsWith('.css') ? /text\/css/ : /javascript/);
    assert.match(resource.headers.get('cache-control') ?? '', /immutable/);
    assert.ok((await resource.text()).length > 0, `${asset} is nonempty`);
  }
}

for (const path of ['/app-assets/missing-chunk.js', '/projects/unknown', '/not-a-real-page']) {
  const response = await get(path);
  assert.equal(response.status, 404, `${path} must not become a successful SPA document`);
}
console.log('Frontend ingress smoke passed: marketing, app routes, CSS/JS, cache policy, and 404s.');
