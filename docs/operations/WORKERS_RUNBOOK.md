# Workers migration operations

This is the operator procedure for the four-PR
[Workers migration plan](../plans/CiteLadder_Workers_Migration_Implementation_Plan.md).
PR 1 prepares a second, authenticated GCP ingress. It does not change apex
traffic, attach a Worker Custom Domain, or activate app-host sessions.

## Baseline and release record

Before deploying, record the actual main SHA, prior frontend and backend image
digests, VM name, static IP, DNS records, Cloudflare Worker routes/Custom
Domains, cache/WAF rules, TLS certificate version and Caddy configuration.
Record current `DOMAIN_NAME`, `FRONTEND_URL`, `FRONTEND_ORIGINS`,
`MCP_PUBLIC_BASE_URL`, provider redirect overrides, enabled integrations and
payment providers, webhook destinations, current build commands, and smoke
results. Record unknown or inaccessible values explicitly. Never copy a secret
payload or customer token into the release record.

For each release, capture the source SHA, immutable image/Worker digests,
non-secret public-origin configuration fingerprint, backend revision, secret
version references, Worker version IDs, attached domains, deployment state,
test commands/results, outstanding external gates, rollback references and
operator approval. GitHub protected release/PR records own this evidence; do
not make a second progress document.

The repository baseline at PR 1 start (`07cb74fb`) uses Caddy on the apex,
Astro marketing on loopback port 3000, Vite app on 3001, FastAPI on 8000 and
PostgreSQL on 5432. The GCP workflow builds immutable backend, marketing and
app images and deploys over IAP. This is source evidence, not proof of the
currently deployed revision, DNS or enabled provider state.

## Configuration matrix

| Variable | PR 1 pre-cutover | After approved cutover |
|---|---|---|
| `DOMAIN_NAME` | `citeladder.com` | `citeladder.com` |
| `ORIGIN_DOMAIN_NAME` | `origin.citeladder.com` | same |
| `APP_DOMAIN_NAME` | `app.citeladder.com` | same |
| `FRONTEND_URL` | `https://citeladder.com` | `https://app.citeladder.com` |
| `FRONTEND_ORIGINS` | `https://citeladder.com` | explicit verified browser origins during transition, then app only |
| `MCP_PUBLIC_BASE_URL` | `https://citeladder.com` | same |
| `PUBLIC_WEBSITE_ORIGIN` | `https://citeladder.com` | same |
| `PUBLIC_APP_ORIGIN` | `https://citeladder.com` | `https://app.citeladder.com` |

`PUBLIC_*` values are baked into frontend images. Changing either requires a
new artifact, including on a repeated source SHA. The GCP workflow keys image
tags by source SHA and a public-input fingerprint and prints that fingerprint
in its protected summary. `FRONTEND_URL` is the browser
origin for OAuth, invitations and application returns. The MCP protocol origin
is separate and must be explicit in production. Never point browser config at
`origin.citeladder.com` or expose the ingress credential to a client bundle.

Current browser APIs, sign-in (`GET /api/v1/auth/oauth/google/callback`) and
integration callbacks (`GET /api/v1/integrations/oauth/{gsc,ga4,bing}/callback`)
are **APP-OWNED** after cutover; they remain on the apex for PR 1. Authenticated
product API methods remain on the app same-origin `/api/v1`. MCP discovery,
registration, authorization, token, revoke and `/mcp` are **APEX-OWNED**
protocol endpoints; only `GET/POST /mcp/oauth/consent` is browser owned by
the configured app origin. Enabled-provider signed
`POST /api/v1/billing/webhooks/{provider}` is **APEX-OWNED** and preserves raw
bodies and status codes. Health, ready, internal worker and database endpoints
are **INTERNAL ONLY**. No **TEMPORARY LEGACY** browser endpoint is approved by
source inspection alone; each exception needs a verified caller, exact path and
method, owner, focused test and removal condition in the release record.

## Provision protected origin

1. In Cloudflare DNS, check for an existing `origin.citeladder.com` record and
   overlapping Worker route. Point a proxied A record to the existing GCP
   static IP. Do not attach a Worker Custom Domain or Worker Route to this
   hostname, including via wildcard capture. Keep the Cloudflare-only GCP
   firewall, IAP and loopback backend/database bindings.
2. In Cloudflare Origin CA, issue a certificate covering both
   `citeladder.com` and `origin.citeladder.com`. Put the PEM pair into the
   existing `gcp-demo` GitHub environment secrets `CLOUDFLARE_ORIGIN_CERT` and
   `CLOUDFLARE_ORIGIN_KEY`. Set SSL/TLS to Full (strict). The deploy workflow
   verifies hostname coverage and key matching before touching the VM.
3. Generate a dedicated random value of at least 32 characters outside chat.
   Store it in the protected `gcp-demo` GitHub environment secret
   `CITELADDER_ORIGIN_TOKEN`; the workflow versions it into GCP Secret Manager
   as `citeladder-worker-origin-token`. Later store the same value in each
   Worker's server-only environment secret. Never use JWT, provider or customer
   credentials for this purpose. The VM writes it only to a restricted
   `ingress.env` loaded by Caddy; backend and frontend containers do not
   receive it.
4. Set the non-secret `ORIGIN_DOMAIN_NAME` and `APP_DOMAIN_NAME` GitHub
   environment variables; set the origin matrix above explicitly. Confirm the
   `gcp-demo` environment remains main-only with its owner reviewer. Future
   Worker deploy environments need least-privilege Cloudflare credentials and
   protected approval, but PR 1 does not attach those domains.
5. Run the existing protected GCP deploy only with release authorization.
   Check the apex frontend, login, callback, MCP discovery and existing grant.
   Check unauthenticated `https://origin.citeladder.com/health` returns 403.
   An authenticated test from a controlled Worker/isolated setup must reach
   backend health, preserve redirect status and separate cookies, and reject
   spoofed public-host and forwarding headers. Do not put the ingress token in
   a shell command history, URL or CI log.

For rotation, set `CITELADDER_ORIGIN_TOKEN_PREVIOUS` to the currently active
value and change `CITELADDER_ORIGIN_TOKEN` to a new value in the protected
environment. Deploy ingress accepting both, update both Workers to the new
secret, verify through each deployed path, then clear the previous value and
redeploy ingress. Record version references and test results, never values.

## Recovery and handoff

The GCP deploy retains `.previous` copies of the last running release's
`runtime.env`, Compose file, Caddy files, optional `ingress.env`, and optional
origin certificate and key on the host. Keep these through post-deploy smoke
and ingress checks. If the new backend/ingress fails after the deploy script
exits, restore those copies (remove files with no previous copy), run
`docker compose --env-file runtime.env -f compose.gcp.yml up -d --force-recreate`
from `/opt/citeladder`, then recheck apex login, callback and MCP. Do not
restore a database backup for this frontend change. A Worker version rollback
alone does not restore DNS, provider registrations, GCP secrets or backend
configuration.

PR 2 may assume only that the code and configuration contracts exist after PR 1
merges. It must inspect the protected release record to learn whether origin
DNS, certificate, secret and compatible backend were actually deployed and
tested. No repository commit alone establishes that operational gate.

## Product Worker preparation (PR 2)

The product Worker is configured by `frontend/apps/app/wrangler.jsonc`. Its
production Custom Domain is `app.citeladder.com`; the isolated staging target
is `staging-app.citeladder.com`. Neither is an apex Worker Route. Both disable
`workers.dev` and public preview URLs. A protected Cloudflare Access policy must
cover staging before it is reachable by testers; keep its robots response
`Disallow: /` and its HTML `noindex`. Disable dashboard Git deployment for
these Workers so the protected GitHub workflow is the only deployment writer.

The checked-in staging upstream is `https://staging-origin.citeladder.com`.
Provision it with its own backend, database, ingress credential, certificate and
exact Caddy public-host allowlist before staging deployment. Configure that
backend's `FRONTEND_URL` and browser `FRONTEND_ORIGINS` for
`https://staging-app.citeladder.com`, and register the exact staging Google and
integration OAuth callback URLs if those flows are tested. Do not point staging
at production data or reuse the production ingress token. The staging website
origin `https://staging.citeladder.com` is a build input; do not publish links
to it until that host is provisioned. Verify the actual DNS and Cloudflare
account/zone availability before attaching either Custom Domain.

For local Worker verification after `pnpm --dir frontend install --frozen-lockfile`:

```powershell
$env:PUBLIC_WEBSITE_ORIGIN='https://citeladder.com'
$env:PUBLIC_APP_ORIGIN='https://app.citeladder.com'
pnpm --dir frontend build:app
pnpm --dir frontend types:app-worker
pnpm --dir frontend dev:app-worker -- --local-protocol https --ip 127.0.0.1 --port 8787
```

Provide a disposable, 32-character `ORIGIN_TOKEN` through
`frontend/apps/app/.dev.vars` (ignored by Git) for proxy-path testing; never
use a production credential.
Map `app.citeladder.com:8787` to `127.0.0.1` in a local HTTPS client and use
the actual hostname in the request. A local `/api` or consent request returns
502 until an isolated protected backend is available. Check `/health`, `/`,
`/pricing`, an existing `/app-assets/` file, missing JS/image, unsupported
`POST /projects`, webhook rejection and reserved OAuth/MCP rejection with
ordinary fetch and `Sec-Fetch-Mode: navigate`. Also check HEAD and response
headers; HTML is `no-store`, app responses are `noindex`, and hashed assets are
immutable.

`Product Worker delivery` (`.github/workflows/workers-app-deploy.yml`) is a
manual, per-target workflow. Its build job uses no Cloudflare credentials and
uploads the product asset artifact with a public-configuration fingerprint.
The deploy job requires the protected `workers-app-staging` or
`workers-app-production` GitHub environment. Put the least-privilege
`CLOUDFLARE_API_TOKEN` in that environment's secrets and the non-secret
`CLOUDFLARE_ACCOUNT_ID` in its variables. Store the matching dedicated
`ORIGIN_TOKEN` as a Cloudflare Worker secret for each named Worker before
deployment. Set the repository variable `LOGO_DEV_PUBLISHABLE` to the same
non-secret publishable key used by the GCP app build; the workflow refuses to
bake an empty key. Set protected environment reviewers and main-only deployment
rules. Record the resulting Worker version/deployment ID, artifact digest,
fingerprint, compatible backend revision and secret version reference in the
protected release record. The workflow summary does not claim backend or
account acceptance.

Before a staging release, verify the PR 1 ingress provisioning and compatible
backend are actually deployed. Then deploy staging through the protected
workflow and test real login, workspace isolation, callbacks, consent and
pricing confirmation against staging data. Observe forwarded client identity
through Worker, Cloudflare and Caddy. Do not enable a payment provider merely
to test this migration. Production app deployment can prepare the Custom
Domain, but production sign-in is not accepted until PR 3 changes the backend
browser origin and callbacks and runs its coordinated cutover checks.

To roll back only the product Worker, select the last known-good Worker version
in Cloudflare Workers & Pages and deploy that version to the same Custom
Domain. Confirm its `/health`, navigation and asset response, then record the
version transition. Keep the prior immutable artifact and fingerprint in the
GitHub release record. This does not roll back DNS, OAuth registrations,
backend browser origins, ingress secrets or the old apex frontend; use the
coordinated PR 3 procedure for those. PR 2 leaves the apex deployment untouched.
