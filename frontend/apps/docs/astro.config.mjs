import { fileURLToPath } from 'node:url';
import { satteri } from '@astrojs/markdown-satteri';
import react from '@astrojs/react';
import { defineConfig } from 'astro/config';
import { loadEnv } from 'vite';
import { docsContentSecurityPolicy } from '../../lib/config/content-security-policy.ts';
import { cspScriptHash } from '../../lib/config/csp-hash.ts';
import { SPECULATION_RULES_JSON } from '../../lib/config/speculation-rules.ts';
import { DOCS_ORIGIN } from '../../lib/config/docs.ts';
import { proseMarkdownBlocks } from '../../components/content/prose-blocks.ts';

const frontendRoot = fileURLToPath(new URL('../..', import.meta.url));

const mode = process.env.NODE_ENV === 'production' ? 'production' : 'development';
const environment = loadEnv(mode, frontendRoot, '');
const origin = (name, production) =>
  JSON.stringify(process.env[name] || environment[name] || production);

export default defineConfig({
  site: DOCS_ORIGIN,
  output: 'static',
  security: { csp: docsContentSecurityPolicy([cspScriptHash(SPECULATION_RULES_JSON)]) },
  integrations: [react()],
  markdown: { syntaxHighlight: false, processor: satteri({ hastPlugins: [proseMarkdownBlocks] }) },
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
