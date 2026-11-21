import type { Context, Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { sessionUser } from '../auth/session.ts';
import { demoAccessExpired, policy, type ServiceConfig } from '../config.ts';
import type { AppEnv } from '../context.ts';
import type { Database } from '../db/database.ts';
import { record, strings } from '../db/json.ts';
import { scalarText } from '../text-order.ts';
import { ApiError } from '../errors.ts';
import { holdsWrite, mcpPolicy, type McpConfig } from './config.ts';
import { consentMessage, consentPage, consentReturn } from './consent-page.ts';
import {
  completeConsent,
  ConsentExpiredError,
  ConsentSelectionError,
  consentWorkspaces,
  consentCsrf,
  equalSecret,
  OAuthError,
  tokenHash,
} from './oauth.ts';

const restart = {
  title: 'This approval link has expired',
  message:
    'Approval links last a few minutes and work once. Go back to your assistant and connect CiteLadder again.',
};
const invalidTransaction = (value: string) => !value || value.length > 256;
function consentSelection(form: URLSearchParams) {
  return {
    selected: form.getAll('workspace_id'),
    acceptedTermsRevision:
      form.get('accept_terms') === 'yes' ? (form.get('terms_revision') ?? '') : null,
    allowChanges: form.get('allow_changes') === 'yes',
  };
}
export function registerConsentRoutes(
  app: Hono<AppEnv>,
  { config, db, mcp }: { config: ServiceConfig; db: Database; mcp: McpConfig },
) {
  app.use('/mcp/oauth/consent', async (c, next) => {
    if (demoAccessExpired(config)) return c.text('Demo access has expired.', 401);
    try {
      await sessionUser(config, db)(c, async () => {});
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
      const transaction =
        c.req.method === 'POST'
          ? (new URLSearchParams(await c.req.text()).get('transaction') ?? '')
          : (c.req.query('transaction') ?? '');
      const consent = `/mcp/oauth/consent?transaction=${encodeURIComponent(transaction)}`;
      return c.redirect(`${mcp.browserOrigin}/login?return_to=${encodeURIComponent(consent)}`, 302);
    }
    c.header('cache-control', 'no-store');
    await next();
  });
  async function renderConsent(c: Context<AppEnv>, transaction: string, error: string | null) {
    const row = await db
      .selectFrom('mcp_authorization_requests as r')
      .innerJoin('mcp_oauth_clients as cl', 'cl.client_id', 'r.client_id')
      .select(['r.redirect_uri', 'r.scopes', 'cl.client_metadata'])
      .where('r.transaction_hash', '=', tokenHash(config, transaction))
      .where('r.consumed_at', 'is', null)
      .where('r.expires_at', '>', new Date())
      .executeTakeFirst();
    if (!row) return c.html(consentMessage(restart), 403);
    const userId = c.get('user').id;
    const account = await db
      .selectFrom('users')
      .select('email')
      .where('id', '=', userId)
      .executeTakeFirstOrThrow();
    const redirect = new URL(row.redirect_uri);
    c.header('x-frame-options', 'DENY');
    c.header('content-security-policy', `${mcpPolicy.consent_csp}; form-action 'self'`);
    // hono/html escapes every interpolated value; client metadata is untrusted.
    return c.html(
      consentPage({
        clientName: scalarText(record(row.client_metadata).client_name) || 'MCP client',
        redirectHost: redirect.host,
        redirectUri: row.redirect_uri,
        email: account.email,
        transaction,
        csrf: consentCsrf(config, getCookie(c, config.session.cookieName) ?? '', transaction),
        workspaces: await consentWorkspaces(db, userId),
        error,
        termsRevision: policy.auth.terms_revision,
        appOrigin: mcp.browserOrigin,
        offerChanges: holdsWrite(strings(row.scopes)),
      }),
      error ? 400 : 200,
    );
  }
  function consentFailure(c: Context<AppEnv>, failed: { transaction: string; error: unknown }) {
    const { transaction, error } = failed;
    if (error instanceof ConsentSelectionError) return renderConsent(c, transaction, error.message);
    if (error instanceof OAuthError)
      return c.html(
        error instanceof ConsentExpiredError
          ? consentMessage(restart)
          : consentMessage({ title: 'Access cannot be approved', message: error.message }),
        403,
      );
    throw error;
  }
  app.get('/mcp/oauth/consent', async (c) => {
    const transaction = c.req.query('transaction') ?? '';
    if (invalidTransaction(transaction)) return c.html(consentMessage(restart), 400);
    return renderConsent(c, transaction, null);
  });
  app.post('/mcp/oauth/consent', async (c) => {
    const form = new URLSearchParams(await c.req.text());
    const transaction = form.get('transaction') ?? '';
    if (invalidTransaction(transaction)) return c.html(consentMessage(restart), 400);
    const back = {
      href: `${mcp.browserOrigin}/mcp/oauth/consent?transaction=${encodeURIComponent(transaction)}`,
      label: 'Back to the approval page',
    };
    if (
      !equalSecret(
        consentCsrf(config, getCookie(c, config.session.cookieName) ?? '', transaction),
        form.get('csrf_token') ?? '',
      )
    )
      return c.html(
        consentMessage({
          title: 'Your session changed',
          message: 'Open the approval page again to continue as the account you are signed in to.',
          action: back,
        }),
        403,
      );
    const decision = form.get('decision');
    if (decision !== 'approve' && decision !== 'deny')
      return c.html(
        consentMessage({
          title: 'Choose Approve or Deny',
          message: 'The connection needs an explicit decision.',
          action: back,
        }),
        403,
      );
    try {
      const destination = await completeConsent(
        db,
        config,
        mcp,
        transaction,
        { userId: c.get('user').id, sessionVersion: c.get('user').sessionVersion },
        decision === 'deny' ? null : consentSelection(form),
      );
      c.header('x-frame-options', 'DENY');
      c.header('content-security-policy', `${mcpPolicy.consent_csp}; form-action 'none'`);
      return c.html(consentReturn(destination));
    } catch (error) {
      return consentFailure(c, { transaction, error });
    }
  });
}
