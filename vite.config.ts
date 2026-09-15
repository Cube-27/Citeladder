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
export default {
  lint: lintConfig,
  fmt: fmtConfig,
  staged: {
    // Restrict to JS/TS/CSS/JSON: oxfmt/oxlint no-op on other types, and this
    // keeps commits of .py/.md/.ps1 files from paying for a pointless check.
    '*.{js,jsx,mjs,ts,tsx,mts,cts,css,json}': 'vp check --fix',
  },
};
