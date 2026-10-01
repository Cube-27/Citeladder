import { z } from 'zod';
import { logicalEngineSchema, transportProviderSchema } from '@citeladder/contracts/providers';
import { providerPolicy } from './config.ts';

export function appModelUrl(value: string): string {
  const url = new URL(value.trim());
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
      !providerPolicy.app.allowed_ports.includes(Number(url.port || 443)))
    throw new Error('App model URL must use HTTPS with a safe authority');
  url.hostname = url.hostname.toLowerCase().replace(/\.$/u, '');
  url.pathname = '/' + url.pathname.split('/').filter(Boolean).join('/');
  if (url.pathname === '/') url.pathname = '/v1';
  return url.href.replace(/\/$/u, '');
}
const endpoint = z.string().max(1024).refine((value) => {
  if (!value) return true;
  try {
    const url = new URL(value);
    return !url.username && !url.password && !url.search && !url.hash &&
      (url.protocol === 'https:' ||
        (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)));
  } catch { return false; }
}, 'Provider endpoint is invalid');
const appRoute = z.object({
  disclosure_accepted: z.literal(true),
  feature: z.literal('agent'),
  protocol: z.literal('openai_chat').default('openai_chat'),
  model: z.string().trim().min(1).max(255),
  api_base_url: z.string().min(1).max(1024).transform((value, ctx) => {
    try { return appModelUrl(value); }
    catch { ctx.addIssue({ code: 'custom', message: 'App model URL is invalid' }); return z.NEVER; }
  }),
  active: z.boolean().default(true),
});
const routes = z.array(z.object({
  logical_engine: logicalEngineSchema, is_default: z.boolean().default(false),
})).refine((items) => new Set(items.map((item) => item.logical_engine)).size === items.length,
  'Provider engines must be unique');
const appRoutes = z.array(appRoute).refine((items) =>
  new Set(items.map((item) => item.feature)).size === items.length, 'App model features must be unique');
const credentials = {
  api_key: z.string().default(''),
  api_login: z.string().max(255).default(''),
  api_password: z.string().default(''),
};
export const createConnectionInput = z.object({
  label: z.string().max(255).default(''),
  transport_provider: transportProviderSchema,
  ...credentials,
  base_url: endpoint.default(''),
  active: z.boolean().default(true),
  routes: routes.default([]),
  app_routes: appRoutes.default([]),
}).superRefine((input, ctx) => {
  const pair = input.transport_provider === 'dataforseo';
  if ((pair && (input.api_key || !input.api_login.trim() || !input.api_password || input.app_routes.length)) ||
      (!pair && (!input.api_key.trim() || input.api_login || input.api_password)))
    ctx.addIssue({ code: 'custom', message: 'Credentials must match the provider transport' });
});
export const updateConnectionInput = z.object({
  label: z.string().max(255).nullish(),
  api_key: z.string().nullish(),
  api_login: z.string().max(255).nullish(),
  api_password: z.string().nullish(),
  base_url: endpoint.nullish(),
  active: z.boolean().nullish(),
  routes: routes.nullish(),
  app_routes: appRoutes.nullish(),
  confirm_destination_change: z.boolean().default(false),
}).superRefine((input, ctx) => {
  const login = input.api_login?.trim() || '';
  const password = input.api_password || '';
  if (Boolean(login) !== Boolean(password) || (input.api_key?.trim() && (login || password)))
    ctx.addIssue({ code: 'custom', message: 'Supply a key or both credential halves' });
});
export type ConnectionCreate = z.output<typeof createConnectionInput>;
export type ConnectionUpdate = z.output<typeof updateConnectionInput>;
export type AppRouteInput = z.output<typeof appRoute>;
