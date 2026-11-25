import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin, type ViteUserConfig, loadEnv } from 'vite-plus';

import {
  BOOT_SIDEBAR_MARKER,
  BOOT_TITLE_FILE,
  bootSidebarHtml,
  bootTitleScript,
  type RouteManifest,
} from './boot-shell.ts';
import { createServerProxy } from './server-proxy.ts';
import { publicApiOrigin, publicOrigins } from '../../lib/config/public-origins.ts';
import { TURNSTILE_TEST_SITE_KEY } from '../../lib/config/turnstile.ts';
import { RELEASE_META_NAME } from '../../lib/config/operational.ts';
import { brandFontHead } from '../../lib/fonts/brand-fonts.ts';

const BRAND_FONTS_MARKER = '<!-- brand-fonts -->';

const appRoot = fileURLToPath(new URL('.', import.meta.url));
const frontendRoot = fileURLToPath(new URL('../..', import.meta.url));

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

function bootShell(): Plugin {
  let manifest: Promise<RouteManifest> | undefined;
  const load = (): Promise<RouteManifest> => {
    manifest ??= import(
      /* @vite-ignore */ new URL('../../lib/navigation/app-routes.ts', import.meta.url).href
    );
    return manifest;
  };
  return {
    name: 'citeladder:boot-shell',
    async transformIndexHtml(html) {
      if (!html.includes(BOOT_SIDEBAR_MARKER))
        throw new Error('index.html lost its boot-sidebar marker');
      return html.replace(BOOT_SIDEBAR_MARKER, bootSidebarHtml(await load()));
    },
    configureServer(server) {
      server.middlewares.use(`/${BOOT_TITLE_FILE}`, (_request, response, next) => {
        load().then((routes) => {
          response.setHeader('Content-Type', 'text/javascript; charset=utf-8');
          response.end(bootTitleScript(routes));
        }, next);
      });
    },
    async generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: BOOT_TITLE_FILE,
        source: bootTitleScript(await load()),
      });
    },
  };
}

function releaseId(): string {
  const value = process.env.PUBLIC_APP_RELEASE || process.env.GITHUB_SHA || '';
  return /^[\w.-]{1,64}$/u.test(value) ? value : '';
}

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
        name: 'citeladder:brand-fonts',
        transformIndexHtml(html) {
          if (!html.includes(BRAND_FONTS_MARKER))
            throw new Error('index.html lost its brand-fonts marker');
          return html.replace(BRAND_FONTS_MARKER, brandFontHead('app'));
        },
      },
      bootShell(),
      {
        name: 'citeladder:report-empty-public-values',
        configResolved() {
          if (command !== 'build' || !emptyPublicValues.length) return;
          console.warn(
            `[citeladder] Building with empty public values: ${emptyPublicValues.join(', ')}. ` +
              'They are baked in at build time, so this image will behave as if they are unset.',
          );
        },
      },
      {
        name: 'citeladder:release-meta',
        transformIndexHtml() {
          const release = releaseId();
          return release
            ? [
                {
                  tag: 'meta',
                  attrs: { name: RELEASE_META_NAME, content: release },
                  injectTo: 'head',
                },
              ]
            : [];
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
      'process.env.PUBLIC_DOCS_ORIGIN': JSON.stringify(
        process.env.PUBLIC_DOCS_ORIGIN ?? environment.PUBLIC_DOCS_ORIGIN ?? '',
      ),
      'process.env.LOCAL_COMPOSE_BUILD': JSON.stringify(process.env.LOCAL_COMPOSE_BUILD ?? ''),
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
      manifest: true,
      target: ['chrome123', 'edge123', 'firefox132', 'safari17.5'],
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              {
                name: 'vendor-react',
                test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
                priority: 30,
              },
              { name: 'vendor-router', test: /node_modules[\\/]react-router/, priority: 30 },
              { name: 'vendor-zod', test: /node_modules[\\/]zod[\\/]/, priority: 30 },
              { name: 'app-boot', tags: ['$initial'], priority: 20 },
              {
                name: 'ui',
                test: /\/components\/ui\/(?!(?:area-chart|part-donut)\.tsx)/,
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
