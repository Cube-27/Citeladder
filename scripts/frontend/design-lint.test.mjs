import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';

import { lintConfig } from '../../frontend/vp-shared-config.ts';

const frontend = resolve(import.meta.dirname, '../../frontend');
const fromVitePlus = createRequire(
  createRequire(join(frontend, 'package.json')).resolve('vite-plus/package.json'),
);
const oxlint = join(dirname(fromVitePlus.resolve('oxlint/package.json')), 'bin', 'oxlint');

function lintCanary() {
  const config = join(frontend, `.design-lint-canary-${process.pid}.json`);
  const ignorePatterns = lintConfig.ignorePatterns.filter((glob) => !glob.includes('canary'));
  writeFileSync(config, JSON.stringify({ ...lintConfig, ignorePatterns }));
  try {
    execFileSync(
      process.execPath,
      [oxlint, '-c', config, '--format', 'json', 'scripts/design-lint/canary'],
      { cwd: frontend, encoding: 'utf8', stdio: 'pipe' },
    );
    return [];
  } catch (error) {
    return JSON.parse(error.stdout)
      .diagnostics.filter(({ labels }) => labels.length)
      .map(
        ({ filename, code, labels }) =>
          `${filename.split('/').pop()}:${labels[0].span.line} ${code.replace(/^(\w+)\((.+)\)$/, '$1/$2')}`,
      );
  } finally {
    rmSync(config, { force: true });
  }
}

test('the canary trips every design rule and passing.tsx trips none under the shipped lint config', () => {
  assert.deepEqual(lintCanary().sort(), [
    'canary.astro:2 design/astro-class',
    'canary.astro:2 design/astro-class',
    'canary.astro:2 design/astro-class',
    'canary.astro:2 design/astro-class',
    'canary.tsx:11 design/plain-element',
    'canary.tsx:12 design/plain-element',
    'canary.tsx:13 design/plain-element',
    'canary.tsx:14 design/plain-element',
    'canary.tsx:14 shadcn/no-raw-colors',
    'canary.tsx:15 shadcn/no-inline-styles',
    'canary.tsx:16 design/plain-element',
    'canary.tsx:16 design/reset-survivor',
    'canary.tsx:16 design/reset-survivor',
    'canary.tsx:17 design/monochrome-colour',
    'canary.tsx:17 design/plain-element',
    'canary.tsx:18 design/plain-element',
    'canary.tsx:18 design/surface-variant',
    'canary.tsx:19 design/plain-element',
    'canary.tsx:19 shadcn/no-raw-colors',
    'canary.tsx:19 shadcn/no-unknown-classes',
    'canary.tsx:19 shadcn/no-unknown-classes',
    'canary.tsx:20 shadcn/require-static-classes',
    'canary.tsx:21 shadcn/no-restyle',
    'canary.tsx:24 design/raw-media',
    'canary.tsx:25 design/plain-element',
    'canary.tsx:25 design/raw-media',
    'canary.tsx:26 design/plain-element',
    'canary.tsx:26 shadcn/no-restyle',
    'canary.tsx:26 shadcn/no-restyle',
    'canary.tsx:27 design/plain-element',
    'canary.tsx:28 design/plain-element',
    'canary.tsx:29 design/plain-element',
    'canary.tsx:30 design/static-class',
    'canary.tsx:31 design/arbitrary-breakpoint',
    'canary.tsx:4 design/colour-literal',
    'canary.tsx:9 shadcn/no-arbitrary-values',
    'canary.tsx:9 shadcn/no-restyle',
  ]);
});
