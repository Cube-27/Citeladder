import { readdir, readFile, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

// The build output to check: production's apps/marketing/dist by default, or
// the directory passed by scripts/dev-marketing-worker.mjs.
const root = process.argv[2]
  ? pathToFileURL(`${resolve(process.argv[2])}${sep}`)
  : new URL('../apps/marketing/dist/', import.meta.url);
const files = await readdir(new URL('client/', root), { recursive: true });
// A Turnstile secret in the build environment or the local .env that Astro
// loads, under either name, must never reach the browser.
const localEnv = await readFile(new URL('../.env', import.meta.url), 'utf8').then(
  (text) => parseEnv(text),
  () => ({}),
);
const turnstileSecrets = [process.env, localEnv]
  .flatMap((source) => [source.TURNSTILE_SECRET_KEY, source.PUBLIC_TURNSTILE_SECRET_KEY])
  .filter((value) => typeof value === 'string' && value.length > 0);
const privateNames = new Set([
  '.env',
  '.dev.vars',
  'wrangler.json',
  'wrangler.jsonc',
  'worker-configuration.d.ts',
]);
for (const file of files) {
  if (/\.(js|html)$/.test(file)) {
    const content = await readFile(new URL(`client/${file.split(sep).join('/')}`, root), 'utf8');
    const urls = content.match(/https?:\/\/[^\s"'`<>\\]+/gu) ?? [];
    const hasMailEndpoint = urls.some((value) => {
      try {
        return new URL(value).hostname === 'api.resend.com';
      } catch {
        return false;
      }
    });
    if (content.includes('RESEND_API_KEY') || hasMailEndpoint) {
      throw new Error(`Server-only contact email code in marketing client output: ${file}`);
    }
    if (
      content.includes('TURNSTILE_SECRET_KEY') ||
      turnstileSecrets.some((secret) => content.includes(secret))
    ) {
      throw new Error(`Turnstile secret in marketing client output: ${file}`);
    }
  }
  const privateSegment = file
    .split(/[/\\]/)
    .some(
      (segment) =>
        privateNames.has(segment) ||
        segment.startsWith('.env.') ||
        segment.startsWith('.dev.vars.'),
    );
  if (privateSegment) {
    throw new Error(`Private file in marketing output: ${file}`);
  }
}
const server = await readFile(new URL('server/entry.mjs', root), 'utf8');
if (!server) throw new Error('Marketing Worker entry is empty.');
const headers = await readFile(new URL('client/_headers', root), 'utf8');
// Prerendered pages are served as assets and never reach the middleware, so
// their security headers live here. Fonts and the favicon keep stable names, so
// they are cached for a month instead of revalidating on every page view.
await writeFile(
  new URL('client/_headers', root),
  [
    '/*',
    '  X-Content-Type-Options: nosniff',
    '  Referrer-Policy: strict-origin-when-cross-origin',
    '  X-Frame-Options: DENY',
    '  Strict-Transport-Security: max-age=31536000; includeSubDomains',
    '',
    '/fonts/*',
    '  Cache-Control: public, max-age=2592000',
    '',
    '/citeladder-favicon.ico',
    '  Cache-Control: public, max-age=2592000',
    '',
    headers,
  ].join('\n'),
);
await writeFile(
  new URL('client/.assetsignore', root),
  '_worker.js\n_routes.json\n.env*\n.dev.vars*\n*.map\n',
);
console.log(`Marketing Worker output checked: ${files.length} files.`);
