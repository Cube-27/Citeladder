import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig, type ViteUserConfig, loadEnv } from 'vite-plus';

import { createServerProxy } from './server-proxy.ts';
import { publicApiOrigin, publicOrigins } from '../../lib/config/public-origins.ts';
import { TURNSTILE_TEST_SITE_KEY } from '../../lib/config/turnstile.ts';

const appRoot = fileURLToPath(new URL('.', import.meta.url));
const frontendRoot = fileURLToPath(new URL('../..', import.meta.url));

/**
 * The baked Turnstile site key. Local serving and Compose fall back to
 * Cloudflare's always-pass test key, which the development API accepts; any
 * other build must name the real key, reported like every empty public value.
 */
function turnstileSiteKey(
  serving: boolean,
  environment: Record<string, string>,
  publicValue: (name: string) => string,
): string {
  if (!serving && process.env.LOCAL_COMPOSE_BUILD !== 'true')
    return publicValue('PUBLIC_TURNSTILE_SITE_KEY');
  return JSON.stringify(
    process.env.PUBLIC_TURNSTILE_SITE_KEY ||
      environment.PUBLIC_TURNSTILE_SITE_KEY ||
      TURNSTILE_TEST_SITE_KEY,
  );
}

// Explicit return type: without it, tsc compares the inferred literal against
// every defineConfig overload and dies with TS2321 "Excessive stack depth".
export default defineConfig(({ command, isPreview, mode }): ViteUserConfig => {
  const environment = loadEnv(mode, frontendRoot, '');
  if (command === 'build') {
    publicOrigins(
      process.env.PUBLIC_WEBSITE_ORIGIN ?? environment.PUBLIC_WEBSITE_ORIGIN,
      process.env.PUBLIC_APP_ORIGIN ?? environment.PUBLIC_APP_ORIGIN,
      process.env.LOCAL_COMPOSE_BUILD !== 'true',
    );
    publicApiOrigin(
      process.env.PUBLIC_API_ORIGIN ?? environment.PUBLIC_API_ORIGIN,
      process.env.LOCAL_COMPOSE_BUILD !== 'true',
    );
  }
  // Every public value is BAKED into the bundle here, so an empty one is a
  // permanent property of the image -- and it fails silently. A missing
  // Logo.dev token simply made `logoDevUrl` answer null, and every brand mark
  // in the deployed app quietly degraded to initials with nothing in the
  // console to say why. The names are collected and reported once, so the
  // build log shows what this image will be missing.
  const emptyPublicValues: string[] = [];
  const publicValue = (name: string) => {
    const value = process.env[name] ?? environment[name] ?? '';
    if (!value) emptyPublicValues.push(name);
    return JSON.stringify(value);
  };
  const proxy =
    command === 'serve' && !isPreview
      ? createServerProxy(environment.API_SERVICE_ORIGIN)
      : undefined;

  return {
    root: appRoot,
    publicDir: fileURLToPath(new URL('../../public', import.meta.url)),
    plugins: [
      react(),
      {
        name: 'citeladder:report-empty-public-values',
        // `configResolved` rather than the factory body: `define` above has
        // run by then, so the list is complete.
        configResolved() {
          if (command !== 'build' || !emptyPublicValues.length) return;
          console.warn(
            `[citeladder] Building with empty public values: ${emptyPublicValues.join(', ')}. ` +
              'They are baked in at build time, so this image will behave as if they are unset.',
          );
        },
      },
    ],
    define: {
      'process.env.NEXT_PUBLIC_API_REQUEST_TIMEOUT_MS': publicValue(
        'NEXT_PUBLIC_API_REQUEST_TIMEOUT_MS',
      ),
      'process.env.NEXT_PUBLIC_BOOTSTRAP_READ_TIMEOUT_MS': publicValue(
        'NEXT_PUBLIC_BOOTSTRAP_READ_TIMEOUT_MS',
      ),
      'process.env.NEXT_PUBLIC_LOGO_DEV_PUBLISHABLE': publicValue(
        'NEXT_PUBLIC_LOGO_DEV_PUBLISHABLE',
      ),
      'process.env.NEXT_PUBLIC_DEMO_MODE': publicValue('NEXT_PUBLIC_DEMO_MODE'),
      'process.env.NEXT_PUBLIC_SELF_SERVE_SIGNUP': publicValue('NEXT_PUBLIC_SELF_SERVE_SIGNUP'),
      'process.env.PUBLIC_WEBSITE_ORIGIN': publicValue('PUBLIC_WEBSITE_ORIGIN'),
      'process.env.PUBLIC_APP_ORIGIN': publicValue('PUBLIC_APP_ORIGIN'),
      'process.env.PUBLIC_API_ORIGIN': publicValue('PUBLIC_API_ORIGIN'),
      // Optional: empty means the production docs origin (lib/config/docs.ts).
      'process.env.PUBLIC_DOCS_ORIGIN': JSON.stringify(
        process.env.PUBLIC_DOCS_ORIGIN ?? environment.PUBLIC_DOCS_ORIGIN ?? '',
      ),
      'process.env.LOCAL_COMPOSE_BUILD': JSON.stringify(process.env.LOCAL_COMPOSE_BUILD ?? ''),
      // Sign-up and email-link forms; workers-app-deploy.yml names the real key.
      'process.env.PUBLIC_TURNSTILE_SITE_KEY': turnstileSiteKey(
        command === 'serve',
        environment,
        publicValue,
      ),
    },
    resolve: {
      alias: {
        '@': frontendRoot,
      },
    },
    css: {
      postcss: frontendRoot,
    },
    server: {
      host: '127.0.0.1',
      port: 3001,
      strictPort: true,
      fs: {
        strict: true,
        allow: [frontendRoot],
      },
      proxy,
    },
    preview: {
      host: '127.0.0.1',
      port: 3001,
      strictPort: true,
    },
    build: {
      assetsDir: 'app-assets',
      outDir: fileURLToPath(new URL('./dist', import.meta.url)),
      emptyOutDir: true,
      // `scripts/check-bundle-budget.mjs` reads this to compute the EAGER set:
      // the entry plus its transitive static imports. That is the number a cold
      // load actually pays, and the one that regresses silently.
      manifest: true,
      // The support matrix `package.json` already declares. Without this the
      // build used Vite's own default and the browserslist was decorative —
      // the two could disagree and nothing would say so.
      target: ['chrome111', 'edge111', 'firefox128', 'safari16.4'],
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              // Cache stability, not size. These three change on their own
              // release schedule and nothing here changes them, but they were
              // sharing a chunk with application code — so editing anything
              // under `lib/api` invalidated React Router for every returning
              // reader. Highest priority, so no group below can absorb them.
              {
                name: 'vendor-react',
                test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
                priority: 30,
              },
              { name: 'vendor-router', test: /node_modules[\\/]react-router/, priority: 30 },
              { name: 'vendor-zod', test: /node_modules[\\/]zod[\\/]/, priority: 30 },
              // Everything else the entry reaches statically, as one file. The
              // boot path is paid in full on every cold load either way; left
              // to automatic splitting it arrived as ~38 sub-5 KB requests.
              { name: 'app-boot', tags: ['$initial'], priority: 20 },
              // Shared atoms the routes reach lazily, grouped by the set of
              // routes that use them so no route downloads another's atoms;
              // only sub-2 KB slivers merge into a neighbour. A single `ui`
              // chunk cut more files but added ~60 KB to every route, and
              // `experimentalInlineCommonChunks` halved the files but forced
              // strict execution order and grew boot and every route.
              // `packages/contracts` stays ungrouped: one schema chunk would put
              // every domain's schemas in every route.
              {
                name: 'ui',
                test: /[\\/]components[\\/]ui[\\/]/,
                minShareCount: 2,
                priority: 10,
                entriesAware: true,
                entriesAwareMergeThreshold: 2 * 1024,
              },
            ],
          },
        },
      },
    },
  };
});
