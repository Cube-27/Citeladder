import { fmtConfig, lintConfig } from './frontend/vp-shared-config.ts';

const config = {
  lint: lintConfig,
  fmt: fmtConfig,
  staged: {
    '*.{js,jsx,mjs,ts,tsx,mts,cts,css,json}': 'vp check --fix',
    'frontend/**/*.{css,ts,tsx,astro}': () => 'node frontend/scripts/check-design-system.mjs',
    '**/*.{js,jsx,mjs,cjs,ts,tsx,css,json}': () =>
      'node frontend/scripts/check-token-size.mjs --staged',
  },
};

export default config;
