import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

import { createServerProxy } from './server-proxy';

const appRoot = fileURLToPath(new URL('.', import.meta.url));
const frontendRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig(({ command, mode }) => {
  const environment = loadEnv(mode, frontendRoot, '');
  const publicValue = (name: string) =>
    JSON.stringify(process.env[name] ?? environment[name] ?? '');
  const proxy = command === 'serve' ? createServerProxy(environment.BACKEND_ORIGIN) : undefined;

  return {
    root: appRoot,
    publicDir: fileURLToPath(new URL('../../public', import.meta.url)),
    plugins: [react()],
    define: {
      'process.env.NEXT_PUBLIC_API_REQUEST_TIMEOUT_MS': publicValue(
        'NEXT_PUBLIC_API_REQUEST_TIMEOUT_MS',
      ),
      'process.env.NEXT_PUBLIC_LOGO_DEV_PUBLISHABLE': publicValue(
        'NEXT_PUBLIC_LOGO_DEV_PUBLISHABLE',
      ),
      'process.env.NEXT_PUBLIC_DEMO_MODE': publicValue('NEXT_PUBLIC_DEMO_MODE'),
      'process.env.NEXT_PUBLIC_SITE_URL': publicValue('NEXT_PUBLIC_SITE_URL'),
    },
    resolve: {
      alias: {
        '@': frontendRoot,
        'next/image': fileURLToPath(new URL('./src/compat/next-image.tsx', import.meta.url)),
        'next/link': fileURLToPath(new URL('./src/compat/next-link.tsx', import.meta.url)),
        'next/navigation': fileURLToPath(
          new URL('./src/compat/next-navigation.ts', import.meta.url),
        ),
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
      outDir: fileURLToPath(new URL('./dist', import.meta.url)),
      emptyOutDir: true,
    },
  };
});
