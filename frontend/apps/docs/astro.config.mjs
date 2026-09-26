import { fileURLToPath } from 'node:url';
import react from '@astrojs/react';
import { defineConfig } from 'astro/config';
import { DOCS_ORIGIN } from '../../lib/config/docs.ts';

const frontendRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  site: DOCS_ORIGIN,
  output: 'static',
  integrations: [react()],
  markdown: { syntaxHighlight: false },
  server: { host: '127.0.0.1', port: 4322 },
  vite: {
    css: { postcss: frontendRoot },
    resolve: {
      alias: {
        '@': frontendRoot,
        tailwindcss: fileURLToPath(
          new URL('../../node_modules/tailwindcss/index.css', import.meta.url),
        ),
      },
    },
  },
});
