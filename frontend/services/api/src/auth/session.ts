/**
 * Session verification, including cookies issued by the former Python runtime.
 *
 * An HS256 JWT in the
 * HttpOnly session cookie, whose `ver` claim must equal the user's
 * `session_version`. Issuance belongs to the TypeScript auth service.
 */
import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import { errors as joseErrors, jwtVerify } from 'jose';

import { demoAccessExpired, type ServiceConfig } from '../config.ts';
import type { AppEnv } from '../context.ts';
import type { Database } from '../db/database.ts';
import { ApiError } from '../errors.ts';
import { parseUuid } from '../http/uuid.ts';

type SessionClaims = Record<string, unknown>;

export type SessionUser = { id: string; sessionVersion: number };

/**
 * Verify a session token as `decode_access_token` does, or return null.
 *
 * `exp` and `nbf` are enforced by jose; joserfc additionally rejects an `iat`
 * in the future, so that is checked here.
 */
async function decodeSessionToken(
  token: string,
  secretKey: string,
  now: Date = new Date(),
): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secretKey), {
      algorithms: ['HS256'],
      currentDate: now,
    });
    if (typeof payload.iat === 'number' && payload.iat > Math.floor(now.getTime() / 1000)) {
      return null;
    }
    return payload;
  } catch (error) {
    if (error instanceof joseErrors.JOSEError) return null;
    throw error;
  }
}

function unauthorized(message: string): ApiError {
  return new ApiError(401, message);
}

export function sessionUser(config: ServiceConfig, db: Database): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (demoAccessExpired(config)) throw unauthorized('Demo access has expired');
    const token = getCookie(c, config.session.cookieName);
    if (!token) throw unauthorized('Not authenticated');

    const claims = await decodeSessionToken(token, config.session.secretKey);
    const userId = parseUuid(claims?.sub);
    const tokenVersion = claims?.ver;
    if (userId === null || !Number.isInteger(tokenVersion)) throw unauthorized('Invalid token');

    const user = await db
      .selectFrom('users')
      .select(['id', 'is_active', 'session_version'])
      .where('id', '=', userId)
      .executeTakeFirst();
    // A decoded token naming no row is a stale session (e.g. after a local
    // database reset), not a disabled account.
    if (user === undefined) throw unauthorized('Session no longer valid');
    if (!user.is_active) throw unauthorized('Inactive user');
    if (tokenVersion !== user.session_version) throw unauthorized('Session no longer valid');

    c.set('user', { id: user.id, sessionVersion: user.session_version });
    await next();
  };
}
