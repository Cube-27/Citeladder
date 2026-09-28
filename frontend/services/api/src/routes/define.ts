/**
 * A product route: its published contract, its parameters and its handler.
 *
 * The parameter specs are the single declaration: they validate requests
 * (`http/params.ts`) and generate the route's OpenAPI parameters. A route
 * resolves its workspace like FastAPI's `require_active_workspace` (the
 * default) or, with `authorize: 'project'`, like `require_project_member`:
 * session first (401), then the workspace or project (400/404), the
 * capability (403) and the parameters (422), as FastAPI resolves dependencies
 * before parameters.
 */
import type { Context, Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { z } from 'zod';

import { sessionUser } from '../auth/session.ts';
import { activeWorkspace, projectMember } from '../auth/workspace.ts';
import type { WorkspaceCapability } from '../auth/workspace.ts';
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

type RouteContext = { c: Context<AppEnv>; db: Database };

/**
 * A JSON route's handler must return what its response contract accepts, so
 * the shared contract and the handler cannot drift apart; a raw route builds
 * its own `Response` (a file download, or a status chosen per request).
 */
type RouteBody<Path extends ParamSpecs, Query extends ParamSpecs, Response extends z.ZodType> =
  | {
      raw?: false;
      handle: (
        context: RouteContext,
        params: RequestParams<Path, Query>,
      ) => Promise<z.input<Response>>;
    }
  | {
      raw: true;
      handle: (
        context: RouteContext,
        params: RequestParams<Path, Query>,
      ) => Promise<globalThis.Response>;
    };

type RouteSpec<Path extends ParamSpecs, Query extends ParamSpecs, Response extends z.ZodType> = {
  family: RouteContract['family'];
  path: string;
  params: { path: Path; query: Query };
  response: Response;
  method?: 'get' | 'post' | 'put' | 'patch';
  status?: ContentfulStatusCode;
  /** Another success status the same response is served with, such as a replay's 200. */
  alsoStatus?: ContentfulStatusCode;
  body?: z.ZodType;
  headers?: z.ZodObject;
  capability?: WorkspaceCapability;
  /** Resolve the workspace from the path's `project_id` instead of `X-Workspace-Id`. */
  authorize?: 'workspace' | 'project';
} & RouteBody<Path, Query, Response>;

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
    case 'float':
      return z.number();
    case 'int': {
      let schema = z.int();
      if (scalar.ge !== undefined) schema = schema.min(scalar.ge);
      if (scalar.le !== undefined) schema = schema.max(scalar.le);
      return schema;
    }
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
function methodNotAllowed(method: string): never {
  throw new ApiError(405, 'Method Not Allowed', { headers: { allow: method } });
}

function defineRoute<
  const Path extends ParamSpecs,
  const Query extends ParamSpecs,
  Response extends z.ZodType,
>(route: RouteSpec<Path, Query, Response>): ProductRoute {
  const method = route.method ?? 'get';
  const status = route.status ?? 200;
  const byProject = route.authorize === 'project';
  const workspaceHeaders = byProject ? z.object({}) : ACTIVE_WORKSPACE_HEADERS;
  const contract: RouteContract = {
    family: route.family,
    method,
    path: route.path,
    pathParams: parameterObject(route.params.path),
    query: parameterObject(route.params.query),
    headers: route.headers ? workspaceHeaders.extend(route.headers.shape) : workspaceHeaders,
    cookies: SESSION_COOKIE,
    ...(route.body ? { body: route.body } : {}),
    responses: {
      [status]: route.response,
      ...(route.alsoStatus ? { [route.alsoStatus]: route.response } : {}),
    },
  };
  const register = (app: Hono<AppEnv>, config: ServiceConfig, db: Database) => {
    const pattern = honoPath(route.path);
    app.on(
      method.toUpperCase(),
      pattern,
      sessionUser(config, db),
      byProject ? projectMember(db) : activeWorkspace(db),
      async (c) => {
        if (method !== 'get') c.get('workspace').require(route.capability ?? 'run');
        const params = validateParams(route.params, {
          path: c.req.param() as Record<string, string>,
          search: new URL(c.req.url).search,
        });
        if (route.raw) return route.handle({ c, db }, params);
        return c.json(await route.handle({ c, db }, params), status);
      },
    );
  };
  return { contract, params: route.params, register };
}

export const defineGetRoute = defineRoute;
export function definePostRoute<
  const Path extends ParamSpecs,
  const Query extends ParamSpecs,
  Response extends z.ZodType,
>(route: RouteSpec<Path, Query, Response>): ProductRoute {
  return defineRoute({ ...route, method: 'post' });
}
export function definePutRoute<
  const Path extends ParamSpecs,
  const Query extends ParamSpecs,
  Response extends z.ZodType,
>(route: RouteSpec<Path, Query, Response>): ProductRoute {
  return defineRoute({ ...route, method: 'put' });
}
export function definePatchRoute<
  const Path extends ParamSpecs,
  const Query extends ParamSpecs,
  Response extends z.ZodType,
>(route: RouteSpec<Path, Query, Response>): ProductRoute {
  return defineRoute({ ...route, method: 'patch' });
}

/** Register once before handlers: a path may support several methods. */
export function registerMethodGuards(app: Hono<AppEnv>, routes: readonly ProductRoute[]): void {
  const methods = new Map<string, Set<string>>();
  for (const { contract } of routes) {
    const allowed = methods.get(contract.path) ?? new Set<string>();
    allowed.add(contract.method.toUpperCase());
    methods.set(contract.path, allowed);
  }
  const guards = [...methods]
    .map(([path, allowed]) => {
      const segments = path.split('/');
      const parameters = segments.filter((segment) => segment.startsWith('{')).length;
      return {
        segments: segments.map((segment) => (segment.startsWith('{') ? null : segment)),
        parameters,
        allowed,
      };
    })
    .sort((a, b) => a.parameters - b.parameters);
  app.use('*', async (c, next) => {
    // A literal route such as /competitors/discoveries takes precedence over
    // /competitors/{candidate_id}. Its GET must not inherit the latter's PATCH
    // guard. Hono's implicit HEAD remains disallowed unless explicitly declared.
    const segments = c.req.path.split('/');
    const guard = guards.find(
      (entry) =>
        entry.segments.length === segments.length &&
        entry.segments.every((segment, index) =>
          segment === null ? Boolean(segments[index]) : segment === segments[index],
        ),
    );
    if (guard && !guard.allowed.has(c.req.method)) methodNotAllowed([...guard.allowed].join(', '));
    await next();
  });
}
