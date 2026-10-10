# F4b — Move MCP and its OAuth endpoints to `api.citeladder.com`

Competitive tracker row F4, PR 2 of 3. **Requires [F2a](F2a-ai-traffic-api-host-and-aws.md)**
(API host) and should follow [F4a](F4a-public-api-and-keys.md) (shared
Worker allowlist). Next: [F4c](F4c-mcp-write-tools.md).
Owner documents: [MCP](../mcp.md), [Workers runbook](../operations/WORKERS_RUNBOOK.md).

Complete for implementation; decisions settled. Follow `CLAUDE.md`, the test
skill and the TypeScript skill. Verified at 8a0647035.

## Settled decisions

| ID | Decision |
|---|---|
| D4.1 | MCP endpoint `https://api.citeladder.com/mcp`; issuer `https://api.citeladder.com`. |
| D4.6 | **Hard cut.** Apex `/mcp`, OAuth protocol paths and the apex consent redirect are deleted in this PR. No dual issuer, no 410 shim, no legacy window config. Apex returns its normal 404. |
| Greenfield | No grant purge or reconnect flow; the baseline reset clears data. |
| Consent | Stays on the app host (`/mcp/oauth/consent`). |
| Owner-only steps | DNS (done in F2a), ChatGPT app domain re-verification for the API host, updating any personal client configs. Listed in the runbook; not done by the implementer. |

## Current state (verified)

- Config: `src/mcp/config.ts` `loadMcpConfig` reads `MCP_PUBLIC_BASE_URL`
  (default `FRONTEND_URL`) as `origin`; `browserOrigin` = `FRONTEND_URL`;
  `src/config/mcp.ts` `public_base_url`. Resource `${origin}/mcp`, checked at
  `src/mcp/oauth.ts:64,329,400`. Host check `src/mcp/server.ts:85-101`;
  WWW-Authenticate `server.ts:139`.
- Discovery and protocol routes `src/mcp/oauth-routes.ts:156-379`:
  `/.well-known/oauth-authorization-server`,
  `/.well-known/oauth-protected-resource/mcp`, `/mcp/register`,
  `/authorize`, `/token`, `/revoke`, consent `/mcp/oauth/consent`.
- `src/http/origin-token.ts` `publicHosts()` (F2a adds the API host).
- Apex Worker `frontend/apps/marketing/src/apex-route.ts`: `PROTOCOL_PATHS`,
  `/mcp`, `/mcp/*` proxied; consent GET → 302 to app host, POST → 409. Tests
  `apex-route.test.ts:22-54`.
- App Worker reserves `/mcp`, `/authorize`, `/token`, `/revoke`,
  `/.well-known` (`frontend/apps/app/worker.ts:35-44,104`; tests
  `worker.test.ts:67,124`, `server-proxy.test.ts:20-34`).
- Apex MCP references (complete list):
  - Code/config: `frontend/lib/config/mcp-clients.ts:7`, `apex-route.ts`
    (+test), `apps/app/worker.ts` (+tests), `src/mcp/{config,server,oauth,oauth-routes}.ts`,
    `src/http/origin-token.ts`, `src/config/mcp.ts`, `infra/gcp/locals.tf:72`,
    `.env.example:24`, `.github/workflows/gcp-deploy.yml:334` (smoke).
  - Tests: `services/api/test/{app,mcp-config,mcp-oauth,mcp-transport}.test.ts`,
    `components/mcp/connect-strip.test.tsx:27`,
    `components/marketing/pages/platform.test.tsx`.
  - Copy: `lib/marketing-content/platform-pages-improve.ts:311,347`,
    `lib/marketing-content/llms.ts:57-64`,
    `apps/docs/src/content/mcp.md:10`, `mcp/connect.md:11,54,71,80`,
    `plugins/citeladder/mcp.json`, `plugins/citeladder/README.md:4`,
    `docs/mcp.md:10-11`.
  - Ops docs: `WORKERS_RUNBOOK.md` (~:67, 75, 82-86, 289, 318, 329-333),
    `GCP_RUNBOOK.md:33`, `docs/DEVELOPMENT.md:114-116,164`.

## Design

1. **Config:** `MCP_PUBLIC_BASE_URL` = `PUBLIC_API_URL`
   (`https://api.citeladder.com`); remove the FRONTEND_URL default so a
   misconfigured deployment fails loudly at startup. Local dev: the API host
   is the API origin itself (`http://localhost:<api port>`); update the dev
   proxy notes in `DEVELOPMENT.md`.
2. **API host Worker** (`api-host-route.ts`): add `/mcp`, `/mcp/*`,
   `/authorize`, `/token`, `/revoke`,
   `/.well-known/oauth-authorization-server`,
   `/.well-known/oauth-protected-resource/mcp` to the allowlist (all
   methods those routes accept, incl. `OPTIONS` for CORS preflight if the
   current apex handles it — copy its behaviour).
3. **Apex Worker:** delete `PROTOCOL_PATHS`, `/mcp*` forwarding and the
   consent redirect; delete their tests; apex now 404s them. Remove the
   apex rows from WORKERS_RUNBOOK APEX-OWNED.
4. **App Worker:** keep refusing these paths on the app host except the
   consent page; keep tests.
5. **Server:** issuer, resource, discovery docs and WWW-Authenticate all
   derive from the single origin; consent links still point at
   `browserOrigin`. Consent form-action and redirect checks read the
   transaction, unchanged.
6. **Frontend and copy:** `mcp-clients.ts` (Connect strip, Claude
   add-connector link) uses `PUBLIC_API_ORIGIN + '/mcp'`; settings MCP
   connections copy; plugin `mcp.json` and `README.md`; docs site MCP pages;
   marketing `platform-pages-improve.ts` and `llms.ts` (endpoint and
   protected-resource URLs). Prefer the shared origin helper over string
   literals so this never needs a sweep again.
7. **CI smoke:** `gcp-deploy.yml:334` checks MCP metadata with
   `Host`/public-host `api.citeladder.com`.
8. **Runbook:** API-OWNED section lists MCP + OAuth paths; owner steps:
   re-verify the ChatGPT app domain for `api.citeladder.com`, reconnect
   personal clients.

## Commit slices

1. Config + server/oauth origin changes + origin-token + API tests.
2. Worker routing: API host allowlist, apex deletions, app worker tests.
3. Frontend config, connect strip, plugin, docs site, marketing, internal
   docs, runbook, CI smoke.

## Affected surfaces checklist

- **Backend:** `src/mcp/{config,server,oauth,oauth-routes}.ts`,
  `src/config/mcp.ts`, `src/http/origin-token.ts`.
- **Workers/infra:** `apps/marketing/src/{api-host-route,apex-route}.ts`
  (+tests), `apps/app/worker.ts` (+tests), `infra/gcp/locals.tf`,
  `.env.example`, `gcp-deploy.yml`.
- **App UI:** `lib/config/mcp-clients.ts`, `components/mcp/connect-strip.tsx`
  (+test), `components/settings/mcp-connections.tsx` copy.
- **Plugin:** `plugins/citeladder/{mcp.json,README.md,plugin.json}` (any URL).
- **Marketing:** `platform-pages-improve.ts:311,347`, `llms.ts:57-64`,
  `platform.test.tsx`.
- **Docs site:** `mcp.md`, `mcp/connect.md`, `mcp/access.md`,
  `mcp/examples.md` URLs; `changelog.md` ("MCP moved to
  api.citeladder.com/mcp; reconnect your client").
- **Internal docs:** `docs/mcp.md`, `docs/architecture.md:112`,
  `docs/backend-architecture.md:136-139`, `docs/DEVELOPMENT.md`,
  `WORKERS_RUNBOOK.md`, `GCP_RUNBOOK.md`, `docs/release-checklist.md` (MCP
  discovery on the API host; apex 404), tracker status + log.

## Tests

Discovery documents carry the API-host issuer/resource; token for the
resource validates; a token whose resource differs is refused; refresh keeps
the resource; apex `/mcp` and `/.well-known/oauth-authorization-server` 404
(marketing Worker test); API host forwards each protocol path; app host still
serves consent.

## Validation

Focused MCP + Worker tests while iterating; `./scripts/check.ps1` once at the
end (shared runtime, auth). Afterwards `git grep -n "citeladder.com/mcp"`
must show only `api.citeladder.com/mcp`.

## Done when

The grep above is clean, the Connect strip shows the new URL, the runbook
lists owner steps, tracker row F4 shows F4b merged.
