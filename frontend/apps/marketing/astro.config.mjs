import { fileURLToPath } from 'node:url';

import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';
import { defineConfig } from 'astro/config';
import { loadEnv } from 'vite';
import { publicOrigins } from '../../lib/config/public-origins.ts';
import { marketingContentSecurityPolicy } from '../../lib/config/content-security-policy.ts';

const frontendRoot = fileURLToPath(new URL('../..', import.meta.url));

const mode = process.env.NODE_ENV === 'production' ? 'production' : 'development';
const environment = loadEnv(mode, frontendRoot, '');
/** A build value from the process environment, then the local .env file. */
const env = (name) => process.env[name] ?? environment[name];
if (mode === 'production') {
  publicOrigins(
    env('PUBLIC_WEBSITE_ORIGIN'),
    env('PUBLIC_APP_ORIGIN'),
    process.env.LOCAL_COMPOSE_BUILD !== 'true',
  );
}
/** Bake each public value into the bundle as `process.env.NAME`. */
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
  // Pages are built once and served as free static assets. Only routes that
  // read the request (pricing, contact, the 404 negotiation and the apex
  // proxy in middleware) opt out with `prerender = false`.
  output: 'static',
  build: { format: 'file' },
  trailingSlash: 'never',
  session: false,
  // External webhook and MCP POSTs reach exact routes; the backend verifies
  // signatures, OAuth transactions and CSRF at their owning endpoints.
  security: {
    checkOrigin: false,
    csp: marketingContentSecurityPolicy(Boolean(env('NEXT_PUBLIC_GA_MEASUREMENT_ID'))),
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
