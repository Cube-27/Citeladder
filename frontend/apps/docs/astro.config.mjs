import { fileURLToPath } from 'node:url';
import react from '@astrojs/react';
import { defineConfig } from 'astro/config';
import { loadEnv } from 'vite';
import { DOCS_CONTENT_SECURITY_POLICY } from '../../lib/config/content-security-policy.ts';
import { DOCS_ORIGIN } from '../../lib/config/docs.ts';

const frontendRoot = fileURLToPath(new URL('../..', import.meta.url));

// The docs are static, so the website and app links are baked at build time.
// Local Compose and a local `.env` point them at local servers; the production
// deploy sets neither, so it links the production hosts.
const mode = process.env.NODE_ENV === 'production' ? 'production' : 'development';
const environment = loadEnv(mode, frontendRoot, '');
const origin = (name, production) =>
  JSON.stringify(process.env[name] || environment[name] || production);

export default defineConfig({
  site: DOCS_ORIGIN,
  output: 'static',
  security: { csp: DOCS_CONTENT_SECURITY_POLICY },
  integrations: [react()],
  markdown: { syntaxHighlight: false },
  server: { host: '127.0.0.1', port: 4322 },
  vite: {
    css: { postcss: frontendRoot },
    define: {
      'process.env.PUBLIC_WEBSITE_ORIGIN': origin(
        'PUBLIC_WEBSITE_ORIGIN',
        'https://citeladder.com',
      ),
      'process.env.PUBLIC_APP_ORIGIN': origin('PUBLIC_APP_ORIGIN', 'https://app.citeladder.com'),
    },
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
