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
console.log(`Product Worker static output checked: ${files.length} files.`);
