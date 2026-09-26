/**
 * A product route: its published contract, its parameters and its handler.
 *
 * The parameter specs are the single declaration: they validate requests
 * (`http/params.ts`) and generate the OpenAPI parameters the parity gate
 * compares with the frozen Python fragment. Every route here is a
 * workspace-scoped read resolved like FastAPI's `require_active_workspace`:
 * session first (401), then the active workspace (400/404), then the
 * parameters (422), as FastAPI resolves dependencies before parameters.
 */
import type { Context, Hono } from 'hono';
import { z } from 'zod';

import { sessionUser } from '../auth/session.ts';
import { activeWorkspace } from '../auth/workspace.ts';
import { policy, type ServiceConfig } from '../config.ts';
import type { AppEnv } from '../context.ts';
import type { Database } from '../db/database.ts';
import { ApiError } from '../errors.ts';
import {
  validateParams,
  type ParamSpec,
  type ParamSpecs,
  type RequestParams,
} from '../http/params.ts';
import type { RouteContract } from '../openapi/routes.ts';

export type RouteHandler<Path extends ParamSpecs, Query extends ParamSpecs> = (
  context: { c: Context<AppEnv>; db: Database },
  params: RequestParams<Path, Query>,
) => Promise<unknown>;

export type ProductRoute = {
  contract: RouteContract;
  /** The declared parameters, as `validateParams` reads them. */
  params: { path: ParamSpecs; query: ParamSpecs };
  register: (app: Hono<AppEnv>, config: ServiceConfig, db: Database) => void;
};

function scalarSchema(spec: ParamSpec): z.ZodType {
  const { scalar } = spec;
  switch (scalar.kind) {
    case 'uuid':
      return z.uuid();
    case 'date':
      return z.iso.date();
    case 'datetime':
      return z.iso.datetime({ offset: true });
    case 'int':
      return z.int().min(scalar.ge).max(scalar.le);
    case 'str': {
      let schema = z.string();
      if (scalar.minLength !== undefined) schema = schema.min(scalar.minLength);
      if (scalar.maxLength !== undefined) schema = schema.max(scalar.maxLength);
      return schema;
    }
    case 'literal':
      return z.enum(scalar.values as [string, ...string[]]);
  }
}

/** The OpenAPI view of the specs: FastAPI's parameter schemas, by wire name. */
function parameterObject(specs: ParamSpecs): z.ZodObject {
  const shape: Record<string, z.ZodType> = {};
  for (const [name, spec] of Object.entries(specs)) {
    const scalar = scalarSchema(spec);
    const item = spec.list ? z.array(scalar) : scalar;
    if (spec.required) shape[spec.alias ?? name] = item;
    else if (spec.default !== undefined) shape[spec.alias ?? name] = item.default(spec.default);
    else shape[spec.alias ?? name] = item.nullable().optional();
  }
  return z.object(shape);
}

const optionalString = z.string().nullable().optional();
const ACTIVE_WORKSPACE_HEADERS = z.object({ 'x-workspace-id': optionalString });
const SESSION_COOKIE = z.object({ [policy.settings.session_cookie_name.default]: optionalString });

/** FastAPI's `{name}` path template as a Hono pattern. */
function honoPath(path: string): string {
  return path.replaceAll(/\{([^}]+)\}/gu, ':$1');
}

// Starlette answers a matched path requested with another method 405, before
// any dependency runs.
function methodNotAllowed(): never {
  throw new ApiError(405, 'Method Not Allowed', { headers: { allow: 'GET' } });
}

export function defineGetRoute<
  const Path extends ParamSpecs,
  const Query extends ParamSpecs,
>(route: {
  family: RouteContract['family'];
  path: string;
  params: { path: Path; query: Query };
  response: z.ZodType;
  handle: RouteHandler<Path, Query>;
}): ProductRoute {
  const contract: RouteContract = {
    family: route.family,
    method: 'get',
    path: route.path,
    pathParams: parameterObject(route.params.path),
    query: parameterObject(route.params.query),
    headers: ACTIVE_WORKSPACE_HEADERS,
    cookies: SESSION_COOKIE,
    responses: { 200: route.response },
  };
  const register = (app: Hono<AppEnv>, config: ServiceConfig, db: Database) => {
    const pattern = honoPath(route.path);
    // Hono serves HEAD from GET handlers; FastAPI declares GET alone.
    app.use(pattern, async (c, next) => {
      if (c.req.method !== 'GET') methodNotAllowed();
      await next();
    });
    app.get(pattern, sessionUser(config, db), activeWorkspace(db), async (c) => {
      const params = validateParams(route.params, {
        path: c.req.param() as Record<string, string>,
        search: new URL(c.req.url).search,
      });
      return c.json(await route.handle({ c, db }, params));
    });
  };
  return { contract, params: route.params, register };
}
