import { fmtConfig, lintConfig } from './frontend/vp-shared-config.ts';

/**
 * Repo-root Vite+ config, loaded by the global `vp` binary for root-level
 * commands -- today only the `vp staged` pre-commit hook.
 *
 * Plain object export on purpose, NOT the documented
 * `import { defineConfig } from 'vite-plus'` form: that import only resolves
 * where vite-plus is installed, and the repository root is deliberately not
 * an installed package (see the root package.json). defineConfig is
 * runtime-identity, so the object literal is equivalent. Lint/fmt rules come
 * from frontend/vp-shared-config.ts so the hook and the frontend npm scripts
 * always enforce the same rules.
 */
const config = {
  lint: lintConfig,
  fmt: fmtConfig,
  staged: {
    // Restrict to JS/TS/CSS/JSON: oxfmt/oxlint no-op on other types, and this
    // keeps commits of .md/.sql files from paying for a pointless check.
    '*.{js,jsx,mjs,ts,tsx,mts,cts,css,json}': 'vp check --fix',
    // The design-system policy judges the whole tree (token contrast, Tailwind
    // @source), so it runs once per commit. A function task gets no staged
    // paths appended; a long path list would otherwise split it into parallel
    // duplicate runs.
    'frontend/**/*.{css,ts,tsx,astro}': () => 'node frontend/scripts/check-design-system.mjs',
    // Reads the staged blobs and its staged policy itself, so it runs once.
    '**/*.{js,jsx,mjs,cjs,ts,tsx,css,json}': () =>
      'node frontend/scripts/check-token-size.mjs --staged',
  },
};

export default config;
