# Public API

## Responsibility

The public REST API lets a paid workspace read its CiteLadder reports and
perform scoped product writes from its own code at
`https://api.citeladder.com/v1`. It owns API keys, key authentication, the
public route surface and its OpenAPI document; it is not a second product
model. Every public write runs through the same command as the browser, and
every public read calls the same owner read. Public setup and the generated
reference live at `https://docs.citeladder.com/api/`.

## Commands and the Actor

[`auth/actor.ts`](../frontend/services/api/src/auth/actor.ts) describes who
performs a write: a signed-in member, or an API key acting for the member who
created it. `role` is always the live membership role read for the request.
`requireCapability(actor, capability, scope)` refuses (403
`workspace_role_forbidden`) unless the role permits the capability and, for a
key, the key holds the scope; a command with no public scope is closed to keys.

The commands in [`commands/`](../frontend/services/api/src/commands/) cover the
publicly exposed writes: prompts, topics, generation and candidate review,
competitors, audits, schedules and actions. Each authorizes its Actor and calls
the owner; request rules that used to live in routes (the import budget and
byte cap, the generation and declaration Idempotency-Key bounds, the audit
create/run sequence) moved into them. Browser routes build the Actor from the
session with `actorOf(c)`; session, CSRF and workspace middleware are unchanged.
The other browser writes stay on the middleware path.

## API keys

Owners and Admins (`manage_credentials`) manage keys in Settings → API keys
through `/api/v1/api-keys` ([routes](../frontend/services/api/src/routes/api-keys.ts),
[service](../frontend/services/api/src/api-keys/keys.ts)). A key belongs to
one workspace and may be restricted to chosen projects. The secret is
`cl_live_` + an 8-character public prefix + 32 random bytes in base62, shown
once on creation. Only its HMAC-SHA256 under `API_KEY_PEPPER` is stored; a
request is matched by prefix and compared in constant time.

Scopes are `read` (always granted), `prompts:write`, `competitors:write`,
`audits:run`, `schedules:write` and `actions:write`. A scope never widens the
creator's role: a key's effective permission is its scopes intersected with
the creator's current role, so a demotion narrows it at once. Removing the
creator from the workspace (by an admin, leaving, or account deletion) revokes
their keys in that transaction with `revoke_reason = creator_removed`.

Creation needs the plan's `api_access` flag (403 `api_access_not_in_plan`)
and stays within the `api_keys` allowance of live (unrevoked, unexpired) keys
(409 `api_key_limit_reached`), checked under the account capacity lock. Every
paid plan grants `api_access` and ten keys; the public trial grants neither
([Billing and entitlements](billing-entitlements.md)). Security events record
`api_key.create`, `api_key.revoke`, and at most one `api_key.rejected_revoked`
or `api_key.rejected_expired` per key per hour. `last_used_at` is stamped at
most every five minutes.

## Requests

Public routes are declared with the browser routes
([`routes/define.ts`](../frontend/services/api/src/routes/define.ts)):
`exposure: 'both'` serves a browser handler below
`/api/v1/projects/{project_id}` also at the same path below `/v1`, or at its
declared `publicPath` below `/v1/projects/{project_id}`; `exposure: 'public'`
declares a public-only operation
([`public-api/routes.ts`](../frontend/services/api/src/public-api/routes.ts)).
Public contracts carry the `public-api` route family.

[Authentication](../frontend/services/api/src/public-api/auth.ts) reads only
`Authorization: Bearer cl_live_…`; cookies and `X-Workspace-Id` are ignored and
no CORS is offered. In order, a request needs a live key (401
`invalid_api_key`), its per-key 600/min and per-workspace 1,200/min windows
(429 with `Retry-After`), its creator's membership, workspace access and the
`api_access` grant (403), the operation's capability and scope (403), and then
the path project inside the workspace and the key's allowlist (404). Prompt,
prompt set, topic, audit, action and crawl IDs in the path must belong to that
project ([ownership](../frontend/services/api/src/public-api/ownership.ts)),
so a key restricted to one project never reaches another project's rows.

Every non-read POST (creates, spends and cancels) needs an `Idempotency-Key` (at most 255
characters; [idempotency](../frontend/services/api/src/public-api/idempotency.ts)).
The first request claims the key before it runs; a repeat with the same method,
path and body replays the stored response with `Idempotent-Replayed: true`; a
different body, or a repeat while the first is running, is 409
`idempotency_conflict`. A refused attempt (a 4xx) releases its claim; a server
failure keeps it, since its write may have committed, so a retry gets a
retryable 409 rather than a second write. Records are kept
24 hours and purged by the runner. Errors use the
[error contract](api-error-contract.md). Lists that can grow page with
`cursor` and `limit` (at most 100) and return `{items, next_cursor}`.

## Operations

Reads: projects, the business map, topics, prompt sets, prompts with their
latest measurement (`measured` with mention and citation rates that may be
`null`, `not_measured`, or `unavailable` for brand diagnostics), generation runs and candidates, competitors and
suggestions, audits (paged), an audit, an estimate, schedules, visibility
overview, trends, prompts, sources, fanout, perception and ads, actions,
Site Health's latest snapshot, crawl pages and issues, AI Traffic overview,
pages and crawl-log coverage, Performance totals and dimension tables, and
Search Intelligence runs and dataset rows.

Writes: topics and prompts (create 1–50 atomically, edit, status and enabled,
delete, import), prompt generation and candidate review (`prompts:write`);
competitor add, edit, remove and suggestion accept (`competitors:write`);
audit launch and cancel (`audits:run`); schedules (`schedules:write`); action
status and implementation declaration (`actions:write`).

An audit launch creates and queues the audit in one call. The caller sends
`max_estimated_credits`; when the estimate's `maximum_attempt_count` (the most
audit credits the run can reserve) is higher, nothing is created and the
response is 409 `estimate_exceeds_limit` with both numbers. The runner
executes the queued audit.

Changes within v1 are additive. Machine-readable state fields keep unknown,
unavailable and not-measured values distinct, as everywhere in the product.

## OpenAPI document

`GET /v1/openapi.json` (anonymous) serves the document
[generated](../frontend/services/api/src/public-api/openapi.ts) from the public
route contracts, grouped by resource. `pnpm --filter @citeladder/api
public-api:reference` writes the docs site's copy
(`frontend/apps/docs/src/data/public-api.json`); its `--check` runs in the
repository quality script and fails when the two differ.

## API host

The `api.citeladder.com` Worker
([`apps/api-host/worker.ts`](../frontend/apps/api-host/worker.ts)) forwards
`GET`, `POST`, `PATCH` and `DELETE` on `/v1/...` to Cloud Run with the origin
token and without cookies, beside the unchanged crawl-log sender routes; the
API serves `/v1` paths only for that host
([Workers runbook](operations/WORKERS_RUNBOOK.md#api-host-apiciteladdercom)).
