import { timingSafeEqual } from 'node:crypto';
import ipaddr from 'ipaddr.js';
import type { MiddlewareHandler } from 'hono';
import { policy, type ServiceConfig } from '../config.ts';
import type { AppEnv } from '../context.ts';
import { ApiError, notFound } from '../errors.ts';
import { MCP_API_HOST_PATHS } from '@citeladder/contracts/route-ownership';
import {
  ORIGIN_CLIENT_IP_HEADER,
  ORIGIN_PUBLIC_HOST_HEADER,
  ORIGIN_SIGNATURE_HEADER,
  ORIGIN_TIMESTAMP_HEADER,
  signOriginRequest,
  type OriginSignedFacts,
} from '@citeladder/contracts/origin-signature';

function hostOf(origin: string): string {
  try {
    return new URL(origin).host.toLowerCase();
  } catch {
    return '';
  }
}

/** The apex, app and API hosts the Workers may name as a request's public host. */
function publicHosts(config: ServiceConfig): Set<string> {
  return new Set(
    [config.auth.frontendUrl, config.auth.publicWebsiteUrl, config.auth.publicApiUrl]
      .map(hostOf)
      .filter(Boolean),
  );
}

/** Machine routes live under `policy.api.machine_prefix`. */
export function isMachinePath(path: string): boolean {
  const prefix = policy.api.machine_prefix;
  return path === prefix || path.startsWith(prefix + '/');
}

/** Only the API host serves machine routes and the MCP protocol, and only those. */
function isApiHostPath(path: string): boolean {
  return isMachinePath(path) || MCP_API_HOST_PATHS.has(path);
}

/** Whether a supplied hex signature equals one made with any current origin key. */
async function signedByOrigin(keys: readonly string[], facts: OriginSignedFacts, supplied: string) {
  const given = Buffer.from(supplied, 'utf8');
  const matches = await Promise.all(
    keys.map(async (key) => {
      const expected = Buffer.from(await signOriginRequest(key, facts), 'utf8');
      return expected.length === given.length && timingSafeEqual(expected, given);
    }),
  );
  return matches.includes(true);
}

/**
 * Cloud Run admission: only the Workers hold the origin key, and they never
 * send it. Each request carries an HMAC over its time, method, public host,
 * path and visitor address; a request without a fresh, valid signature from
 * the current or previous key is refused before any route runs. The signed
 * public host must be allowlisted, and the signed visitor address is the only
 * client address the API trusts.
 */
export function originToken(config: ServiceConfig): MiddlewareHandler<AppEnv> {
  const keys = config.execution.protectOrigin
    ? [config.execution.originToken, config.execution.previousOriginToken].filter(Boolean)
    : [];
  const hosts = keys.length ? publicHosts(config) : new Set<string>();
  const apiHost = hostOf(config.auth.publicApiUrl);
  const maxSkew = policy.api.origin_signature_max_skew_seconds;
  return async (c, next) => {
    if (keys.length) {
      const timestamp = Number(c.req.header(ORIGIN_TIMESTAMP_HEADER) ?? '');
      const now = Math.floor(Date.now() / 1000);
      if (!Number.isSafeInteger(timestamp) || Math.abs(now - timestamp) > maxSkew)
        throw new ApiError(403, 'Forbidden');
      const publicHost = c.req.header(ORIGIN_PUBLIC_HOST_HEADER)?.trim().toLowerCase() ?? '';
      const clientIp = c.req.header(ORIGIN_CLIENT_IP_HEADER)?.trim() ?? '';
      const url = new URL(c.req.url);
      const facts = {
        timestamp,
        method: c.req.method,
        publicHost,
        target: `${url.pathname}${url.search}`,
        clientIp,
      };
      if (!(await signedByOrigin(keys, facts, c.req.header(ORIGIN_SIGNATURE_HEADER) ?? '')))
        throw new ApiError(403, 'Forbidden');
      if (!hosts.has(publicHost)) throw new ApiError(403, 'Forbidden');
      if ((publicHost === apiHost) !== isApiHostPath(c.req.path)) throw notFound('Route');
      c.set('publicHost', publicHost);
      if (ipaddr.isValid(clientIp)) c.set('clientIp', ipaddr.process(clientIp).toString());
    }
    await next();
  };
}
