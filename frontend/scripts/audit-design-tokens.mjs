import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { resolvePalette } from './design-system-contrast.mjs';

const root = resolve(import.meta.dirname, '..');
const ignored = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  'test-results',
  'playwright-report',
]);
const escaped = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function sources(directory) {
  return readdirSync(directory).flatMap((name) => {
    if (ignored.has(name)) return [];
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return sources(path);
    if (!/\.(?:css|tsx?|astro)$/.test(path) || /\.(?:test|spec)\./.test(path)) return [];
    return [{ path: relative(root, path).replaceAll('\\', '/'), text: readFileSync(path, 'utf8') }];
  });
}

/** Read-only inventory; globals.css remains the sole value authority. */
export function tokenInventory(source) {
  const light = resolvePalette(source, ':root:not([data-public-surface])');
  const dark = resolvePalette(source, ":root[data-theme='dark']");
  return [...light.keys()]
    .filter((token) => token.startsWith('--color-'))
    .sort()
    .map((token) => ({
      token,
      light: light.get(token),
      dark: dark.get(token),
    }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const css = readFileSync(join(root, 'apps/app/src/globals.css'), 'utf8');
  const files = sources(root);
  const rows = tokenInventory(css).map((row) => {
    const role = escaped(row.token.slice('--color-'.length));
    const consumption = new RegExp(
      `var\\(${escaped(row.token)}\\)|(?:bg|text|border|stroke|fill|from|via|to|ring|divide|decoration)-${role}(?![\\w-])`,
    );
    return {
      ...row,
      consumers: files.filter(({ text }) => consumption.test(text)).map(({ path }) => path),
    };
  });
  console.log(JSON.stringify(rows, null, 2));
}
