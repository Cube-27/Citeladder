import { fileURLToPath } from 'node:url';

import node from '@astrojs/node';
import react from '@astrojs/react';
import { defineConfig } from 'astro/config';
import { loadEnv } from 'vite';
import { publicOrigins } from '../../lib/config/public-origins.ts';

const frontendRoot = fileURLToPath(new URL('../..', import.meta.url));

const mode = process.env.NODE_ENV === 'production' ? 'production' : 'development';
const environment = loadEnv(mode, frontendRoot, '');
if (mode === 'production') {
  publicOrigins(
    process.env.PUBLIC_WEBSITE_ORIGIN ?? environment.PUBLIC_WEBSITE_ORIGIN,
    process.env.PUBLIC_APP_ORIGIN ?? environment.PUBLIC_APP_ORIGIN,
    true,
  );
}
const apiRequestTimeout = JSON.stringify(
  process.env.NEXT_PUBLIC_API_REQUEST_TIMEOUT_MS ??
    environment.NEXT_PUBLIC_API_REQUEST_TIMEOUT_MS ??
    '',
);

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
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
      'process.env.NEXT_PUBLIC_API_REQUEST_TIMEOUT_MS': apiRequestTimeout,
      'process.env.PUBLIC_WEBSITE_ORIGIN': JSON.stringify(
        process.env.PUBLIC_WEBSITE_ORIGIN ?? environment.PUBLIC_WEBSITE_ORIGIN ?? '',
      ),
      'process.env.PUBLIC_APP_ORIGIN': JSON.stringify(
        process.env.PUBLIC_APP_ORIGIN ?? environment.PUBLIC_APP_ORIGIN ?? '',
      ),
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
