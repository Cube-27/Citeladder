import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';

import {
  colourLiteralIn,
  isMonochrome,
  isSurvivor,
  isValueClass,
} from '../../frontend/scripts/design-lint/classes.mjs';
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
    'canary.tsx:10 design/plain-element',
    'canary.tsx:11 design/plain-element',
    'canary.tsx:12 design/plain-element',
    'canary.tsx:13 design/plain-element',
    'canary.tsx:13 shadcn/no-raw-colors',
    'canary.tsx:14 shadcn/no-inline-styles',
    'canary.tsx:15 design/plain-element',
    'canary.tsx:15 design/reset-survivor',
    'canary.tsx:15 design/reset-survivor',
    'canary.tsx:16 design/monochrome-colour',
    'canary.tsx:16 design/plain-element',
    'canary.tsx:17 design/plain-element',
    'canary.tsx:17 design/surface-variant',
    'canary.tsx:18 design/plain-element',
    'canary.tsx:18 shadcn/no-raw-colors',
    'canary.tsx:18 shadcn/no-unknown-classes',
    'canary.tsx:18 shadcn/no-unknown-classes',
    'canary.tsx:19 shadcn/require-static-classes',
    'canary.tsx:20 shadcn/no-restyle',
    'canary.tsx:23 design/raw-media',
    'canary.tsx:24 design/plain-element',
    'canary.tsx:24 design/raw-media',
    'canary.tsx:3 design/colour-literal',
    'canary.tsx:8 shadcn/no-arbitrary-values',
    'canary.tsx:8 shadcn/no-restyle',
  ]);
});

test('class and literal classification', () => {
  assert.deepEqual(
    ['flex', 'md:grid-cols-2', 'min-w-0', 'hover:underline', '-mx-4', 'w-[3rem]', 'cl-card'].map(
      isValueClass,
    ),
    [false, false, false, true, true, true, false],
  );
  assert.deepEqual(
    ['leading-6', 'text-body/7', 'z-10', 'z-0', 'opacity-0', 'opacity-45', 'duration-150'].map(
      isSurvivor,
    ),
    [true, true, true, false, false, true, true],
  );
  assert.deepEqual(['border-white', 'hover:bg-black/50', 'text-ink'].map(isMonochrome), [
    true,
    true,
    false,
  ]);
  assert.deepEqual(
    [
      'bg-[#fff]',
      'shadow-[0_0_0_1px_#0000]',
      'bg-[linear-gradient(#000,_#fff)]',
      'fill-[oklch(50%_0.1_30)]',
      '#faq',
      '&#123;',
      'var(--color-ink)',
    ].map(colourLiteralIn),
    ['#fff', '#0000', '#000', 'oklch(', null, null, null],
  );
});
