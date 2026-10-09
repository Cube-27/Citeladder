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
    // keeps commits of .md/.ps1 files from paying for a pointless check.
    '*.{js,jsx,mjs,ts,tsx,mts,cts,css,json}': 'vp check --fix',
    // The design-system policy is a whole-tree ratchet (per-file counts against
    // frontend/scripts/design-system-baseline.json), so it ignores the staged
    // file list it is handed and judges the tree once per commit.
    'frontend/**/*.{css,ts,tsx,astro,svg}': 'node frontend/scripts/check-design-system.mjs',
    // Ruff finds backend/pyproject.toml from each file path; --no-sync keeps
    // the hook from resolving dependencies on every commit.
    'backend/**/*.py': [
      'uv run --project backend --no-sync ruff check --fix',
      'uv run --project backend --no-sync ruff format',
    ],
  },
};

export default config;
