import { relative } from 'node:path';

import { fmtConfig, lintConfig } from './frontend/vp-shared-config.ts';

const inFrontend = (file: string) => relative(import.meta.dirname, file).startsWith('frontend/');
const quoted = (files: readonly string[]) => files.map((file) => JSON.stringify(file)).join(' ');
const frontendCommand = (command: string, files: readonly string[]) =>
  files.length
    ? [`pnpm --dir frontend exec vp ${command} --no-error-on-unmatched-pattern ${quoted(files)}`]
    : [];

const config = {
  lint: lintConfig,
  fmt: fmtConfig,
  staged: {
    '*.{js,jsx,mjs,ts,tsx,mts,cts,css,json}': (files: readonly string[]) => {
      const outside = files.filter((file) => !inFrontend(file));
      return [
        ...(outside.length ? [`vp check --fix ${quoted(outside)}`] : []),
        ...frontendCommand('check --fix', files.filter(inFrontend)),
      ];
    },
    'frontend/**/*.astro': (files: readonly string[]) => frontendCommand('lint', files),
    'frontend/**/*.{css,ts,tsx,astro}': () => 'node frontend/scripts/check-design-system.mjs',
    '**/*.{js,jsx,mjs,cjs,ts,tsx,css,json}': () =>
      'node frontend/scripts/check-token-size.mjs --staged',
    '**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts,css,astro}': () =>
      'node frontend/scripts/check-source-comments.mjs',
  },
};

export default config;
