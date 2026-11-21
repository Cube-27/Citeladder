import { fileURLToPath } from 'node:url';

import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';
import { defineConfig } from 'astro/config';
import { loadEnv } from 'vite';
import { publicOrigins } from '../../lib/config/public-origins.ts';
import { marketingContentSecurityPolicy } from '../../lib/config/content-security-policy.ts';
import { cspScriptHash } from '../../lib/config/csp-hash.ts';
import { SPECULATION_RULES_JSON } from '../../lib/config/speculation-rules.ts';

const frontendRoot = fileURLToPath(new URL('../..', import.meta.url));

const mode = process.env.NODE_ENV === 'production' ? 'production' : 'development';
const environment = loadEnv(mode, frontendRoot, '');
const env = (name) => process.env[name] ?? environment[name];
if (mode === 'production') {
  publicOrigins(
    env('PUBLIC_WEBSITE_ORIGIN'),
    env('PUBLIC_APP_ORIGIN'),
    process.env.LOCAL_COMPOSE_BUILD !== 'true',
  );
}
const publicDefines = Object.fromEntries(
  [
    'NEXT_PUBLIC_API_REQUEST_TIMEOUT_MS',
    'NEXT_PUBLIC_GA_MEASUREMENT_ID',
    'NEXT_PUBLIC_SELF_SERVE_SIGNUP',
    'PUBLIC_WEBSITE_ORIGIN',
    'PUBLIC_APP_ORIGIN',
    'PUBLIC_DOCS_ORIGIN',
    'PUBLIC_TURNSTILE_SITE_KEY',
  ].map((name) => [`process.env.${name}`, JSON.stringify(env(name) ?? '')]),
);

export default defineConfig({
  output: 'static',
  build: { format: 'file' },
  trailingSlash: 'never',
  session: false,
  // External webhook and MCP POSTs reach exact routes; the backend verifies
  // signatures, OAuth transactions and CSRF at their owning endpoints.
  security: {
    checkOrigin: false,
    csp: marketingContentSecurityPolicy({
      analyticsEnabled: Boolean(env('NEXT_PUBLIC_GA_MEASUREMENT_ID')),
      scriptHashes: [cspScriptHash(SPECULATION_RULES_JSON)],
    }),
  },
  adapter: cloudflare({ imageService: 'compile' }),
  integrations: [react()],
  publicDir: fileURLToPath(new URL('../../public', import.meta.url)),
  server: {
    host: true,
    port: 3000,
  },
  vite: {
    css: {
      postcss: frontendRoot,
    },
    define: {
      ...publicDefines,
      'process.env.LOCAL_COMPOSE_BUILD': JSON.stringify(process.env.LOCAL_COMPOSE_BUILD ?? ''),
      // Node's clock at build time; the workerd prerender clock reads the epoch.
      'process.env.PUBLIC_BUILD_YEAR': JSON.stringify(String(new Date().getFullYear())),
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
