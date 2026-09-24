# Workers migration operations

This is the operator procedure for the four-PR
[Workers migration plan](../plans/CiteLadder_Workers_Migration_Implementation_Plan.md).
PRs 1–3 prepared protected ingress and two Workers. PR 4 removes the superseded
production frontend serving layer before the owner authorizes a fresh release.
There is no staging environment or staging Worker target. Repository availability
does not establish DNS, provider registration, deployment or production acceptance.

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

`PUBLIC_*` values are baked into Worker artifacts. Changing either requires a
new Worker build and deployment, including on a repeated source SHA. The GCP
workflow publishes only the backend image. `FRONTEND_URL` is the browser
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
   firewall, IAP and loopback backend/database bindings. Bypass Cloudflare
   caching for this entire hostname, including extensionless paths and static
   assets, and purge any previously cached origin responses. Broad path or file
   extension cache rules must not override this bypass.
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
   `gcp-demo` environment remains main-only with its owner reviewer. The two
   production Worker environments use least-privilege Cloudflare credentials
   and protected approval.
5. Run the protected GCP deploy only with release authorization and the
   coordinated order below. Check unauthenticated
   `https://origin.citeladder.com/health` returns 403 with `Cache-Control:
   private, no-store` and no Cloudflare cache hit.
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

An ordinary GCP deploy retains `.previous` copies of the last running release's
`runtime.env`, Compose file, Caddy file, optional legacy route file,
`ingress.env`, and origin certificate/key on the host. Keep these and the
recorded old image digests through first-release acceptance. The exact
first-release recovery commands appear below. An explicit database reset removes
those copies after the new backend passes its checks; the old VM frontend and
database cannot be restored through this procedure. A Worker version rollback alone does not restore
DNS, provider registrations, GCP secrets or backend configuration.

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

After the separately authorized release, verify compatible backend
ingress and observe forwarded client identity through Worker, Cloudflare and
Caddy. Test login, workspace isolation, callbacks, consent and pricing with
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
ID and matching backend/secret revisions in the protected release record.

The old frontend images and files remain captured in the prior release record
and VM `.previous` copies until the first fresh release is accepted. Normal
GCP delivery has no frontend image inputs or services.

For local Worker verification, run `pnpm --dir frontend dev:marketing-worker`.
Use only a disposable local token; never use the production token. Map
`citeladder.com:8788` to `127.0.0.1` in a local HTTP client. Without an isolated
protected upstream, pricing explicitly reports catalog unavailability and
protocol proxy paths return 502. Check initial HTML for home, pricing,
commercial, docs, article and legal pages, plus canonical and sitemap URLs.
Check real 404s for old product/API/asset paths, GET consent redirect, safe
legacy consent POST, exact webhook proxy and MCP discovery. Local Compose uses
a fixed disposable HTTP exception only through its `web:8000`
service; production config cannot select it.

### Fresh release after PR 4

The owner deferred deployment until after PR 4 and intends a fresh release.
The GCP workflow now deploys only backend and protected ingress. The manual
setup checklist below is the release prerequisite. Deleting stale
data requires separate explicit authorization and an identified target.

### Manual setup checklist for the first production release

The owner reports required infrastructure setup complete. Verify each existing
setting in the named console and record its result in the protected release
record. Local `.env` values do not populate GitHub Actions or Cloudflare
Worker secrets. Do not paste secret values into a PR, issue or chat.

1. **GitHub → Settings → Environments:** verify `gcp-demo`,
   `workers-app-production` and `workers-marketing-production`. Restrict each
   deployment to `main` and require the release reviewer. In each Worker
   environment, set secret `CLOUDFLARE_API_TOKEN` and variable
   `CLOUDFLARE_ACCOUNT_ID`. The token needs permissions to publish Workers and
   attach the two Custom Domains in the correct Cloudflare account/zone. Set
   repository variable `LOGO_DEV_PUBLISHABLE` for the product build. In each
   Worker environment also set secret `FONTS_REPO_TOKEN`: a fine-grained
   token with read-only Contents access to `Cube-27/cube27-fonts` only. The
   deploy job pulls the licensed fonts into the downloaded output, so they
   never enter the public build artifact. Check
   names/presence without exposing values. Disable dashboard Git deployment.
2. **Cloudflare → DNS / Workers & Pages:** verify `citeladder.com` and
   `app.citeladder.com` can be attached as Custom Domains to their named Workers.
   Remove conflicting records/routes only during the approved cutover. Keep
   `origin.citeladder.com` as a proxied DNS record to the GCP static IP with no
   Worker association. Keep MX, SPF, DKIM and DMARC untouched. Confirm Full
   (strict) TLS and the certificate's hostname coverage. Turn off public
   `workers.dev` and version preview URLs, as checked-in configuration requires.
3. **Cloudflare → Worker secrets:** put `ORIGIN_TOKEN` on `citeladder-app` and
   `citeladder-marketing`, matching the dedicated ingress token in GCP Secret
   Manager. In `gcp-demo`, set `CITELADDER_ORIGIN_TOKEN`, certificate/key
   secrets, `ORIGIN_DOMAIN_NAME=origin.citeladder.com` and
   `APP_DOMAIN_NAME=app.citeladder.com` as the final backend workflow requires.
   Verify Caddy rejects unauthenticated direct origin requests. Rotate the
   token using the overlap procedure above; never use local `.env` as delivery.
4. **Google / enabled integrations:** register the exact app-host OAuth
   callbacks and approved browser origin in the existing Google client:
   `https://app.citeladder.com/api/v1/auth/oauth/google/callback`, plus
   `/api/v1/integrations/oauth/gsc/callback` and
   `/api/v1/integrations/oauth/ga4/callback` on that host when enabled. Register
   Bing's app callback only if enabled. Check payment return origins if enabled;
   keep signed billing webhooks on `https://citeladder.com` and MCP identity on
   the apex. Record provider-console acceptance; no provider is enabled just
   for this migration.
5. **GCP / release:** verify the retained backend VM, static IP, Cloudflare-only
   firewall, IAP, PostgreSQL, backups and Secret Manager access. `gcp-demo`
   deploys backend/ingress only with
   `FRONTEND_URL=FRONTEND_ORIGINS=https://app.citeladder.com` and
   `MCP_PUBLIC_BASE_URL=https://citeladder.com`. Record the exact disposable
   data target before requesting any stale-data deletion. No database reset is
   implied by this checklist.
6. **Release approval:** after PR 4 is merged and CI is green, record immutable
   Worker/backend artifacts, DNS and config baseline, secret version references,
   callback registrations, rollback target and failure thresholds. Approve the
   protected backend/app/marketing dispatches separately. Check the architecture
   acceptance matrix on the deployed production topology with safe accounts.

### Release order after PR 4

The following is the required order after protected release approval. This
procedure itself does not authorize dispatch or DNS changes.

1. Record operator, main SHA, exact backend/Worker artifacts, existing DNS and
   Custom Domain associations, certificate and secret version references,
   callbacks, rollback target and failure thresholds. Confirm the manual setup
   checklist and the protected approvals.
2. For the authorized fresh database release, run `./reset-gcp-db.ps1` from
   synced local `main`; otherwise dispatch `gh workflow run gcp-demo-deploy.yml
   --ref main`. Approve `gcp-demo`,
   and wait for its successful backend digest and origin 403 summary. Verify
   app browser-origin and MCP apex configuration. This release removes the old
   VM frontend containers. An ordinary deploy retains their captured artifacts
   and `.previous` files for first-release recovery; an explicit reset discards
   that recovery path.
3. Dispatch `gh workflow run workers-app-deploy.yml --ref main`, deploy the
   product Worker through **Product Worker delivery**, and approve
   `workers-app-production`. Attach `app.citeladder.com`; verify `/health`,
   assets, login, same-origin API, consent and enabled callbacks with safe test
   accounts. Observe client identity through Worker, Cloudflare and Caddy.
4. Check conflicting apex DNS, Worker Routes and wildcard routes; preserve
   `origin.citeladder.com` and email records. Deploy **Marketing Worker
   delivery** with `gh workflow run workers-marketing-deploy.yml --ref main`,
   approve `workers-marketing-production` and attach
   `citeladder.com`. Verify initial HTML, direct app links, public pricing,
   genuine 404s, sitemap, canonicals and apex MCP/webhook ownership.
5. Run [the architecture acceptance matrix](../plans/CiteLadder_Workers_Migration_Architecture.md#12-acceptance-matrix-evidence-required-before-completion)
   on the deployed topology. Record unavailable external checks as unexecuted.
   Fix actual failures before accepting the release.

For a later isolated Worker regression, redeploy its last accepted version and
repeat affected checks. Do not rebuild the retired frontend, restore a database
to undo frontend deployment, bypass protected ingress or add a broad product
redirect bridge.

### First-release recovery before acceptance

Use this only when the database was not explicitly reset and against the VM and
DNS/domain baseline captured in step 1. If a
single Worker regresses after acceptance, restore that Worker's last accepted
version in Cloudflare instead. Before first-release acceptance, detach the new
apex Custom Domain or restore its captured association and DNS in Cloudflare;
keep the origin record and email records untouched. Restore the previous
provider callback registration/override combination and direct links. App-host
sessions do not transfer to the apex; restart affected browser transactions.

Connect through IAP with `gcloud compute ssh <VM_NAME> --project <PROJECT_ID>
--zone <ZONE> --tunnel-through-iap`. On the VM, restore the captured files:

```bash
sudo bash <<'BASH'
set -euo pipefail
cd /opt/citeladder
for file in runtime.env compose.gcp.yml Caddyfile; do
  test -f "$file.previous"
  cp -p "$file.previous" "$file"
done
for file in frontend-routes.caddy ingress.env tls/origin.crt tls/origin.key; do
  if test -f "$file.previous"; then cp -p "$file.previous" "$file"; else rm -f "$file"; fi
done
docker compose --env-file runtime.env -f compose.gcp.yml up -d --force-recreate --remove-orphans
docker compose --env-file runtime.env -f compose.gcp.yml ps
BASH
```

Recheck old apex navigation, app/API health, login, callbacks and stable MCP
identity against the restored route/configuration. Record the DNS/domain and
provider actions, image digests, previous-file identifiers and probe results.
This recovery uses the prior immutable frontend images still retained in
Artifact Registry; it neither restores the database nor bypasses origin TLS.
After acceptance, archive those references under release retention and use
accepted Worker versions for ordinary frontend recovery.

The apex `GET /mcp/oauth/consent` redirect and safe `POST` rejection remain for
transactions started on the previous origin. The release operator owns their
removal review by 1 October 2026. Remove them only after the first release is
accepted, prior transactions have expired or been restarted, and a real MCP
client confirms the app consent path. The stable apex MCP protocol endpoints
and signed webhook URL remain long-lived contracts.
