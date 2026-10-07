// Local Compose Worker images run only `wrangler dev`. This copies the wrangler
// CLI and its lockfile-resolved dependency closure out of a full pnpm install,
// so those images ship wrangler instead of the whole build toolchain.
// Usage (from the workspace root): node scripts/copy-wrangler-runtime.mjs <destination>
import { cp, mkdir, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';

const [destination] = process.argv.slice(2);
if (!destination) throw new Error('Usage: copy-wrangler-runtime.mjs <destination>');

const modules = path.resolve('node_modules');
const store = path.join(modules, '.pnpm');
const storeEntries = new Set();

// pnpm keeps each package at .pnpm/<entry>/node_modules/<name>, beside links to
// its own dependencies; following those links yields the complete closure.
async function collect(packageDir) {
  const [entry] = path.relative(store, packageDir).split(path.sep);
  if (entry === '..') throw new Error(`${packageDir} is outside the pnpm store`);
  if (storeEntries.has(entry)) return;
  storeEntries.add(entry);
  const siblings = path.join(store, entry, 'node_modules');
  const names = await Promise.all(
    (await readdir(siblings)).map(async (name) =>
      name.startsWith('@')
        ? (await readdir(path.join(siblings, name))).map((scoped) => `${name}/${scoped}`)
        : [name],
    ),
  );
  await Promise.all(
    names
      .flat()
      .map(async (dependency) => collect(await realpath(path.join(siblings, dependency)))),
  );
}

await collect(await realpath(path.join(modules, 'wrangler')));

const target = path.join(path.resolve(destination), 'node_modules');
const copyOptions = { recursive: true, verbatimSymlinks: true };
await Promise.all(
  [...storeEntries].map((entry) =>
    cp(path.join(store, entry), path.join(target, '.pnpm', entry), copyOptions),
  ),
);
await mkdir(path.join(target, '.bin'), { recursive: true });
await cp(path.join(modules, 'wrangler'), path.join(target, 'wrangler'), copyOptions);
await cp(path.join(modules, '.bin', 'wrangler'), path.join(target, '.bin', 'wrangler'));
process.stdout.write(`Copied wrangler with ${storeEntries.size} store packages.\n`);
