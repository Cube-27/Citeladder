# CiteLadder Workers migration: four sequential PRs

Prepared 23 September 2026. Planning baseline: `07cb74fb`.
Status: PR 1 implementation in review; no deployment or production acceptance claimed.

This is the delivery plan for
[Workers Migration Architecture](CiteLadder_Workers_Migration_Architecture.md).
That specification owns the target contracts; this document owns the four-PR
boundaries, fresh-chat entry points and handoffs. Read both for an assigned PR.
The supplied recommendation is incorporated as: prepare, deploy alongside the
existing site, cut over, verify immediately, then remove the superseded infrastructure.

**Owner clarification, 23 September 2026:** there are currently no customers;
complete the four PRs in sequence today. There is no seven-day observation window,
minimum elapsed-time gate or separate stabilization phase. Run focused automated
checks and immediate deployment smoke checks, fix failures, then proceed to PR 4
once PR 3 is merged and cutover works. Do not turn this into a customer migration
exercise or require artificial waiting. Account access and actual failures can
still block a dependent action; record those concretely.

**Clean origin cutover:** product routes move to `app.citeladder.com`; update
marketing links, OAuth configuration and application navigation directly. Do not
create apex-to-app product redirects, legacy route aliases or old-tab compatibility
infrastructure by default. An exception requires a verified external consumer,
exact endpoint/path, owner, focused test and removal condition. This instruction
supersedes the supplied review's proposal to retain a finite redirect map.
Existing MCP protocol identity and verified webhook contracts remain distinct
from product-page aliases.

## How to use this plan in a new chat

Say **“Implement Workers migration PR 1”**, then PR 2, PR 3 and PR 4 in separate
chats. “Implement PR X” also suffices when this plan is linked or named in the
request. Each PR starts from the main branch containing the previous merged PR;
these are sequential PRs, not stacked branches or four independent migrations.

The implementing agent must:

1. Read `AGENTS.md`, `docs/README.md`, the architecture specification, this
   plan's shared instructions and the requested PR section. Read only the
   affected canonical owners and invariants next.
2. Inspect the working tree and current main/history without discarding work.
   Identify the predecessor's actual PR and merge commit, inspect its final
   changes and handoff, and confirm they are present in the starting branch.
   A planned deliverable, checked box or chat claim is not merge evidence.
3. Reconcile the section's expected starting state against current code,
   configuration and accessible release records. Do not reimplement completed
   work or resume another indexed plan. Resolve ordinary implementation choices
   independently. Surface material deviations from the accepted architecture.
4. Implement the entire requested slice, focused tests, changed owner documents
   and runnable deployment/recovery procedures. Finish all independent work
   before handing off an unavailable account operation. Do not stop at a plan.
5. Record the actual result using the handoff contract below. Do not begin the
   next PR in the same change or call an unexecuted external gate successful.

“Implement” authorizes the repository slice, not production cutover, live
payments or infrastructure destruction. Follow existing contribution rules for
publishing/merging the PR. An explicit operational authorization persists; do not
ask for it again. Where an external action is not yet authorized, make the exact
release, changes, checks and rollback reviewable before asking for approval.

## Delivery and gate map

| PR | Deliverable | Starting prerequisite | Public traffic at merge |
|---|---|---|---|
| 1 | Origin contracts, compatible backend/MCP, protected ingress | Baseline reconciliation within PR 1 | Existing apex unchanged |
| 2 | Product Worker, app pricing continuation and independent delivery | PR 1 merged | Existing apex unchanged; app can be staged/prepared |
| 3 | Marketing Worker, public SSR pricing/handoff, cutover/recovery automation | PR 2 merged | Apex remains on captured old frontend until separately approved cutover |
| 4 | Remove superseded frontend infrastructure | PR 3 merged and immediate post-cutover checks pass | Workers already own frontend traffic |

There is no fifth coding PR for cutover. PR 3 must deliver all code, configuration
interfaces and procedures needed to execute cutover after its merge. Its release
record owns cutover and immediate verification evidence. PR 4 must not manufacture that
evidence or start deleting infrastructure merely because PR 3 merged.

PR 2/3 repository work can proceed after predecessor merge even when an
independent staging/account step remains pending. Carry the gate explicitly;
no dependent deployment or production acceptance can proceed without it.
If PR 4 is requested too early, inspect readiness and name the missing evidence,
but leave rollback infrastructure intact.

## Shared implementation and handoff contract

### Persistent context without progress sidecars

Use this plan for scope, canonical owner documents for shipped behavior,
Git/merged PRs for implementation evidence, and the protected PR/release system
for live state. Do not require the user to paste the previous conversation.
Do not create separate status, migration-summary or evidence files.

Every PR description/final handoff must contain this compact record:

| Field | Required content |
|---|---|
| Identity | Workers migration PR number, base/head commits, PR link when available; predecessor PR/merge reference |
| Delivered | Actual behavior and owner paths changed, removals and deviations from this plan |
| Verification | Exact commands, exit results, CI links; distinguish local, staging and production checks |
| Operational state | Not deployed / staged / production accepted / migration closed, separately from merged status |
| Release | Compatible backend revision, artifact digests, public-config fingerprint, Worker deployment/version IDs when deployed |
| Outstanding | Each unexecuted gate, reason, responsible operator and exact next action |
| Compatibility | Retained bridge/artifact, consumer, owner, expiration/removal condition and target date |
| Next PR | What it may assume, what remains and which gates it must verify first |

Use “not deployed” and “not executed” where appropriate, never placeholder success.
After merge, the next agent obtains the merge SHA from Git/PR metadata; do not
require a follow-up documentation PR just to insert a future SHA. Update the
existing `docs/plans/ACTIVE.md` entry only for actual queue/blocker/completion
changes. If release records are inaccessible, finish independent code work and
ask only for the missing operational evidence before the dependent action.

### Validation for each executable PR

- Follow `AGENTS.md` and `docs/DEVELOPMENT.md`: deterministic test environment,
  no inherited live credentials, focused owner tests, real PostgreSQL for
  persistence/authorization boundaries, and no overlapping checks.
- Run `./scripts/check.ps1` once after the intended executable diff is complete.
  Select native tests during iteration; do not run the full backend suite locally.
  Keep logs in the worktree Git directory and inspect failure tails first.
- Build every affected target. Baseline commands are
  `pnpm --dir frontend build` and `pnpm --dir frontend build:vite`; replace them
  with the explicit Worker build interfaces once introduced. Shared dependencies,
  assets, origins or transport changes require both targets. Confirm bundle gates.
- Verify behavior in the Worker runtime, not just Node mocks or a successful
  build. Add meaningful boundary coverage rather than source-string assertions.
- Inspect `git diff --check`, `git diff --stat`, `git diff --name-status`, then
  review the actual final diff with `Review.md`. Report omitted external checks.

### External work and user involvement

The agent owns code, scripts, configuration templates, tests, documentation and
exact operator instructions. Prefer existing authorized automation. The user
should only need to perform account-only actions and explicit release approvals.
For each manual action provide: console/service, exact setting and non-secret
value, prerequisite, expected result, verification and reversal. Never request
secret values in chat; give the destination secret name instead.

Some necessary steps are outside Cloudflare: GitHub environment/token setup,
GCP secret delivery/certificate configuration, OAuth callback registration and
real MCP-client acceptance. Do not silently omit them to promise a Cloudflare-only
handoff. Automate those supported by authorized tooling; otherwise batch the
remaining exact instructions. No payment provider is enabled by this migration.

## PR 1 — Prepare origins, backend compatibility and protected ingress

**Expected starting state:** the existing apex serves Astro, Vite and FastAPI
through GCP Caddy. Verify this; the repository is not evidence of live DNS.
No predecessor PR exists. Baseline reconciliation is part of this PR, not an
extra preparatory PR the user has to request.

### Read and inspect

Read `docs/workspace-access.md`, `docs/mcp.md`, the callback portions of
`docs/integrations-traffic-analytics.md`, and `docs/operations/GCP_RUNBOOK.md`.
Inspect backend config `mcp.py`/`oauth.py`, `browser_cookies.py`, MCP
`oauth_provider.py`/`server.py`, frontend origin/config consumers, and
`infra/gcp/runtime/{Caddyfile,frontend-routes.caddy,compose.gcp.yml,deploy-vm.sh}`.
Inspect callers, existing tests and secret delivery before changing these owners.

### Implement

1. Inventory actual current commit/release, public/GCP hostnames, routing,
   `FRONTEND_URL`, `FRONTEND_ORIGINS`, `MCP_PUBLIC_BASE_URL`, OAuth overrides,
   invitation/payment returns, webhooks, enabled providers, Worker/DNS/cache/WAF
   rules and build/deploy commands. Inventory SPA/Astro/backend routes and all
   origin consumers, including manifests, analytics and any service worker.
   Capture findings and unknowns in the PR/release record, never secret payloads.
   Classify each API/callback/webhook endpoint as APP-OWNED, APEX-OWNED,
   TEMPORARY LEGACY or INTERNAL ONLY, with methods and actual consumers. An
   existing route in source is not evidence of an external compatibility need.
   TEMPORARY LEGACY requires a verified consumer and explicit expiry/removal
   condition; otherwise omit it. Marketing SSR catalog access is server-to-server
   and does not itself require a browser-accessible apex catalog endpoint.
2. Add or extend one typed frontend public-origin owner. Explicit production
   `PUBLIC_WEBSITE_ORIGIN` and `PUBLIC_APP_ORIGIN` must validate as HTTPS origins;
   allow legitimate development origins through the existing environment owner.
   Preserve old apex behavior by explicit pre-cutover values, not silent defaults.
   Classify touched `NEXT_PUBLIC_SITE_URL` consumers before replacing them.
3. Preserve backend `FRONTEND_URL` as the browser origin. Require explicit
   `MCP_PUBLIC_BASE_URL` when MCP is enabled in production. Compose already pins
   MCP to `DOMAIN_NAME` but also forces `FRONTEND_URL`/`FRONTEND_ORIGINS` to that
   hostname: supply deliberate independent configuration while keeping the old
   production values until cutover. Update every deployment writer that could
   overwrite the new values.
4. Generate MCP consent/login destinations from the browser origin while keeping
   issuer/resource/discovery/token identity on the apex. Permit app host/origin
   only for exact browser consent; preserve CSRF, transaction binding, approval,
   denial, token rotation/revocation and membership checks. With pre-cutover
   configuration, existing apex consent still works. Implement safe legacy POST
   completion or explicit restart; never cross-host redirect submitted consent.
5. Add the protected origin ingress alongside the existing apex virtual host.
   Proposed hostname: `origin.citeladder.com`; verify availability. Use dedicated
   Worker-only authentication, overwrite caller-supplied internal headers, validate
   forwarded public host and preserve real browser Origin. Retain strict TLS,
   Cloudflare-restricted firewall, IAP and loopback backend/database ports. Define
   secret rotation and trusted client-IP handling; reject unauthorized origin use.
6. Establish one small server-only Worker transport helper with fixed validated
   upstream, manual redirects, separate cookies, byte/stream preservation, safe
   forwarding, no mutation retries, no private caching and bounded 502/504 errors.
   Keep credentials out of client graphs/logs. PR 2 supplies its first deployed
   Worker consumer; do not replace the legacy Node proxy prematurely.
7. Create `docs/operations/WORKERS_RUNBOOK.md` as the single operator procedure:
   environment matrix, ingress provisioning/rotation, release-record fields and
   baseline/rollback capture. Link it from `docs/README.md`. Update only affected
   existing configuration, access, MCP and GCP documentation.

### Verification and exit

Use existing MCP/OAuth config and component tests for old-apex and split-origin
cases, hostile host/origin/return paths, consent approval/denial and existing-grant
continuity. Exercise authenticated ingress and spoof rejection in an isolated
Caddy/backend setup, including multiple cookies, redirects and raw bodies.
Run relevant real-PostgreSQL authorization tests and both frontend builds.
After an authorized compatible backend/ingress deployment, verify the old apex
route/auth/MCP behavior and protected-origin rejection through the deployed chain.

**Merge result:** migration capability is present; public traffic, browser origin
and existing login links are unchanged. No database migration or key rotation.
**Next agent may assume:** contracts/helper/ingress code exist. It must verify
whether origin provisioning and compatible backend deployment actually happened.

**Manual packet:** verified origin DNS record, certificate coverage and Full
(strict) TLS; dedicated secret destinations in GCP and future Worker environments;
GitHub protected environments and least-privilege Cloudflare deployment token.
Both frontend hosts must use Worker Custom Domains, not Worker Routes.
`origin.citeladder.com` remains proxied DNS to GCP, with no Worker Custom Domain
or Worker Route, including wildcard capture. Record this in the runbook.

## PR 2 — Deliver the product Worker independently

**Expected starting state:** PR 1 is merged; the apex deployment is unchanged.
Reuse its public-origin owner, ingress contract and shared proxy. Do not redo MCP
or create a second transport/authentication owner.

### Read and inspect

Read `docs/frontend-architecture.md`, `docs/workspace-access.md`,
`docs/billing-entitlements.md` and the Workers runbook from PR 1. Inspect
`frontend/apps/app` router/bootstrap, `vite.config.ts`, `server-proxy.ts`,
`frontend/public`, package scripts, bundle checks and CI. Inspect existing pricing
purchase components, `pending-pricing-intent.ts`, billing return configuration and
auth navigation before extracting the shared purchase/selection contracts.

### Implement

1. Add the thin product Worker, checked-in app Wrangler configuration, generated
   environment types and explicit build/deploy interfaces. Keep Vite-plus, React
   Router, query/session/workspace owners, browser targets, `/app-assets/`, vendor
   chunks, build manifest and budgets. No new frontend framework or app shell.
   Configure `app.citeladder.com` as a Worker Custom Domain, not a Worker Route.
2. Reject PR 1's APEX-OWNED/internal-only endpoints on the app host before the
   general API proxy; do not create a second webhook host accidentally. Then
   enforce routing in the architecture's order: `/api` and `/api/*`, exact GET/POST
   `/mcp/oauth/consent`, explicit rejection of other MCP/OAuth discovery/protocol
   paths, `/health`, assets, missing-resource errors, then GET/HEAD HTML navigation
   fallback. Unsupported methods never receive a SPA success response. `/` enters
   the existing product bootstrap. App `/pricing` is implemented in this PR.
3. Set `assets.run_worker_first` explicitly to cover `/api`, `/api/*`, `/mcp`,
   `/mcp/*` (including exact consent), `/authorize`, `/token`, `/revoke`, the
   reserved discovery paths and `/health`. Use additional patterns or `true` if
   needed to satisfy missing-resource/method checks. Verify both navigation and
   fetch behavior; assets must not shadow these paths. Native SPA handling is
   acceptable only if missing JS/CSS/images and unsupported methods cannot receive
   HTML success, including with navigation headers. Otherwise use a small guarded
   entry fallback; do not add a large custom router or recursive asset fallback.
4. Separate per-host output policy from shared logos/fonts. Apply app noindex,
   host-correct robots/manifest and no-store HTML. Preserve effective security
   headers/CSP; generate dynamic-response headers as well as asset headers.
   Exclude secrets, source/server bundles and private files from static output.
5. Add independent protected GitHub Actions delivery with immutable artifacts,
   config fingerprint, per-target concurrency and explicit environment/config
   selection. Pin Wrangler and compatibility date. Production credentials stay
   out of untrusted PR jobs; dashboard Git deployment must not compete with CI.
   Shared-file changes select the affected targets. Preserve GCP deployment.
6. Introduce app `/pricing` using existing billing/capture/resume owners. Define
   one typed public selection contract for PR 3 links: bounded purchase kind,
   catalog key, quantity and credential-mode/BYOK choice. Validate URL input and
   capture app-local pending intent before login. Resolve actual workspace,
   permissions, current catalog and quote after login, then require deliberate
   confirmation. No price, tax, personal data or credentials in URLs; no automatic
   charge on GET/login/reload. Preserve uncertain-attempt idempotency and separate
   MCP return paths. Keep current apex pricing functional until cutover by reusing
   existing purchase logic; do not advertise the new route yet. Update billing
   and access owners for this implemented continuation contract.
7. Keep deployment artifacts needed for ordinary rollback. Do not build a generic
   release-asset archive or retain old apex chunks for hypothetical consumers.
8. Document tested local Worker commands, isolated staging and product rollback.
   Staging uses its own backend/data/secrets and exact callback/host allowlists.
   Protect previews, prevent indexing and disable unnecessary public preview URLs.

### Verification and exit

Exercise real Worker asset routing for fetch and `Sec-Fetch-Mode: navigate`, API
errors, protocol rejection, consent, missing assets, HEAD/non-GET and SPA refresh.
Test transport cookies, redirects, auth headers, upload/download bytes, streaming
and cancellation. Confirm host policy and private-response isolation. Verify
staging login/callback/consent with the matching staging backend browser origin.
Test selection through login/confirmation, malformed/tampered selection, stale
catalog, unavailable quote and uncertain retry without live charges. Assert that
APEX-OWNED webhooks are rejected here; raw webhook signature tests belong to PR 3
unless PR 1 verifies an app-owned webhook contract. Build both frontend targets
when extracting shared pricing logic, preserving current apex behavior.

**Merge result:** independently deployable product Worker; old apex still serves
existing users. A production app hostname can be prepared after authorized
provisioning, but do not advertise it or claim production login works while the
backend still generates apex callbacks. Production activation belongs to PR 3.
**Next agent may assume:** app delivery/proxy/CI and `/pricing` continuation with
its validated selection contract are implemented. Marketing runtime, SSR public
pricing/link integration and coordinated cutover remain unfinished.

**Manual packet:** available staging/app domains, preview protection, Worker
secrets, account capacity/CPU limits and alerts, protected workflow approval.
Keep public apex routing and links unchanged. Validate actual forwarded client
identity through Worker/Cloudflare/Caddy rather than relying only on local mocks.

## PR 3 — Deliver marketing, pricing continuation and executable cutover

**Expected starting state:** PRs 1 and 2 are merged; product Worker tooling exists;
production still uses the old apex unless an explicit release record says otherwise.
App `/pricing` and its selection/capture/resume contract are complete in PR 2;
consume that contract rather than implementing a second purchase flow here.
This PR owns all remaining pre-cutover software and the post-merge release packet.

### Read and inspect

Read frontend, billing, access, MCP and integration owners plus both runbooks.
Inspect Astro config/middleware/pages, pricing catalog/island/purchase components,
`pending-pricing-intent.ts`, billing return configuration, auth navigation and
session-hint consumers. Inspect GCP CI/build/deploy and local Compose consumers.

### Implement

1. Replace the marketing adapter with a compatible locked Cloudflare adapter,
   supported handler, types and explicit Wrangler configuration/build/deploy
   commands. Verify installed peer requirements and actual generated output.
   Keep `output: 'server'`; homepage/commercial/pricing pages remain request-time
   SSR. Only explicitly deterministic docs/articles/legal pages may prerender.
   Inspect image/session bindings and avoid accidental infrastructure or a second
   auth store. Validate server imports in `workerd`.
2. Configure `citeladder.com` as a Worker Custom Domain, not a Worker Route.
   Route only PR 1's exact APEX-OWNED APIs/webhooks and protocol/discovery before
   Astro/assets; unmatched `/api` paths return non-cacheable 404. Do not add a
   blanket apex `/api/*` proxy. Any temporary endpoint exception requires its
   verified consumer, methods and removal condition in the release record.
   Redirect only consent GET to app; legacy consent POST keeps its original
   security checks or fails safely. This exact protocol consent behavior is not
   permission for product redirects. Old product paths and unknown public pages
   return genuine 404s unless an explicit marketing route owns them. Update links
   directly; do not create a product redirect map or path aliases by default.
3. Preserve marketing metadata/generated endpoints, with public canonicals,
   sitemap/social URLs on apex and app noindex policy kept out of marketing.
   Old `/app-assets/*` URLs return genuine missing responses by default. Only
   if a verified consumer needs them, copy that consumer's exact pre-cutover
   build assets with hashes and a removal condition. No multi-release retention
   system, database, KV catalog, cleanup daemon or asset registry.
4. SSR pricing from the authoritative public catalog over the protected upstream
   without visitor credentials. Make unavailable data explicit. Extract public
   presentation and hydrate from matching initial data; remove public marketing
   auth/billing mutations. Normal links point to app purchase continuation.
5. Link public plan selection to the already implemented app `/pricing` using
   PR 2's typed contract. Test the cross-origin journey end to end; do not move
   purchase authority back to marketing or duplicate the PR 2 implementation.
   Old apex pending intents require reselection unless a verified in-flight
   transaction needs handling; never serialize billing details to transfer them.
   Preserve verified apex webhook identity, raw-body signatures and idempotency.
6. Move marketing navigation to ordinary app links. Remove session-hint reads and
   auth hydration workarounds once replaced. Keep a backend hint writer only if
   the retained old runtime still consumes it; record its PR 4 removal condition.
7. Add independent marketing deployment using PR 2's release conventions and
   shared-change selection. Implement configuration inputs and scripts for the
   complete cutover/rollback below; no source edit or extra coding PR should be
   needed merely to activate the approved topology.
8. **Preserve the old runtime while removing its build dependency.** Before
   retiring the Node adapter/build path, capture immutable old frontend images,
   assets and matching Caddy/Compose configuration. Make GCP delivery retain/use
   these pinned artifacts during the rollback window instead of rebuilding the
   old frontend from the new Worker-only source. Verify backend-only delivery
   still works. Do not keep two maintained marketing implementations.
9. Update local development/Compose and CI smoke consumers in this PR wherever
   adapter replacement invalidates Node start commands. Supply a tested Worker
   equivalent; do not defer a broken clean-clone workflow to PR 4 or weaken checks.
   Retain only genuinely used compatibility files/dependencies, with removal gates.
10. Complete the Workers runbook and changed canonical contracts in architecture,
    frontend, billing, access, integrations, MCP, development, release acceptance
    and decisions. Distinguish available implementation from deployed topology.

### Verification and merge exit

Run both builds, Worker runtime tests and focused billing/navigation regressions.
Fetch initial HTML and test without JavaScript for home, pricing, commercial,
docs, article and legal pages; check meaningful content, metadata and links.
Exercise marketing selection through app login/confirmation and public-catalog
unavailability without making live charges. Reuse PR 2's purchase-boundary tests.
Verify raw webhook bytes/signatures and duplicate handling at their actual apex
endpoints, rejection on the app, narrow apex API access and absence of default
product redirects/aliases. Verify the architecture Section 12 matrix in isolated
staging, including both rollback
rehearsals, existing/new MCP clients and enabled OAuth integrations. Record any
unavailable external checks as blocking production, not blocking unrelated code.

**Merge result:** both targets and all cutover software are ready. Old apex remains
recoverable on captured artifacts. Merge is not production acceptance.
**Next agent may assume:** implementation is complete; PR 4 still requires actual
post-merge cutover and immediate verification below, with no observation period.

### Post-merge operations owned by the PR 3 release

Execute through the tested runbook after explicit operator authorization. These
are release steps, not another implementation PR. An agent can resume this
release from its record without the original chat.

1. Verify PRs 1–3, exact compatible backend/Worker artifacts, origin protection,
   tested rollback, certificates, capacity and all staging gates. Record current
   DNS/route associations, image digests, public configuration and secret-version
   references. Set concrete approved rollback thresholds/owners before traffic.
2. Add app callbacks alongside existing apex callbacks in the existing provider
   clients: Google sign-in `/api/v1/auth/oauth/google/callback`, GSC
   `/api/v1/integrations/oauth/gsc/callback`, GA4
   `/api/v1/integrations/oauth/ga4/callback`, and Bing
   `/api/v1/integrations/oauth/bing/callback` only when enabled. Prefix with
   `https://app.citeladder.com`. Keep Google's existing shared client. Check
   enabled payment return/approved-origin settings; retain webhook URLs.
3. Deploy/attach the production app Worker using its Custom Domain, preserving
   old public navigation until activation.
   Pin `MCP_PUBLIC_BASE_URL=https://citeladder.com`. Activate backend
   `FRONTEND_URL=https://app.citeladder.com`, exact browser allowlists and verified
   effective callback overrides together. Verify new app login/callback/consent
   before switching public links. Host-only sessions require fresh app login.
4. Attach the accepted marketing Worker to the apex Custom Domain and activate
   direct app links, OAuth configuration, navigation and public pricing handoff.
   Do not create apex-to-app product redirects. Domain association is a separate
   operation from uploading a version. Inspect conflicting DNS/routes first;
   avoid wildcards capturing origin and preserve unrelated/email records.
5. Immediately execute architecture Section 12 production acceptance with safe
   accounts/data: raw HTML, routing/assets, two-session isolation/CSRF, OAuth,
   existing and fresh MCP clients, pricing continuation, authorized sandbox
   payment/webhook checks, origin security, cache and recovery references.
   Disabled providers remain disabled; unavailable checks remain unexecuted.
6. Drain legacy OAuth/consent using actual deployed lifetimes, or safely restart
   incompatible transactions. Do not redirect callbacks before nonce validation,
   redirect protocol/webhook POSTs, or share cookies across subdomains.
7. Monitor by host/route: exceptions, CPU limits, origin errors, auth/consent/
   callback failures, missing chunks, redirects and catalog/checkout failures.
   Inspect these signals during the immediate smoke checks and record results.
   Fix and recheck failures; once checks pass, PR 4 can start the same day. No
   multi-day monitoring period or timer is required.
8. On failure use the narrowest recovery: accepted Worker version, or first-cutover
   restoration of captured DNS/routes, frontend images/Caddy and compatible
   backend browser settings. Restore direct links/configuration instead of adding
   a reverse product-redirect bridge. Safely restart test browser sessions and
   handle any verified in-flight transaction explicitly. Never restore the
   database or bypass TLS/origin authentication to undo this frontend release.

**Manual packet:** exact verified Cloudflare app/apex domain changes and rollback,
provider registrations, environment secret/config destinations, protected workflow
approvals and real-client acceptance actions. Keep old callback registrations and
frontend runtime artifacts until immediate cutover checks pass. Keep any exceptional
temporary contract only for its verified consumer and documented lifetime.

## PR 4 — Retire the old frontend runtime and close the migration

**Starting gate:** PR 3 merged, cutover completed and immediate checks passed.
Verify deployed IDs and results from the release record. The user's request to
implement PR 4 authorizes its repository cleanup under this same-day plan; do not
ask for a separate stabilization sign-off. Live deployment follows the existing
authorized workflow/account approvals. No minimum elapsed time is required.

### Read and inspect

Read the completed Workers runbook, GCP operations owners and the architecture's
replacement/cleanup map. Search all consumers of frontend Dockerfiles/Caddy,
Node adapter/start command, image variables, `VITE_ORIGIN`, `MARKETING_ORIGIN`,
old origin aliases, session hints, proxy implementations and shared route files.
Include local Compose, CI smoke tests, tooling, fixtures and active docs.

### Implement

1. Remove GCP frontend services, image build/push steps, frontend-only health
   dependencies/ports and rollback-window configuration from normal deployment.
   Remove production Astro/Vite dispatching and the old apex bypass; retain
   authenticated backend Caddy ingress and required apex compatibility via Workers.
2. Remove unused frontend Dockerfiles/Caddyfiles, standalone Node commands/adapter,
   obsolete proxy paths/aliases, migration flags and session-hint writer when no
   retained consumer needs them. Some may already be gone in PR 3; verify instead
   of recreating deletion work. Replace remaining legitimate local/test consumers
   before deleting shared files. Keep the tested local development proxy/equivalent.
3. Preserve VM, FastAPI, PostgreSQL, jobs, backend deployment/WIF, secrets, backup
   timers, firewall, IAP, persistent volumes and release artifacts still required
   by recovery policy. No Terraform destroy, database reset or disk deletion.
4. Verify apex exposes only exact required public APIs/webhooks and canonical MCP
   endpoints. Remove any temporary broad apex API bridge and expired endpoint/asset
   exceptions. Product APIs belong to app; apex-only webhooks must not acquire a
   second app hostname. Remove product aliases/redirects unless a verified external
   consumer still requires an exact exception. Such an exception stays 302/no-store
   with a removal condition; do not convert it to 301/308 in this migration.
   No default redirect map, 90-day retention rule or publicly served old asset set.
5. Remove expired transition code/registrations only after transaction drain and
   rollback approval. Set explicit follow-up owners/dates for compatibility that
   legitimately outlives PR 4. Do not keep old/new aliases indefinitely or remove
   long-lived public MCP/webhook endpoints as “migration debt.”
6. Update canonical topology/setup/operations/recovery instructions to the actual
   deployed state. Archive recoverable legacy artifacts under release retention;
   current recovery restores accepted Workers rather than requiring old Node
   builds. Update `ACTIVE.md` to completed only when closure evidence exists.

### Verification and exit

Search old symbols/paths and inspect every remaining reference for a legitimate
consumer. Run clean local setup/affected Compose smoke, both Worker builds,
affected deployment-script/config semantic checks and focused regression tests.
Verify backend-only delivery/recovery and independent frontend delivery without
database/writer restart caused by a frontend release. Recheck deployed ingress
and route acceptance after authorized decommission; no broad provider test rerun
is needed for unaffected contracts with retained evidence.

**Merge result:** no production dependency on old frontend-serving code; direct
app navigation and verified public contracts work. **Migration closed** additionally requires
the cleanup deployment/verification and operator acceptance; code merge alone is
insufficient. List exact removals, retained compatibility/removal dates, tests
and any remaining operational work in the final handoff.

**Manual packet:** approved cleanup deployment and removal of only verified obsolete
Cloudflare rules/provider registrations; confirm post-cleanup ingress and rollback.
Do not remove origin DNS, backend protections or retained public protocol routes.

## Platform references for implementation

Resolve runtime behavior against the versions actually locked during each PR;
do not copy generated entrypoints or adapter APIs from a different generation.
Official references consulted while planning:

- [Cloudflare Worker and Static Assets routing](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/)
  for Worker/asset precedence.
- [Astro Cloudflare adapter](https://docs.astro.build/en/guides/integrations-guide/cloudflare/)
  for supported runtime and adapter configuration.
- [Cloudflare Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
  for domain association and DNS behavior.

Live Cloudflare, provider and GCP settings were not inspected for this planning
change. PR 1 reconciles them; no hostname availability, account access or deployed
acceptance is assumed here.
