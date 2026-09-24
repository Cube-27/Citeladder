import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

// The build output to check: production's apps/marketing/dist by default, or
// the directory passed by scripts/dev-marketing-worker.mjs.
const root = process.argv[2]
  ? pathToFileURL(`${resolve(process.argv[2])}${sep}`)
  : new URL('../apps/marketing/dist/', import.meta.url);
const files = await readdir(new URL('client/', root), { recursive: true });
const privateNames = new Set([
  '.env',
  '.dev.vars',
  'wrangler.json',
  'wrangler.jsonc',
  'worker-configuration.d.ts',
]);
for (const file of files) {
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
await writeFile(
  new URL('client/_headers', root),
  `/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  X-Frame-Options: DENY\n  Strict-Transport-Security: max-age=31536000; includeSubDomains\n\n${headers}`,
);
await writeFile(
  new URL('client/.assetsignore', root),
  '_worker.js\n_routes.json\n.env*\n.dev.vars*\n*.map\n',
);
console.log(`Marketing Worker output checked: ${files.length} files.`);
