# Workers migration operations

Self-serve authentication requires the coordinated release gate in the
[GCP runbook](GCP_RUNBOOK.md#self-serve-authentication-release-gate). Keep
`SELF_SERVE_SIGNUP` off until backend verification/trial acceptance; enable both
product and marketing builds together with API creation. Google sign-in for
existing accounts is independent of that signup switch. Verification/reset
navigation uses no-store and no-referrer protections and carries mailbox tokens
in fragments. Resend credentials are API secrets and must never enter either
public bundle. Closing signup on rollback retains existing login/recovery.

This is the operator procedure for the four-PR Workers migration.
PRs 1–3 prepared protected ingress and two Workers. PR 4 removes the superseded
production frontend serving layer before the owner authorizes a fresh release.
There is no staging environment or staging Worker target. Repository availability
does not establish DNS, provider registration, deployment or production acceptance.

## Baseline and release record

### Documentation subdomain

`frontend/apps/docs/wrangler.jsonc` owns the static `citeladder-docs` Worker
and the `docs.citeladder.com` Custom Domain. It has no API, origin token,
provider credentials or backend bindings. Its static asset configuration
serves clean directory URLs and a real 404 page; `public/_headers` supplies
security and caching headers.

The manual `workers-docs-deploy.yml` workflow builds an immutable artifact
from main and deploys it through the `workers-docs-production` environment.
Configure that environment's Cloudflare account/token and the existing
`FONTS_REPO_TOKEN` secret before delivery. Licensed fonts are added to the
downloaded artifact immediately before deployment, not committed or uploaded.

Deploy and verify the docs Worker before releasing app/marketing links to it.
Check the Custom Domain and TLS, a deep guide URL, search, the changelog,
`/sitemap.xml`, `/robots.txt`, and an unknown URL's 404 response. The old
apex `/docs/mcp` page is intentionally removed without a redirect. MCP
protocol/OAuth endpoints remain on the existing protocol origin.

Worker/DNS provisioning and live acceptance remain explicit release operations;
adding this configuration does not claim that the subdomain has been deployed.

### Application release record

Before deploying, record the actual main SHA, the Cloud Run API revision and
job image digests from the **GCP - Deploy** summary, DNS records, Cloudflare
Worker Custom Domains, cache/WAF rules, `DOMAIN_NAME`, `APP_DOMAIN_NAME`,
provider redirect registrations, enabled integrations and payment providers,
webhook destinations and smoke results. Record unknown or inaccessible values
explicitly. Never copy a secret payload or customer token into the release
record.

For each release, capture the source SHA, immutable image/Worker digests,
non-secret public-origin configuration fingerprint, backend revision, secret
version references, Worker version IDs, attached domains, deployment state,
test commands/results, outstanding external gates, rollback references and
operator approval. GitHub protected release/PR records own this evidence; do
not make a second progress document.

## Configuration matrix

| Variable | Production value |
|---|---|
| `DOMAIN_NAME` | `citeladder.com` |
| `APP_DOMAIN_NAME` | `app.citeladder.com` |
| `FRONTEND_URL` (derived) | `https://app.citeladder.com` |
| `MCP_PUBLIC_BASE_URL` (derived) | `https://citeladder.com` |
| `PUBLIC_API_URL` (derived, API) | `https://api.citeladder.com` |
| `PUBLIC_WEBSITE_ORIGIN` | `https://citeladder.com` |
| `PUBLIC_APP_ORIGIN` | `https://app.citeladder.com` |
| `PUBLIC_API_ORIGIN` (app build) | `https://api.citeladder.com` |
| API host Worker `PUBLIC_API_HOST` (committed) | `api.citeladder.com` |
| Workers `ORIGIN_UPSTREAM` (committed) | `https://citeladder-api-44437656491.us-central1.run.app` |

`PUBLIC_*` values are baked into Worker artifacts. Changing either requires a
new Worker build and deployment, including on a repeated source SHA. The GCP
workflow publishes only the backend. `FRONTEND_URL` is the browser origin for
OAuth, invitations and application returns. The MCP protocol origin is the
apex. Never point browser config at the Cloud Run URL or expose the origin
credential to a client bundle.

Current browser APIs, sign-in (`GET /api/v1/auth/oauth/google/callback`) and
integration callbacks (`GET /api/v1/integrations/oauth/{gsc,ga4,bing}/callback`)
are **APP-OWNED**. Authenticated
product API methods remain on the app same-origin `/api/v1`. MCP discovery,
registration, authorization, token, revoke and `/mcp` are **APEX-OWNED**
protocol endpoints; only `GET/POST /mcp/oauth/consent` is browser owned by
the configured app origin. Enabled-provider signed
`POST /api/v1/billing/webhooks/{provider}` is **APEX-OWNED** and preserves raw
bodies and status codes. Machine routes under `/v1/...` (crawl-log ingest
and the Firehose endpoint) are **API-OWNED** on `api.citeladder.com`; see
[API host](#api-host-apiciteladdercom). Health, ready, internal worker and database endpoints
are **INTERNAL ONLY**. No **TEMPORARY LEGACY** browser endpoint is approved by
source inspection alone; each exception needs a verified caller, exact path and
method, owner, focused test and removal condition in the release record.

## API host (api.citeladder.com)

`api.citeladder.com` is **API-OWNED**: machine senders (CDN log streams, the
public REST API's key holders, and later MCP) call it; browsers never do. It is its own small
Worker, **citeladder-api-host** (`frontend/apps/api-host/`), with no assets. The
marketing Worker keeps serving its static files without a Worker invocation, so
marketing traffic never spends the free plan's daily Worker requests; only machine
deliveries to this host do. It uses the same origin token as the other Workers.

- Allowlist (`apps/api-host/worker.ts`), forwarded unchanged with
  `X-CiteLadder-Origin-Token` and `X-CiteLadder-Public-Host: api.citeladder.com`:
  `POST /v1/crawl-logs/ingest/{uuid}` and `POST /v1/crawl-logs/firehose/{uuid}`
  (no other `/v1/crawl-logs/...` request), and `GET`, `POST`, `PATCH` or
  `DELETE` on any other `/v1/...` path for the [public API](../public-api.md),
  which authenticates by API key. Anything else is
  `404 {"error":{"code":"not_found"}}`. Cookies are neither read nor forwarded.
- Any other hostname (a `workers.dev` or preview URL) gets the same 404.
- The API admits the host from `PUBLIC_API_URL` and serves it `/v1/...` only.
  The apex and app hosts refuse `/v1/...` with 404.

Owner steps (DNS and Cloudflare; code cannot do these):

1. Deploy the API with `PUBLIC_API_URL=https://api.citeladder.com` (set by
   `infra/gcp/locals.tf`) before the Worker, so the origin accepts the host.
2. Set the Worker secret once:
   `pnpm exec wrangler secret put ORIGIN_TOKEN -c apps/api-host/wrangler.jsonc`
   from `frontend/`, with the same value as the other Workers. Then run
   **API host Worker delivery** (`.github/workflows/workers-api-host-deploy.yml`,
   which reuses the `workers-app-production` environment's Cloudflare
   credentials) or `pnpm deploy:api-host`. Wrangler attaches the
   `api.citeladder.com` Custom Domain from `apps/api-host/wrangler.jsonc`;
   Cloudflare creates the DNS record and certificate. If a DNS record named
   `api` already exists, remove it first.
3. Build and deploy the app Worker with `PUBLIC_API_ORIGIN=https://api.citeladder.com`
   so crawl-log setup shows the API host.
4. Run the release smoke below.

Release smoke: `node scripts/frontend-ingress-smoke.mjs https://citeladder.com
https://app.citeladder.com https://api.citeladder.com`. It checks that the
apex and app hosts refuse `/v1/*` and that the API host refuses `/`, `/pricing`
and `/api/v1/*` with the JSON 404. Then confirm one real sender's batch is
accepted (a receipt appears on the source row), and that a key from Settings →
API keys lists projects: `curl -H "Authorization: Bearer $KEY"
https://api.citeladder.com/v1/projects`.

## Contact email on the marketing Worker

Provision `RESEND_API_KEY` as a secret on **citeladder-marketing** only, using
`pnpm exec wrangler secret put RESEND_API_KEY -c apps/marketing/wrangler.jsonc`
from `frontend/` and the interactive prompt. Never put the key in build vars,
browser configuration or a committed `.env`. For local development, use an
ignored `frontend/apps/marketing/.dev.vars` only when intentionally testing
delivery; ordinary tests mock delivery and must not receive a live key.

`POST /api/v1/contact` is **APEX-OWNED** by the marketing Worker, with no origin
API proxy or database persistence. Resend sends from
`CiteLadder Website <notifications@citeladder.com>` to `contact@citeladder.com`
and sets Reply-To to the visitor. The verified CiteLadder sending domain must
permit this sender. Missing configuration or failed delivery returns a generic
`send_failed` response. No enquiry content or provider error is logged.
Identical enquiries use a stable Resend idempotency key for its 24-hour retry
window; a changed message creates a new send. Provider calls have a bounded
timeout. The committed marketing Worker rate-limit bindings allow 2 valid
enquiries per client IP and 10 enquiries per minute at each Cloudflare location.
Only `CF-Connecting-IP` supplies the identity; absent identity or bindings and
limiter failures block delivery. Throttling returns 429 and retains the form
for a later retry. These edge limits mitigate bursts and are eventually
consistent, not a strict global daily quota.

Every enquiry also carries a Cloudflare Turnstile token. The widget (site key
`0x4AAAAAAFS7i6wNJ4sAbY-8`, baked in by the marketing delivery workflow) must
list `citeladder.com` as a domain. Provision its secret as
`TURNSTILE_SECRET_KEY` on **citeladder-marketing** with
`pnpm exec wrangler secret put TURNSTILE_SECRET_KEY -c apps/marketing/wrangler.jsonc`
and the interactive prompt; never in build vars, browser configuration, GitHub
variables or any `PUBLIC_`-prefixed name. `TURNSTILE_HOSTNAMES` (a committed
Worker variable) lists the hostnames a token may be solved on. The server
rejects a missing, replayed, wrong-action or wrong-hostname token with 403
`verification_failed`, and answers 503 while the secret is missing.

After an authorized deployment, open `/contact` on desktop and mobile, submit
a controlled message with a mailbox you own, verify it arrives at
`contact@citeladder.com`, check the CiteLadder sender and Reply-To, and test
Reply in Titan. Check required-field errors, retry behavior, the email fallback,
that the Turnstile widget renders and a second send needs a fresh check, and
demo/contact CTAs. Confirm the browser assets and responses carry no
credential. Configure no Titan incoming-mail or DNS changes for this feature.

## Protected origin (Cloud Run)

The Workers call the Cloud Run API directly; there is no origin hostname,
Origin CA certificate or reverse proxy. The API rejects every request,
including `/health`, `/ready` and MCP, unless it carries the origin token and an
allowlisted public host (`citeladder.com`, `app.citeladder.com` or
`api.citeladder.com`). The API host reaches only `/v1/...` routes and `/v1/...`
routes answer only for the API host; every other combination is a 404. The
Workers set `X-CiteLadder-Origin-Token`, `X-CiteLadder-Public-Host` and
`X-CiteLadder-Client-IP` (from `CF-Connecting-IP`), and strip any
client-supplied copies.

1. Generate a dedicated random value of at least 32 characters outside chat.
   Store it in the protected `gcp-demo` GitHub environment secret
   `CITELADDER_ORIGIN_TOKEN`. The deploy versions it into Secret Manager as
   `citeladder-worker-origin-token`, and only the Cloud Run API receives it.
   Store the same value as the `ORIGIN_TOKEN` Worker secret on `citeladder-app`,
   `citeladder-marketing` and `citeladder-api-host`. Never reuse JWT, provider or customer
   credentials for this purpose.
2. `ORIGIN_UPSTREAM` is committed in each `wrangler.jsonc`. The project number
   makes it deterministic, and the deploy summary prints the same URL.
3. **GCP - Deploy** smokes the origin. Authenticated `/ready`, the provider
   catalog and MCP metadata must return `200`. Anonymous and foreign-host
   requests must return `403`. Do not put the token in shell history, a URL or
   a CI log.

For rotation, set `CITELADDER_ORIGIN_TOKEN_PREVIOUS` to the currently active
value and change `CITELADDER_ORIGIN_TOKEN` to a new value in the protected
environment. Deploy the API so it accepts both, update every Worker to the new
secret, and verify through each deployed path. Then clear the previous value
and redeploy. Record version references and test results, never values.

## Recovery

Roll back the API by routing traffic to a previous Cloud Run revision (see the
[GCP runbook](GCP_RUNBOOK.md#4-updates-and-rollback)). A Worker version rollback
alone does not restore DNS, provider registrations, GCP secrets or backend
configuration.

## Product Worker preparation (PR 2)

The product Worker is configured by `frontend/apps/app/wrangler.jsonc` for the
`app.citeladder.com` Custom Domain. It disables `workers.dev` and public preview
URLs. Disable dashboard Git deployment so the protected GitHub workflow is the
only deployment writer. Verify account, zone and DNS ownership before attaching
the domain.

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
manual production workflow. Its build job uses no Cloudflare credentials and
uploads the product asset artifact with a public-configuration fingerprint.
The deploy job requires the protected `workers-app-production` GitHub
environment. Put the least-privilege
`CLOUDFLARE_API_TOKEN` in that environment's secrets and the non-secret
`CLOUDFLARE_ACCOUNT_ID` in its variables. Store the matching dedicated
`ORIGIN_TOKEN` as a Cloudflare Worker secret before
deployment. Set the repository variable `LOGO_DEV_PUBLISHABLE` to the same
non-secret publishable key used by the GCP app build; the workflow refuses to
bake an empty key. Set protected environment reviewers and main-only deployment
rules. Record the resulting Worker version/deployment ID, artifact digest,
fingerprint, compatible backend revision and secret version reference in the
protected release record. The workflow summary does not claim backend or
account acceptance.

After the separately authorized release, verify the compatible backend
origin. Confirm the per-visitor client identity reaches the API (sign-in rate
limits apply per visitor, not per Worker). Test login, workspace isolation, callbacks, consent and pricing with
safe production test accounts. Do not enable a payment provider merely to test
this migration.

To roll back only the product Worker, select the last known-good Worker version
in Cloudflare Workers & Pages and deploy that version to the same Custom
Domain. Confirm its `/health`, navigation and asset response, then record the
version transition. Keep the prior immutable artifact and fingerprint in the
GitHub release record. This does not roll back DNS, OAuth registrations,
backend browser origins, ingress secrets or the prior apex routing; use the
coordinated PR 3 procedure for those. PR 2 leaves the apex deployment untouched.

## Marketing Worker and cutover preparation (PR 3)

The marketing Worker uses `frontend/apps/marketing/wrangler.jsonc` and the
generated `dist/server/wrangler.json` from its Astro build. Its Custom Domain
is `citeladder.com`, with no Worker Route. Disable dashboard Git deployment.
The build requires explicit `PUBLIC_WEBSITE_ORIGIN` and `PUBLIC_APP_ORIGIN`.
The protected **Marketing Worker delivery** workflow bakes production origins
and uploads an immutable artifact. The marketing Worker secret `ORIGIN_TOKEN`
matches the protected origin token. The public catalog read sends no visitor
cookies upstream. Record artifact digest, public-config fingerprint, deployment
ID and matching API/secret revisions in the protected release record.

For local Worker verification, run `pnpm --dir frontend dev:marketing-worker`.
Use only a disposable local token; never use the production token. Map
`citeladder.com:8788` to `127.0.0.1` in a local HTTP client. Without an isolated
protected upstream, pricing explicitly reports catalog unavailability and
protocol proxy paths return 502. Check initial HTML for home, pricing,
commercial, docs, article and legal pages, plus canonical and sitemap URLs.
Check real 404s for old product/API/asset paths, GET consent redirect, safe
legacy consent POST, exact webhook proxy and MCP discovery. Local Compose uses
a fixed disposable HTTP exception only through its `api-service:8100`
service; production config cannot select it.

### Manual setup checklist for a production release

Verify each setting in the named console and record its result in the
protected release record. Local `.env` values do not populate GitHub Actions or
Cloudflare Worker secrets. Do not paste secret values into a PR, issue or chat.

1. **GitHub → Settings → Environments:** verify `gcp-demo`,
   `workers-app-production` and `workers-marketing-production`. Restrict each
   deployment to `main` and require the release reviewer. In each Worker
   environment, set secret `CLOUDFLARE_API_TOKEN` and variable
   `CLOUDFLARE_ACCOUNT_ID`. The token needs permissions to publish Workers and
   attach the Custom Domains in the correct Cloudflare account/zone. Set
   repository variable `LOGO_DEV_PUBLISHABLE` for the product build. In each
   Worker environment also set secret `FONTS_REPO_TOKEN`: a fine-grained
   token with read-only Contents access to `Cube-27/cube27-fonts` only. The
   deploy job pulls the licensed fonts into the downloaded output, so they
   never enter the public build artifact. Disable dashboard Git deployment.
   The `gcp-demo` values are listed in the
   [GCP runbook](GCP_RUNBOOK.md#13-github-gcp-demo-environment-variables).
2. **Cloudflare → DNS / Workers & Pages:** verify `citeladder.com` and
   `app.citeladder.com` can be attached as Custom Domains to their named
   Workers. Keep MX, SPF, DKIM and DMARC untouched. Turn off public
   `workers.dev` and version preview URLs, as checked-in configuration
   requires. Delete the retired `origin.citeladder.com` record and revoke its
   Origin CA certificate once the Cloud Run cutover is accepted.
3. **Cloudflare → Worker secrets:** put `ORIGIN_TOKEN` on `citeladder-app` and
   `citeladder-marketing`, matching `CITELADDER_ORIGIN_TOKEN`. Rotate it using
   the overlap procedure above; never use local `.env` as delivery.
4. **Google / enabled integrations:** register the exact app-host OAuth
   callbacks in the existing Google client:
   `https://app.citeladder.com/api/v1/auth/oauth/google/callback`, plus
   `/api/v1/integrations/oauth/gsc/callback` and
   `/api/v1/integrations/oauth/ga4/callback` on that host when enabled. Register
   Bing's app callback only if enabled. Check payment return origins if enabled;
   keep signed billing webhooks on `https://citeladder.com` and MCP identity on
   the apex. Record provider-console acceptance; no provider is enabled just
   for a release.
5. **Release approval:** after CI is green, record immutable Worker/backend
   artifacts, DNS and config baseline, secret version references, callback
   registrations, rollback target and failure thresholds. Approve the
   protected GCP, app and marketing dispatches separately.

### Release order

The following is the required order after protected release approval. This
procedure itself does not authorize dispatch or DNS changes.

1. Record operator, main SHA, exact API/Worker artifacts, existing DNS and
   Custom Domain associations, secret version references, callbacks, rollback
   target and failure thresholds. Confirm the manual setup checklist and the
   protected approvals.
2. Dispatch `gh workflow run gcp-deploy.yml --ref main` (add
   `-f reset_database=true -f confirm_project=<PROJECT_ID>` only for an
   authorized database reset), approve `gcp-demo`, and wait for its successful
   origin smoke and tick.
3. Deploy **Product Worker delivery** (`gh workflow run workers-app-deploy.yml
   --ref main`) and approve `workers-app-production`. Verify `/health`, assets,
   login, same-origin API, consent and enabled callbacks with safe test
   accounts.
4. Check conflicting apex DNS, Worker Routes and wildcard routes; preserve
   email records. Deploy **Marketing Worker delivery**
   (`gh workflow run workers-marketing-deploy.yml --ref main`), approve
   `workers-marketing-production` and verify initial HTML, direct app links,
   public pricing, genuine 404s, sitemap, canonicals and apex MCP/webhook
   ownership.
5. Run the [release acceptance checks](../release-checklist.md)
   on the deployed topology. Record unavailable external checks as unexecuted.
   Fix actual failures before accepting the release.

For a later isolated Worker regression, redeploy its last accepted version and
repeat affected checks. Do not rebuild the retired frontend, restore a database
to undo frontend deployment, bypass protected ingress or add a broad product
redirect bridge.

The apex `GET /mcp/oauth/consent` redirect and safe `POST` rejection remain for
transactions started on the previous origin. The release operator owns their
removal review by 1 October 2026. Remove them only after the first release is
accepted, prior transactions have expired or been restarted, and a real MCP
client confirms the app consent path. The stable apex MCP protocol endpoints
and signed webhook URL remain long-lived contracts.
