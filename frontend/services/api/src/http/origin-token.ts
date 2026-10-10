import { timingSafeEqual } from 'node:crypto';
import ipaddr from 'ipaddr.js';
import type { MiddlewareHandler } from 'hono';
import { configEnvironment, policy, resolveSettingSpec, type ServiceConfig } from '../config.ts';
import type { AppEnv } from '../context.ts';
import { ApiError, notFound } from '../errors.ts';

function hostOf(origin: string): string {
  try {
    return new URL(origin).host.toLowerCase();
  } catch {
    return '';
  }
}

/** The apex (MCP), app and API hosts the Workers may name as a request's public host. */
function publicHosts(config: ServiceConfig): Set<string> {
  const mcpBase = String(
    resolveSettingSpec(policy.mcp.settings.public_base_url, configEnvironment(config)),
  ).trim();
  return new Set(
    [config.auth.frontendUrl, mcpBase || config.auth.frontendUrl, config.auth.publicApiUrl]
      .map(hostOf)
      .filter(Boolean),
  );
}

/** Machine routes live under `policy.api.machine_prefix`; only the API host serves them, and only them. */
export function isMachinePath(path: string): boolean {
  const prefix = policy.api.machine_prefix;
  return path === prefix || path.startsWith(prefix + '/');
}

/**
 * Cloud Run admission: only the Workers hold the origin token. An admitted
 * request also carries its public host (allowlisted) and the visitor address
 * Cloudflare observed, which no other hop can supply on a raw run.app URL.
 */
export function originToken(config: ServiceConfig): MiddlewareHandler<AppEnv> {
  const allowed = config.execution.protectOrigin
    ? [config.execution.originToken, config.execution.previousOriginToken]
        .filter(Boolean)
        .map((token) => Buffer.from(token, 'utf8'))
    : [];
  const hosts = allowed.length ? publicHosts(config) : new Set<string>();
  const apiHost = hostOf(config.auth.publicApiUrl);
  return async (c, next) => {
    if (allowed.length) {
      const supplied = Buffer.from(c.req.header('X-CiteLadder-Origin-Token') ?? '', 'utf8');
      if (
        !allowed.some(
          (token) => token.length === supplied.length && timingSafeEqual(token, supplied),
        )
      )
        throw new ApiError(403, 'Forbidden');
      const publicHost = c.req.header('X-CiteLadder-Public-Host')?.trim().toLowerCase() ?? '';
      if (!hosts.has(publicHost)) throw new ApiError(403, 'Forbidden');
      if ((publicHost === apiHost) !== isMachinePath(c.req.path)) throw notFound('Route');
      c.set('publicHost', publicHost);
      const clientIp = c.req.header('X-CiteLadder-Client-IP')?.trim() ?? '';
      if (ipaddr.isValid(clientIp)) c.set('clientIp', ipaddr.process(clientIp).toString());
    }
    await next();
  };
}
