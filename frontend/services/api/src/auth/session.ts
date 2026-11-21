import type { Context, MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import { errors as joseErrors, jwtVerify } from 'jose';

import { demoAccessExpired, policy, type ServiceConfig } from '../config.ts';
import type { AppEnv } from '../context.ts';
import type { Database } from '../db/database.ts';
import { ApiError } from '../errors.ts';
import { parseUuid } from '../http/uuid.ts';
import { requiresEmailVerification } from './eligibility.ts';
import {
  membershipContext,
  membershipQuery,
  type MembershipRule,
  type MembershipTarget,
} from './workspace.ts';

type SessionClaims = Record<string, unknown>;

type SessionProfile = {
  id: string;
  email: string;
  role: string;
  is_active: boolean;
  registration_origin: string;
  email_verified_at: Date | null;
  session_version: number;
  created_at: Date;
  updated_at: Date;
};

export type SessionUser = { id: string; sessionVersion: number; profile: SessionProfile };

async function decodeSessionToken(
  token: string,
  secretKey: string,
  now: Date = new Date(),
): Promise<SessionClaims | null> {
  const tolerance = policy.auth.session.clock_tolerance_seconds;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secretKey), {
      algorithms: ['HS256'],
      currentDate: now,
      clockTolerance: tolerance,
    });
    if (
      typeof payload.iat === 'number' &&
      payload.iat > Math.floor(now.getTime() / 1000) + tolerance
    )
      return null;
    return payload;
  } catch (error) {
    if (error instanceof joseErrors.JOSEError) return null;
    throw error;
  }
}

function unauthorized(message: string): ApiError {
  return new ApiError(401, message);
}

const USER_COLUMNS = [
  'users.id',
  'users.email',
  'users.role',
  'users.is_active',
  'users.session_version',
  'users.registration_origin',
  'users.email_verified_at',
  'users.created_at',
  'users.updated_at',
] as const;

type TargetRead = { ok: true; target: MembershipTarget } | { ok: false; error: unknown };

function readTarget(c: Context<AppEnv>, rule: MembershipRule): TargetRead {
  try {
    return { ok: true, target: rule.target(c) };
  } catch (error) {
    return { ok: false, error };
  }
}

async function sessionRow(db: Database, userId: string, target: MembershipTarget | null) {
  const user = db.selectFrom('users').select(USER_COLUMNS).where('users.id', '=', userId);
  if (target === null) {
    const row = await user.executeTakeFirst();
    return row && { ...row, member_workspace_id: null, member_role: null, holds_project: null };
  }
  return user
    .leftJoin(membershipQuery(db, userId, target).as('membership'), (join) => join.onTrue())
    .select([
      'membership.workspace_id as member_workspace_id',
      'membership.role as member_role',
      'membership.holds_project',
    ])
    .executeTakeFirst();
}

export function sessionUser(
  config: ServiceConfig,
  db: Database,
  membership?: MembershipRule,
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (demoAccessExpired(config)) throw unauthorized('Demo access has expired');
    const token = getCookie(c, config.session.cookieName);
    if (!token) throw unauthorized('Not authenticated');

    const claims = await decodeSessionToken(token, config.session.secretKey);
    const userId = parseUuid(claims?.sub);
    const tokenVersion = claims?.ver;
    if (userId === null || !Number.isInteger(tokenVersion)) throw unauthorized('Invalid token');

    const target = membership && readTarget(c, membership);
    const row = await sessionRow(db, userId, target?.ok ? target.target : null);
    if (row === undefined) throw unauthorized('Session no longer valid');
    if (!row.is_active) throw unauthorized('Inactive user');
    if (requiresEmailVerification(row)) throw unauthorized('Email verification required');
    if (tokenVersion !== row.session_version) throw unauthorized('Session no longer valid');

    const {
      member_workspace_id: workspaceId,
      member_role: role,
      holds_project: holdsProject,
      ...profile
    } = row;
    c.set('user', { id: row.id, sessionVersion: row.session_version, profile });
    if (membership && target) {
      if (!target.ok) throw target.error;
      const workspace = membershipContext(target.target, {
        workspace_id: workspaceId,
        role,
        holds_project: holdsProject,
      });
      if (membership.capability !== undefined) workspace.require(membership.capability);
      c.set('workspace', workspace);
    }
    await next();
  };
}
