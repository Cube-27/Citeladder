# F4a — Command layer, API keys and the public REST API

Competitive tracker row F4, PR 1 of 3. Next: [F4b](F4b-mcp-move-to-api-host.md),
then [F4c](F4c-mcp-write-tools.md). **Requires [F2a](F2a-ai-traffic-api-host-and-aws.md)
merged** (it provisions `api.citeladder.com`, the API-host Worker router and
the origin-token allowlist).
Owner documents: new `docs/public-api.md` (add to `docs/README.md` feature
owners), [Workspace access](../workspace-access.md),
[Invariants](../invariants.md) §10, [Decisions](../decisions.md).

Complete for implementation; decisions settled. Follow `CLAUDE.md`, the test
skill and the TypeScript skill. Verified at 8a0647035.

## Settled decisions

| ID | Decision |
|---|---|
| D4.1 | Public API at `https://api.citeladder.com/v1`. |
| D4.2 | Invariant 10 amended: a write through an API key holding the matching scope, created by an Owner/Admin, is an explicit user decision. Record in `docs/decisions.md`. |
| D4.3 | `api_access` flag on every paid plan, not the public trial. Limit 10 keys per workspace. 600 requests/min per key, 1,200/min per workspace. |
| Scope of refactor | Command layer only for the **publicly exposed writes** (~25 routes). The other ~90 browser writes stay on the middleware path. |
| Key binding | One workspace per key (optional project allowlist). Effective permission = key scopes ∩ creator's **current** role. |
| Competitors | No "mention rule" exists; drop it. Add thin owner commands add/edit/remove over `competitors` (name, aliases, domains) and reuse suggestion accept. |
| Audit launch | Public launch = create + run in one call with `max_estimated_credits`; 409 `estimate_exceeds_limit` when the estimate is higher. |
| Greenfield | No legacy keys, no versioning shims. |

## Current state (verified)

- Routes are declarative: `src/routes/define.ts` (`defineRoute`,
  `definePost/Patch/Put/DeleteRoute`; spec has `family, path, capability,
  authorize, body, headers, response, handle`). Authorisation in the
  middleware (~:150-190): `sessionUser` → `activeWorkspace`/`projectMember`/
  `workspaceMember` (`src/auth/workspace.ts`) → `WorkspaceContext.require` →
  403 `workspace_role_forbidden`; `requireWorkspaceAccess`
  (`src/entitlements/access.ts`); `sameSiteWrite` CSRF guard; body via
  `readBody` (`src/http/body.ts`).
- Owner functions already take `(db, workspaceId, id, input)` without an
  actor: `src/prompts/{prompts,topics,candidates,generation}.ts`,
  `src/audits/{creation,estimate,interactive}.ts`, `src/audits/schedules.ts`,
  `src/opportunities/*`. Several need a user id (`updateActionStatus`,
  `declareAction`, business-map updates).
- Logic still in routes that must move into commands:
  `routes/prompts.ts:68-90` (Idempotency-Key read/length),
  `:177-190` (import rate limit + byte cap); `routes/actions.ts:77-110`
  (declaration Idempotency-Key, user id); `routes/audits.ts:72-90`
  (`createAudit` + `auditRuntime`), `:59-70` (`/run` →
  `executeInteractiveAudit`).
- Audit launch is two calls: `POST /audits` creates a draft under
  `audit-enqueue:{ws}` lock with `reserveAuditCapacity` + `admitAudit`
  (`audits/creation.ts:46-135`); `POST /audits/{id}/run` executes; estimate
  `audits/estimate.ts:23`.
- Roles `src/config/workspaces.json`: owner/admin read, run, write,
  manage_credentials, …; member read, run, write; viewer read.
- Limiter `src/abuse/usage.ts` `enforceSubjectRequest`; `SubjectKind` closed
  union (add `api_key`).
- Security events `src/auth/security-events.ts` (closed union; table has
  actor_id, workspace_id, target_id, event).
- `src/config/api.json` exists with unrelated content → put key policy in a
  new `src/config/public-api.json`.
- OpenAPI: `src/openapi/routes.ts` (`RouteContract`, `ROUTE_CONTRACTS`),
  `document.ts`; **not served and not drift-checked** today. Only drift
  precedent: `scripts/export-mcp-tool-reference.ts` (`mcp:reference --check`).
- `idempotency_records` is billing-scoped; a new `api_idempotency` table is
  needed.
- Competitor writes today: `PUT /projects/{id}/business-map` (whole doc),
  `POST …/competitor-suggestions/{id}/accept`; table `competitors`
  (baseline :1074: name, aliases, domains).
- Settings tabs `components/settings/settings-screen.tsx:57-63`;
  closest template `components/settings/mcp-connections.tsx`;
  `useWorkspaceCapability('manage_credentials')`.
- Member removal sites: `src/workspaces/service.ts` (~:260-275),
  `src/workspaces/account-manager.ts` (~:415).

## Design

### A. Actor and commands

- `src/auth/actor.ts`: `Actor = {kind:'member'|'api_key'|'mcp_grant',
  workspaceId, userId, role, scopes: Set<Scope> | 'all'}` and
  `requireCapability(actor, capability, scope?)` → throws the existing 403
  error shape. `role` is always the **live** role (loaded per request).
- `src/commands/<owner>.ts` per owner (prompts, topics, generation,
  competitors, audits, schedules, actions): `(db, actor, projectId, input,
  {idempotencyKey?}) → result`. Commands call `requireCapability` and the
  existing owner functions; no validation copies.
- The exposed browser routes call the same commands with an Actor built from
  the session `WorkspaceContext`. The CSRF and session middleware stay.
- Gate: a test asserts every route with `exposure` public/both calls a
  command (list of public operation ids ↔ command map).

### B. API keys

Schema (baseline edit):
```
api_keys         id, workspace_id, name ≤80, prefix varchar(16) UNIQUE ("cl_live_" + 4),
                 secret_hmac bytea, scopes text[], project_ids uuid[] NULL,
                 created_by_user_id, created_at, expires_at NULL,
                 last_used_at (update at most every 5 min), revoked_at, revoke_reason
api_idempotency  id, workspace_id, api_key_id, idempotency_key ≤255, request_hash,
                 status_code, response_body jsonb, created_at
                 UNIQUE (api_key_id, idempotency_key)
```
- Secret `cl_live_` + 32 random bytes base62, shown once. HMAC-SHA256 with
  new secret `API_KEY_PEPPER` (`src/config.ts`, `.env.example`, Terraform
  secret wiring like other secrets). Lookup by prefix, constant-time compare.
- Scopes: `read`, `prompts:write`, `competitors:write`, `audits:run`,
  `schedules:write`, `actions:write`. Mapping to role capability: `read`→read,
  `audits:run`→run, the rest→write.
- Creator removed from the workspace → their keys revoked in the same
  transaction (`creator_removed`) at both removal sites. Demotion narrows
  effective scopes immediately (role read live).
- Entitlement: flag `api_access` + limit `api_keys` = 10 in
  `entitlements.json` (bump registry revision; add to every plan bundle in
  `billing/catalog-authoring.ts`, not the trial). Key creation refused
  `api_access_not_in_plan` / `api_key_limit_reached`; requests with a key
  whose workspace lost the flag → 403 `api_access_not_in_plan`.
- Security events: `api_key.create`, `api_key.revoke`,
  `api_key.rejected_revoked`, `api_key.rejected_expired` (actor = creator,
  target = key id). Throttle the rejected events to one per key per hour.
- Purge `api_idempotency` rows older than 24 h from the runner tick (bounded
  batch).
- Browser management routes (`src/routes/api-keys.ts`, new family
  `api-keys`, capability `manage_credentials`): list, create (returns secret
  once), revoke. Contracts `packages/contracts/src/api-keys.ts`.

### C. Public API

- `src/public-api/` Hono sub-app mounted for host `api.citeladder.com`,
  paths `/v1/...`. Auth only `Authorization: Bearer cl_live_…`; cookies
  ignored; no credentialed CORS. Extend the F2a Worker allowlist to
  `GET|POST|PATCH|DELETE /v1/*` (crawl-log paths unchanged).
- Route declaration: add `exposure: 'browser' | 'public' | 'both'` to the
  route spec and `RouteContract`. Public operations are declared with
  `/v1/projects/{project_id}/…` templates reusing the browser zod schemas
  and the same commands/read functions. One family per operation; new
  family `public-api` in `route-ownership.ts` for the public templates.
- Conventions: cursor pagination (`cursor`, `limit` ≤100) using owner
  keysets; errors per `docs/api-error-contract.md`; `Idempotency-Key`
  required on every POST that creates or spends (same key + different body
  hash → 409 `idempotency_conflict`; same body → stored response replayed);
  IDs returned; `state` fields for unknown/unavailable preserved; additive
  changes only within v1.
- Rate limits via `enforceSubjectRequest` (`api_key` 600/min, `workspace`
  1,200/min from `public-api.json`) → 429 + `Retry-After`.
- OpenAPI: `GET /v1/openapi.json` generated from public/both contracts.
  `scripts/export-public-api-reference.ts` writes
  `frontend/apps/docs/src/data/public-api.json`; `--check` wired into
  `scripts/quality.mjs` beside `mcp:reference`.

**Endpoints v1**

| Area | Read (`read`) | Write (scope) |
|---|---|---|
| Projects | list, get, business context | — |
| Topics | list | create, rename, delete (`prompts:write`) |
| Prompts | list (topic, status, latest mention/citation rate) | create 1–50, edit text/topic, set status/enabled, delete, import rows (`prompts:write`) |
| Generation | runs, candidates | start run, review accept/reject (`prompts:write`) |
| Competitors | list | add, edit (name, aliases, domains), remove, accept suggestion (`competitors:write`) |
| Audits | list, get, status, estimate | launch (create+run, `max_estimated_credits`), cancel (`audits:run`) |
| Schedules | list | create, update (incl. pause/resume), delete (`schedules:write`) |
| Visibility | overview, trends, results, sources, fanout | — |
| Actions | list, get | status change, implementation declaration (`actions:write`) |
| Site Health | latest snapshot, pages, issues | — |
| AI Traffic | overview, pages, crawl-log coverage | — |
| Performance | GSC/GA4 totals and dimensions | — |
| Search Intelligence | datasets, rows | — |

F3 perception and F5 ads reads are added to this table by whichever PR lands
second (if F3/F5 merged first, include them here; otherwise they add their
`exposure: 'both'`).

### D. UI — Settings → API keys

New tab `api-keys` in `SETTINGS_TABS` (visible to Owner/Admin; entitlement
gated with an upgrade note for trial). List: name, prefix, scopes, projects,
created by, last used, expires, revoke. Create dialog: name, scope
checkboxes (read always on), projects (all or chosen), optional expiry;
secret shown once with copy button and "You won't see this again". No
internal IDs shown besides the prefix.

## Commit slices

1. Actor + `requireCapability` + session Actor builder (refactor, tests).
2. Commands for the exposed writes incl. competitor add/edit/remove and
   audit launch; browser routes call them.
3. Schema + config + entitlement + security events + key service + removal
   hooks + idempotency purge.
4. Browser key routes + contracts + Settings tab.
5. Public sub-app: auth, rate limits, idempotency, `exposure`, public
   templates, OpenAPI endpoint + reference + drift check; Worker allowlist.
6. Docs, invariant 10, decisions, marketing lines.

## Affected surfaces checklist

- **Backend:** `auth/actor.ts`, `commands/*`, `api-keys/*`, `public-api/*`,
  `routes/{define.ts,api-keys.ts,prompts.ts,actions.ts,audits.ts,audit-schedules.ts}`,
  `openapi/{routes,document}.ts`, `abuse/usage.ts`, `auth/security-events.ts`,
  `workspaces/{service,account-manager}.ts`, `config/{public-api.json,entitlements.json}`,
  `billing/catalog-authoring.ts`, `config.ts`, `app.ts`, tick purge.
- **Schema:** `api_keys`, `api_idempotency` in `0001_baseline.sql`; regenerate db-schema.
- **Contracts:** `api-keys.ts`, error codes (`estimate_exceeds_limit`,
  `idempotency_conflict`, `api_access_not_in_plan`, `api_key_limit_reached`,
  `invalid_api_key`), `route-ownership.ts` families `api-keys`, `public-api`;
  `docs/api-error-contract.md`.
- **Workers/infra:** `apps/marketing/src/api-host-route.ts` allowlist,
  runbook API-OWNED row update, `API_KEY_PEPPER` secret in Terraform and
  `docs/operations/GCP_RUNBOOK.md`.
- **App UI:** `components/settings/{settings-screen,api-keys}.tsx`,
  `lib/api/api-keys.ts`, query keys.
- **Marketing:** `lib/marketing-content/llms.ts` — add the REST API
  (`https://api.citeladder.com/v1`, OpenAPI URL) beside MCP;
  `lib/marketing-content/faq.ts:122` answer if it says API access is
  unavailable or browser-only — make it truthful; platform "Improve"/MCP page
  (`platform-pages-improve.ts`) gains one sentence that the same data and
  actions are available through a REST API on paid plans. If
  `pricing.ts` lists plan features, add "API access" to paid tiers; if
  pricing is not enabled, leave it.
- **Docs site:** new `apps/docs/src/content/api.md` (overview, keys,
  scopes, auth, pagination, errors, idempotency, rate limits, estimate
  guard) + `api/reference.md` rendering `public-api.json` (add the group in
  `apps/docs/src/lib/content.ts`); `changelog.md`.
- **Internal docs:** `docs/public-api.md` (new owner), `docs/README.md`
  row, `docs/workspace-access.md` (keys, scopes ∩ role, revocation),
  `docs/invariants.md` §10, `docs/decisions.md`, `docs/architecture.md`
  capability map, `docs/backend-architecture.md` (commands + Actor
  pattern), `docs/billing-entitlements.md`, `docs/release-checklist.md`
  (API host smoke with a key), tracker status + log.
- **MCP/Agent:** none in this PR (F4c uses the commands).

## Tests

Key HMAC + prefix lookup; scope ∩ role (member key with `audits:run` works,
viewer creator → read only); creator removal revokes in the same
transaction; demotion narrows; expired/revoked refused + event; idempotency
replay and conflict; estimate guard 409; rate limit 429; project allowlist;
entitlement refusal; OpenAPI drift check; every public write goes through a
command; browser routes behave unchanged (existing route tests stay green);
workspace isolation across keys (real PostgreSQL).

## Validation

Focused tests per slice; `./scripts/check.ps1` once at the end (contracts,
authorization, schema, shared runtime).

## Done when

A paid Owner creates a key, calls `GET /v1/projects` and launches an audit
with an estimate guard via the API host; `/v1/openapi.json` matches the
docs reference; tracker row F4 shows F4a merged.
