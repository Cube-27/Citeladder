import { readdir, readFile, writeFile } from 'node:fs/promises';

const root = new URL('../apps/marketing/dist/', import.meta.url);
const files = await readdir(new URL('client/', root), { recursive: true });
for (const file of files) {
  if (
    /(^|[/\\])(?:\.env(?:\.[^/\\]+)?|\.dev\.vars(?:\.[^/\\]+)?|wrangler\.jsonc?|worker-configuration\.d\.ts)(?:$|[/\\])/.test(
      file,
    )
  ) {
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
