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
import type { Context, Hono, MiddlewareHandler } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { z } from 'zod';

import { sessionUser } from '../auth/session.ts';
import { activeWorkspace, projectMember, workspaceMember } from '../auth/workspace.ts';
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

type RouteContext = { c: Context<AppEnv>; db: Database; config: ServiceConfig };

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
  method?: 'get' | 'post' | 'put' | 'patch' | 'delete';
  status?: ContentfulStatusCode | 204;
  /** Another success status the same response is served with, such as a replay's 200. */
  alsoStatus?: ContentfulStatusCode;
  body?: z.ZodType;
  headers?: z.ZodObject;
  capability?: WorkspaceCapability;
  /** Resolve the workspace from the path's `project_id` instead of `X-Workspace-Id`. */
  authorize?: 'workspace' | 'project' | 'workspace-path' | 'session' | 'public';
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
    case 'bool':
      return z.boolean();
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
  const publicRoute = route.authorize === 'public';
  const scoped = !publicRoute && route.authorize !== 'session';
  const workspaceHeaders =
    route.authorize === undefined || route.authorize === 'workspace'
      ? ACTIVE_WORKSPACE_HEADERS
      : z.object({});
  const contract: RouteContract = {
    family: route.family,
    method,
    path: route.path,
    pathParams: parameterObject(route.params.path),
    query: parameterObject(route.params.query),
    headers: route.headers ? workspaceHeaders.extend(route.headers.shape) : workspaceHeaders,
    cookies: publicRoute ? z.object({}) : SESSION_COOKIE,
    ...(route.body ? { body: route.body } : {}),
    responses: {
      [status]: route.response,
      ...(route.alsoStatus ? { [route.alsoStatus]: route.response } : {}),
    },
  };
  const register = (app: Hono<AppEnv>, config: ServiceConfig, db: Database) => {
    const pattern = honoPath(route.path);
    // Writes default to `run`; the capability gate precedes parameter validation.
    const capability = route.capability ?? (method === 'get' ? undefined : 'run');
    const authorize: MiddlewareHandler<AppEnv>[] = [];
    if (byProject) authorize.push(projectMember(db));
    else if (route.authorize === 'workspace-path') authorize.push(workspaceMember(db, capability));
    else if (scoped) authorize.push(activeWorkspace(db, capability));
    app.on(
      [method.toUpperCase()],
      [pattern],
      ...(publicRoute ? [] : [sessionUser(config, db)]),
      ...authorize,
      async (c) => {
        if (byProject && capability !== undefined) c.get('workspace').require(capability);
        const params = validateParams(route.params, {
          path: c.req.param() as Record<string, string>,
          search: new URL(c.req.url).search,
        });
        if (route.raw) return route.handle({ c, db, config }, params);
        return c.json(
          await route.handle({ c, db, config }, params),
          status as ContentfulStatusCode,
        );
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

/** A `204 No Content` route: the handler performs the deletion and returns nothing. */
export function defineDeleteRoute<const Path extends ParamSpecs, const Query extends ParamSpecs>(
  route: Omit<
    RouteSpec<Path, Query, z.ZodType>,
    'method' | 'response' | 'status' | 'alsoStatus' | 'raw' | 'handle'
  > & {
    handle: (context: RouteContext, params: RequestParams<Path, Query>) => Promise<void>;
  },
): ProductRoute {
  const product = defineRoute({
    ...route,
    method: 'delete',
    status: 204,
    response: z.null(),
    raw: true,
    async handle(context, params) {
      await route.handle(context, params);
      return context.c.body(null, 204);
    },
  });
  return { ...product, contract: { ...product.contract, responses: { 204: null } } };
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
