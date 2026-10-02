import { timingSafeEqual } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';
import type { ServiceConfig } from '../config.ts';
import type { AppEnv } from '../context.ts';
import { ApiError } from '../errors.ts';

export function originToken(config: ServiceConfig): MiddlewareHandler<AppEnv> {
  // The existing VM retains Caddy admission/probes until the Cloud Run cutover.
  const allowed = config.execution.protectOrigin
    ? [config.execution.originToken, config.execution.previousOriginToken]
        .filter(Boolean)
        .map((token) => Buffer.from(token, 'utf8'))
    : [];
  return async (c, next) => {
    if (allowed.length) {
      const supplied = Buffer.from(c.req.header('X-CiteLadder-Origin-Token') ?? '', 'utf8');
      if (
        !allowed.some(
          (token) => token.length === supplied.length && timingSafeEqual(token, supplied),
        )
      )
        throw new ApiError(403, 'Forbidden');
    }
    await next();
  };
}
