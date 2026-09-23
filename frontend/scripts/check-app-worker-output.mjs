import { readdir, readFile, writeFile } from 'node:fs/promises';

const root = new URL('../apps/app/dist/', import.meta.url);
const files = await readdir(root, { recursive: true });
for (const file of files) {
  if (
    /(^|[/\\])(?:\.env(?:\.[^/\\]+)?|\.dev\.vars(?:\.[^/\\]+)?|worker\.ts|wrangler\.jsonc?|server)(?:$|[/\\])/.test(
      file,
    )
  ) {
    throw new Error(`Private file in app static output: ${file}`);
  }
}
const entry = await readFile(new URL('index.html', root), 'utf8');
if (!entry.includes('name="robots" content="noindex"')) {
  throw new Error('App entry lost noindex policy.');
}
const manifest = files.find((file) => file.replaceAll('\\', '/').endsWith('.vite/manifest.json'));
if (!manifest) throw new Error('App build manifest missing.');
await writeFile(
  new URL('.assetsignore', root),
  '.vite/\n*.map\n.env*\n.dev.vars*\nworker.*\nserver/\n',
);
await writeFile(
  new URL('_headers', root),
  `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: DENY
  X-Robots-Tag: noindex, nofollow
  Strict-Transport-Security: max-age=31536000; includeSubDomains

/app-assets/*
  Cache-Control: public, max-age=31536000, immutable
`,
);
console.log(`Product Worker static output checked: ${files.length} files.`);
