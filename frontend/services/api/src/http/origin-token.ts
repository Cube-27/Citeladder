import { createHash, timingSafeEqual } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';
import type { ServiceConfig } from '../config.ts';
import type { AppEnv } from '../context.ts';
import { ApiError } from '../errors.ts';

const digest = (value: string) => createHash('sha256').update(value).digest();

export function originToken(config: ServiceConfig): MiddlewareHandler<AppEnv> {
  // The existing VM retains Caddy admission/probes until the Cloud Run cutover.
  const allowed = config.execution.protectOrigin
    ? [config.execution.originToken, config.execution.previousOriginToken]
        .filter(Boolean)
        .map(digest)
    : [];
  return async (c, next) => {
    if (allowed.length) {
      const supplied = digest(c.req.header('X-CiteLadder-Origin-Token') ?? '');
      if (!allowed.some((token) => timingSafeEqual(token, supplied)))
        throw new ApiError(403, 'Forbidden');
    }
    await next();
  };
}
