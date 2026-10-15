import { readdir, readFile, writeFile } from 'node:fs/promises';
import { headersRule, SECURITY_HEADERS } from '../lib/config/security-headers.ts';

const root = new URL('../apps/app/dist/', import.meta.url);
const files = await readdir(root, { recursive: true });
const PRIVATE_SEGMENTS = [
  /^\.(?:env|dev\.vars)(?:\.[^/\\]+)?$/,
  /^(?:worker\.ts|wrangler\.jsonc?|server)$/,
];
const isPrivatePath = (file) =>
  file.split(/[/\\]/).some((segment) => PRIVATE_SEGMENTS.some((pattern) => pattern.test(segment)));
for (const file of files) {
  if (isPrivatePath(file)) {
    throw new Error(`Private file in app static output: ${file}`);
  }
}
const entry = await readFile(new URL('index.html', root), 'utf8');
if (!entry.includes('name="robots" content="noindex"')) {
  throw new Error('App entry lost noindex policy.');
}
const hasManifest = files.some((file) =>
  file.replaceAll('\\', '/').endsWith('.vite/manifest.json'),
);
if (!hasManifest) throw new Error('App build manifest missing.');
await writeFile(
  new URL('.assetsignore', root),
  '.vite/\n*.map\n.env*\n.dev.vars*\nworker.*\nserver/\n',
);
await writeFile(
  new URL('_headers', root),
  [
    headersRule('/*', { ...SECURITY_HEADERS, 'X-Robots-Tag': 'noindex, nofollow' }),
    headersRule('/app-assets/*', { 'Cache-Control': 'public, max-age=31536000, immutable' }),
  ].join('\n'),
);
console.log(`Product Worker static output checked: ${files.length} files.`);
