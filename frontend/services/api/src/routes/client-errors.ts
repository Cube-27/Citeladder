/**
 * The browser's report sinks: one structured log line per report, which Cloud
 * Logging collects. Nothing is stored and nothing leaves the service. Who
 * reported comes from the session when there is one, never from the body.
 */
import {
  CSP_REPORTS_PATH,
  clientReportSchema,
  cspReportBatchSchema,
  withoutQueryStrings,
  type ClientReport,
} from '@citeladder/contracts/client-errors';
import type { Context } from 'hono';
import { z } from 'zod';

import { budget, spendBudget } from '../abuse/usage.ts';
import { trustedClientNetwork } from '../auth/client-identity.ts';
import { sessionUser, type SessionUser } from '../auth/session.ts';
import { activeWorkspaceMembership } from '../auth/workspace.ts';
import { clientErrors } from '../config/client-errors.ts';
import type { ServiceConfig } from '../config.ts';
import type { AppEnv } from '../context.ts';
import type { Database } from '../db/database.ts';
import { ApiError } from '../errors.ts';
import { readBody } from '../http/body.ts';
import { getLogger } from '../logging.ts';
import { definePostRoute } from './define.ts';

/**
 * The reporting user and, when the request names one in `X-Workspace-Id`,
 * that workspace once the session's membership resolution accepts it. A
 * request naming none records none: it never falls back to the user's
 * earliest workspace. A signed-out or stale session, or a workspace the user
 * is not a member of, reports with whatever was proved: the user alone, or
 * nobody.
 */
async function reporter(c: Context<AppEnv>, config: ServiceConfig, db: Database) {
  const seen: { workspaceId: string | null } = { workspaceId: null };
  const named = c.req.header('x-workspace-id') !== undefined;
  try {
    await sessionUser(
      config,
      db,
      named ? activeWorkspaceMembership() : undefined,
    )(c, () => {
      if (!named) return Promise.resolve();
      seen.workspaceId = c.get('workspace').workspaceId;
      return Promise.resolve();
    });
  } catch (error) {
    if (!(error instanceof ApiError) || error.status >= 500) throw error;
  }
  // Set only when the session proved a user, whether or not membership followed.
  const user: SessionUser | undefined = c.get('user');
  return { user_id: user?.id ?? null, workspace_id: seen.workspaceId };
}

async function admit(
  c: Context<AppEnv>,
  { config, db }: { config: ServiceConfig; db: Database },
  { maxBytes, budgetName }: { maxBytes: number; budgetName: 'client_error_report' | 'csp_report' },
) {
  const raw = await c.req.text();
  if (Buffer.byteLength(raw) > maxBytes) throw new ApiError(413, 'Request body too large');
  await spendBudget(db, budget(budgetName, config.settings), trustedClientNetwork(c, config));
}

/** The log line one report becomes: a missing chunk is the expected cost of a deploy. */
function logLine(report: ClientReport) {
  switch (report.kind) {
    case 'slow_interaction':
      return {
        event: 'client.slow_interaction',
        level: 'info' as const,
        fields: {
          ...report,
          scripts: report.scripts.map((script) => ({
            ...script,
            source: withoutQueryStrings(script.source),
            invoker: withoutQueryStrings(script.invoker),
          })),
        },
      };
    case 'chunk_load':
    case 'render':
    case 'route':
    case 'unhandled':
      return {
        event: 'client.error',
        level: report.kind === 'chunk_load' ? ('warning' as const) : ('error' as const),
        fields: {
          kind: report.kind,
          message: withoutQueryStrings(report.message),
          stack: report.stack === null ? null : withoutQueryStrings(report.stack),
          route: report.route,
          release: report.release,
          component: report.component ?? null,
        },
      };
    default: {
      const unreachable: never = report;
      return unreachable;
    }
  }
}

/** A URL as logged: its query string and fragment removed. */
function logged(url: string | null | undefined): string | null {
  return url ? withoutQueryStrings(url) : null;
}

export const clientErrorRoutes = [
  definePostRoute({
    family: 'client-errors',
    authorize: 'public',
    path: '/api/v1/client-errors',
    params: { path: {}, query: {} },
    body: clientReportSchema,
    response: z.null(),
    raw: true,
    status: 204,
    async handle({ c, db, config }) {
      await admit(
        c,
        { config, db },
        { maxBytes: clientErrors.max_body_bytes, budgetName: 'client_error_report' },
      );
      const report = await readBody(c, clientReportSchema);
      const line = logLine(report);
      getLogger(clientErrors.logger)[line.level](line.event, {
        ...line.fields,
        ...(await reporter(c, config, db)),
      });
      return c.body(null, 204);
    },
  }),
  // The Reporting API delivers content security policy violations here,
  // without the session cookie, so no reporter is recorded.
  definePostRoute({
    family: 'client-errors',
    authorize: 'public',
    path: CSP_REPORTS_PATH,
    params: { path: {}, query: {} },
    body: cspReportBatchSchema,
    response: z.null(),
    raw: true,
    status: 204,
    async handle({ c, db, config }) {
      await admit(
        c,
        { config, db },
        { maxBytes: clientErrors.max_csp_body_bytes, budgetName: 'csp_report' },
      );
      const reports = await readBody(c, cspReportBatchSchema, 'application/reports+json');
      const logger = getLogger(clientErrors.logger);
      for (const report of reports) {
        if (!('body' in report)) continue;
        const { body } = report;
        logger.warning('client.csp_violation', {
          directive: body.effectiveDirective,
          disposition: body.disposition,
          document: logged(body.documentURL),
          blocked: logged(body.blockedURL),
          source: logged(body.sourceFile),
          line: body.lineNumber ?? null,
          column: body.columnNumber ?? null,
          sink: body.sample ?? null,
        });
      }
      return c.body(null, 204);
    },
  }),
];
