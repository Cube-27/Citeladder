# CiteLadder: Cloudflare Workers Migration Architecture

- **Version:** 1.0
- **Prepared:** 22 September 2026
- **Scope:** Marketing website, product frontend, public-origin separation, migration-related debt removal, deployment and documentation.
- **Audience:** Sol and the implementing/reviewing engineering agents.
- **Status:** Implementation specification. Production cutover remains an explicitly approved operator action.

## 1. Outcome and fixed decisions

Move frontend delivery to Cloudflare Workers without migrating CiteLadder’s backend, databases, crawlers, job processors or business rules. Preserve public marketing URLs, existing integrations and the current product experience except for the deliberate move of application pages to a new hostname.

| Concern | Decision |
|---|---|
| Marketing origin | `https://citeladder.com`, deployed as an Astro Worker. |
| Marketing rendering | Keep `output: 'server'`. Request-time SSR for the homepage, commercial/product pages and pricing. Selectively prerender deterministic documentation, articles and legal pages. Every indexable page must contain its substantive content in the initial HTML response. |
| Product origin | Introduce `https://app.citeladder.com`. This hostname is a migration deliverable, not an existing deployment. |
| Product rendering | Keep the existing Vite/React SPA. Deploy its static build plus a small routing/proxy Worker. Do not migrate the product to Astro, Next.js or a new router. |
| Backend | Keep the existing GCP deployment. Repository infrastructure currently describes a Compute Engine VM running Docker Compose, not Cloud Run. Verify the live deployment before executing the runbook. |
| Browser APIs | Product browser requests remain relative `/api/...` requests on `app.citeladder.com`. Do not introduce a browser-facing `api.citeladder.com`. |
| Public MCP identity | Preserve the existing apex MCP endpoint, issuer and resource identity. Explicitly configure `MCP_PUBLIC_BASE_URL=https://citeladder.com`; do not let it change implicitly with the frontend URL. |
| Browser identity | Login, account interactions and MCP browser consent move to the app origin. Keep host-only session cookies; accept a fresh login after the origin change. |
| Public pricing | Marketing displays crawlable public catalog data. Authenticated purchase, billing details and checkout continuation belong to the app origin. Reuse the existing billing implementation. |
| Origin connectivity | Both Workers use one authenticated, non-recursive GCP origin ingress. Proposed infrastructure hostname: `origin.citeladder.com`. It is not a customer API and must reject requests without Worker-to-origin authentication. |
| Deployment ownership | GitHub Actions owns production deployments. Use separate Worker configurations and deployment units, with protected production approvals. Do not also enable an independent dashboard Git auto-deployer. |
| Cube27 | Leave its existing Pages deployment unchanged. This migration concerns CiteLadder only. |

Cloudflare recommends Workers for new projects. More specifically, the current Astro Cloudflare adapter no longer supports Pages deployment. Do not copy an older Cube27 Pages setup or downgrade Astro to reproduce it. [C1] [C2]

### Scope boundaries

**Included:** Adapter/runtime changes, two public frontend origins, safe routing, callback/configuration changes, public pricing rendering and handoff, origin protection, deployment separation, focused tests, rollback and removal of the superseded frontend-serving infrastructure.

**Excluded:** Moving FastAPI to Workers, moving PostgreSQL, introducing D1/Hyperdrive/R2/KV/Queues/Durable Objects as replacement infrastructure, changing AI acquisition pipelines, redesigning the UI, rewriting authentication or payments, changing pricing, and broad repository cleanup unrelated to this migration.

No user data migration or database reset is required by this architecture. A proposal that unexpectedly requires either must be explained and reviewed separately.

## 2. Verified baseline and limits of verification

The following was checked in the repository’s default-branch files. This is a source-code review, not an inspection of the live Cloudflare account, DNS zone, provider consoles or VM state. At implementation start, record the actual Git commit and deployed release, and resolve any drift against this baseline.

| Verified observation | Source and migration consequence |
|---|---|
| GCP infrastructure describes a VM, Docker Compose, Caddy ingress, loopback backend/database services, IAP administration and Cloudflare-restricted web ingress. | `infra/gcp/README.md`, `docs/operations/GCP_RUNBOOK.md`. Do not write a Cloud Run removal plan or promise a Cloud Run service saving. [R1] [R14] |
| Caddy switches between Astro, Vite and FastAPI on one public hostname. | `infra/gcp/runtime/frontend-routes.caddy`. Its exact route contract is the starting point for legacy redirects and protocol preservation. [R2] |
| Marketing uses Astro server output with the standalone Node adapter. | `frontend/apps/marketing/astro.config.mjs`. Replace the runtime adapter, not the site’s content or layout. [R3] |
| The homepage uses a React component with `client:load`. | `frontend/apps/marketing/src/pages/index.astro`. Hydration is not itself evidence of missing server-rendered HTML; inspect the actual response. [R16] |
| Vite emits `frontend/apps/app/dist`, uses `/app-assets/`, and has deliberate vendor chunking and bundle-budget support. | `frontend/apps/app/vite.config.ts`. Preserve these properties. [R4] |
| Both frontend build configurations point at the same `frontend/public` directory. | Separate host-specific headers, robots, manifests and metadata; do not let app `noindex` policy leak into marketing output. [R3] [R4] |
| Session and OAuth transaction cookies are issued without a `Domain` attribute. | `backend/app/api/browser_cookies.py`. They are host-only; a subdomain change does not carry an apex session into the app. [R5] |
| MCP public origin falls back to `settings.frontend_url`. | `backend/app/core/config/mcp.py`. Pin the MCP origin explicitly before changing `FRONTEND_URL`. [R6] |
| MCP authorization generates consent and login URLs from its public origin; transport checks are also origin-specific. | `backend/app/domain/mcp/oauth_provider.py`, `server.py`. Separate the browser origin from the protocol identity deliberately. [R7] [R8] |
| Google sign-in callback URLs default to the frontend origin; the same Google OAuth client is deliberately reused for sign-in and Google integrations. | `backend/app/core/config/oauth.py`. Update callback registrations without inventing another OAuth client. [R9] |
| Marketing pricing contains authenticated reads, billing mutations and a capture/resume flow. Its pending intent is stored in `sessionStorage`. | `pricing-catalog.tsx`, `pending-pricing-intent.ts`. A link-only subdomain migration would lose continuation state and leave purchases on the wrong origin. [R10] [R11] [R12] |
| The frontend workspace and package manager are owned by `frontend/`; current scripts distinguish Astro and Vite builds. | `frontend/package.json`. Do not install at the dependency-free repository root or replace the existing tooling stack. [R15] |

Repository comments that still mention Next.js rewrites, or claim all marketing pages are static, are not runtime authority. Correct such comments where touched; do not perpetuate them in the new runbook.

## 3. Target topology and ownership

```text
Public visitor or crawler                     Signed-in product user
          |                                            |
          v                                            v
  citeladder.com                               app.citeladder.com
  Marketing Worker                             Product Worker
  Astro SSR + selected prerendered pages       Vite static assets + thin proxy
          |                                            |
          | public API / MCP / OAuth                   | /api/*
          | compatibility routes                       | browser MCP consent
          +---------------------+----------------------+
                                |
                        authenticated HTTPS
                                |
                      origin.citeladder.com
                      Cloudflare-proxied origin
                      Caddy: validate ingress identity
                                |
                         GCP FastAPI backend
                                |
                    Existing database and job services
```

There are **two application Workers**, not a new gateway service, not a microfrontend platform, and not two implementations of backend logic.

The marketing Worker owns public HTML, public metadata, bounded old-app redirects and the retained apex protocol/API routes. The product Worker owns delivery of the SPA, its response policy, same-origin API proxying and browser consent routing. FastAPI remains the only owner of authentication, authorization, tenant boundaries, billing, integration state and MCP grants.

Use one small shared server-only proxy helper where both Workers need identical transport behavior. Do not share a giant route switch, React runtime or marketing dependency graph between deployments. A separate hostname permits independent deployment; independent deployment does not require another repository or workspace.

### Origin configuration contract

| Configuration | Intended meaning |
|---|---|
| Backend `FRONTEND_URL` | The product/browser origin: `https://app.citeladder.com` after cutover. |
| Backend `MCP_PUBLIC_BASE_URL` | The existing protocol origin: `https://citeladder.com`. Required explicitly when MCP is enabled in production. |
| Frontend public website origin | `https://citeladder.com`; used for marketing links, documentation links and canonical public URLs. |
| Frontend public app origin | `https://app.citeladder.com`; used for login, registration and purchase navigation. |
| Worker `BACKEND_ORIGIN` | The authenticated upstream origin, not either public frontend origin. Never exposed to browser bundles. |
| Worker-to-origin credential | A dedicated secret, unrelated to application session signing keys or customer credentials. |

Introduce a small typed public-origin configuration owner rather than scattering string literals. Proposed frontend names are `PUBLIC_WEBSITE_ORIGIN` and `PUBLIC_APP_ORIGIN`. Reuse an existing equivalent owner if present. Replace ambiguous uses of `NEXT_PUBLIC_SITE_URL` in touched code after classifying each consumer; do not globally substitute one hostname for another.

Preserve the existing backend `FRONTEND_URL` contract instead of adding synonymous backend settings. Production origin values must be valid HTTPS origins, with no path, credentials, query or fragment. Missing required production configuration fails the build/startup; it must not silently fall back to localhost, a Worker preview hostname or the apex domain.

Build-time public values and runtime Worker secrets are different inputs. Changing a public build value requires a new artifact even on the same source commit. Record both source revision and a non-secret configuration fingerprint with each release.

## 4. Public route contract

### 4.1 Marketing origin: `citeladder.com`

Apply routing in this order. Server-owned endpoints must take precedence over Astro routing, redirects and asset fallback.

| Request family | Required behavior |
|---|---|
| Existing `/api` and `/api/*` | Proxy to FastAPI without changing method, body or endpoint identity. Retain existing webhooks, callbacks and public catalog reads. Do not turn these into app-host redirects. |
| `/mcp`, `/mcp/*`, `/authorize`, `/token`, `/revoke`, and the existing OAuth discovery endpoints | Preserve the public protocol contract. Apply the special browser-consent rule below before the general MCP rule. |
| `GET /mcp/oauth/consent?transaction=...` | Redirect to the same bounded consent path on the app origin. New authorization requests should already generate that app URL. |
| An in-flight legacy consent `POST` | Preserve safe legacy handling during the transaction-drain window. Do not redirect a submitted approval form across origins. Expired or incompatible transactions must restart explicitly, not bypass CSRF. |
| Verified old product page paths | Redirect browser GET/HEAD requests to the same path on the app origin, retaining query parameters. |
| Old `/app-assets/*` URLs during compatibility | Serve the retained, exact fingerprinted artifact or return a genuine missing-asset response. Never return an Astro page or SPA document for a missing chunk. |
| `/_astro/*` and public static assets | Serve the marketing build’s assets. |
| Public marketing, legal, blog and documentation routes | Astro rendering according to Section 5. |
| Unknown public URL | A real HTTP 404, not a success response containing a generic landing page. |

Preserve these existing discovery paths exactly:

```text
/.well-known/oauth-authorization-server
/.well-known/oauth-protected-resource/mcp
```

Do not infer that every `/.well-known/*` route belongs to MCP. Inventory any other actual discovery, verification or validation endpoints before cutover and preserve their existing owners.

### 4.2 Product origin: `app.citeladder.com`

| Request family | Required behavior |
|---|---|
| `/api` and `/api/*` | Same-origin proxy to FastAPI, including the app-host OAuth callbacks. |
| Exact `/mcp/oauth/consent`, GET and POST | Proxy the backend-owned browser consent flow. It is not a React SPA route. |
| Other `/mcp`, `/mcp/*`, `/authorize`, `/token`, `/revoke` and OAuth discovery requests | Return a non-cacheable 404, not the SPA shell and not a second MCP issuer/resource. The exact browser-consent path above is the sole app-host exception. The canonical machine-facing endpoint remains the apex. |
| `/health` | Small non-sensitive Worker liveness response; no database or provider details. |
| Existing asset files | Static Assets delivery with host-specific headers. |
| Missing asset/resource request | Genuine 404; no HTML fallback for chunks, CSS, images, fonts, manifests or API requests. |
| Browser application navigation | Serve the SPA entry and let the existing React router, session gate and workspace logic resolve the page. |
| `/pricing` | App-owned purchase/continuation surface that reuses the existing billing code. This is a deliberately introduced app route, not a second public marketing pricing page. |
| `/` | Enter the existing product bootstrap/session flow. Do not invent a second project-selection algorithm. |

`/register` remains browser registration. MCP dynamic registration remains `/mcp/register` at the apex. Do not “simplify” them into one route.

### 4.3 Legacy application redirects

The verified current exact path set is:

```text
/login /register /projects /onboarding /site /issues /demand
/search-intelligence /performance /opportunities /visibility
/runs /prompts /content /products /ai-referrals /settings
/invitations/accept
```

The current bounded dynamic families are:

```text
/runs/{one-segment-id}
/site/crawls/{one-segment-id}/pages/{one-segment-id}
```

Preserve existing trailing-slash handling. Recheck the route owner and React route definitions at the implementation commit; this list is evidence, not permission to ignore newly shipped routes.

Use one finite compatibility map. It must not grow every time a new app page is introduced. New app pages belong only to the app hostname. Preserve `project`, workspace, invitation and other required query context. Validate redirect destinations against the fixed app origin; reject protocol-relative and attacker-controlled redirect targets.

Start with **302, `Cache-Control: no-store`** while rollback remains possible. After seven consecutive stable days and operator sign-off, change eligible old-page GET/HEAD redirects to 301. Retain the legacy map for at least 90 days, and longer where observed use warrants it. These are migration policy defaults, not measured traffic facts.

Do not reclaim old product paths such as apex `/visibility` as marketing pages during this migration. Existing customer links take priority. Reclaiming one later requires a separate URL decision and removal of the conflicting redirect.

URL fragments do not reach the server. Do not claim a server redirect reads or rewrites them; test browser fragment behavior where an existing flow relies on it.

## 5. Marketing rendering and crawlability

### 5.1 Rendering policy

The marketing deployment stays SSR-capable and defaults to request-time server rendering. Prerendering is permitted only for explicitly classified deterministic content, not as a workaround for a broken Worker runtime.

| Page type | Rendering decision | Reason |
|---|---|---|
| Homepage and commercial/product landing pages | Request-time Astro SSR for the initial migration. | Preserve the agreed runtime behavior while changing hosting. |
| Public pricing | SSR using the backend-owned public catalog as initial data. | Catalog content must not depend on a browser-only query before it exists in HTML. |
| Version-controlled articles, documentation and legal text | `prerender = true` when all content and metadata are known at build time. | Produces complete crawlable HTML without request-time compute. A content change requires a new build. |
| A public page with request-dependent content | SSR; document its data source and safe response policy. | Do not freeze request-dependent content into a build by accident. |
| Product dashboards and authenticated tools | Existing client-rendered app, on the app origin. | These are private product experiences, not marketing search documents. |

Astro supports server output with explicit prerendered routes. [C3] Both SSR and prerendering can deliver substantive HTML without client execution; Google recommends server-side rendering or prerendering and notes that not all bots run JavaScript. Request-time SSR is not, by itself, a ranking guarantee. [C12]

### 5.2 Acceptance is the HTML response, not a framework flag

For each indexable route, require a successful unauthenticated HTTP GET to contain the primary heading, meaningful body content, normal links, title, description, canonical and applicable structured data before JavaScript runs.

Do not:

- Replace public content with a Vite SPA or `client:only` island.
- Assume `output: 'server'` guarantees that a client-fetched catalog is rendered on the server.
- Treat a screenshot after hydration, a 200 health response or an Astro build pass as crawlability evidence.
- Render special “SEO content” only for a bot user agent.

Keep existing interactive React islands where useful. Hydration may enhance controls; it must not be responsible for producing the primary marketing content. Browser APIs must remain out of server render paths.

For pricing, extract a reusable public catalog presentation from the existing billing component. Obtain the public catalog server-side through the authenticated upstream channel without forwarding a visitor’s session. Render only public, validated catalog data. Hydrate with that initial data if interactivity is needed, and avoid an immediate duplicate request. Never hard-code a second price or entitlement catalog in Astro.

A catalog failure must not become invented prices or a misleading empty success page. Return the normal explanatory page with a meaningful temporary-unavailability status for a hard dependency, while keeping unrelated marketing routes independent of backend availability. Do not make all public pages query `auth.me` or require GCP to render their static content.

### 5.3 Metadata and crawler access

Keep existing public canonical URLs on the apex. Do not derive canonical or structured-data origins from the inbound `Host`, preview URL or backend hostname. Generate sitemap entries only for canonical, indexable public routes; preserve existing robots, sitemap, manifest and `llms.txt` endpoints with their correct content types.

Inspect Cloudflare rules on the actual marketing hostname: robots directives, access policies, bot challenges, country restrictions and cache rules can prevent crawling even when HTML rendering is correct. Do not globally disable security controls; validate intended crawler access through the normal production route.

Apply app `noindex` in both static HTML and response headers where appropriate. Keep app URLs out of the public sitemap. Do not rely on `robots.txt` as an access-control mechanism. Crawlers must be able to fetch a page to observe its `noindex` instruction; a blanket disallow is not a substitute for that instruction. [C13]

For the app, allow fetching the non-sensitive public shell/login pages so their `noindex` can be seen; disallow API/protocol paths and enforce actual authentication at the backend. Protect previews with access control and `noindex`. Do not let preview policy reach the production marketing build.

## 6. Authentication, OAuth and MCP: preserve identities, separate origins

### 6.1 Browser session policy

Issue product sessions on `app.citeladder.com` through its same-origin API proxy. Preserve the existing backend cookie owner, HttpOnly session, production `Secure`, `SameSite=Lax`, path and expiry rules. **Do not add `Domain=.citeladder.com` to make the migration appear seamless.** Host-only cookies and origin-specific browser storage do not transfer simply because the two hosts share a parent domain. [R5] [C14] [C15]

A fresh login on the app hostname is the accepted migration behavior. App initialization continues through the existing workspace/session owner. [R17]

Browser-local preferences, project-selection hints and unsaved local state also do not cross origins. Preserve explicit URL context and resolve persisted state through the existing API; document any device-local reset rather than claiming all state transfers. Check actual webmanifest/start URL, service-worker and analytics consumers during the origin inventory; do not introduce a PWA or a new tracking system.

Do not transfer session tokens through query strings, JavaScript-readable storage, iframes or a new home-grown SSO bridge. Do not rotate JWT/encryption keys, invalidate all accounts or reset the database as a substitute for handling the origin change.

Marketing must no longer depend on the app’s session cookie to render its navigation. Keep its login/sign-up actions as normal links to the app. Remove marketing-only session-hint reads, `auth.me` calls and hydration workarounds once their consumers have been separated. Remove the backend `citeladder_session_hint` writer only after confirming no remaining legitimate consumer. Do not widen cookie scope to preserve a “Dashboard” label on the public website.

Same-origin browser API calls avoid a new CORS dependency; they do **not** remove CSRF requirements. Keep exact origin validation, existing authorization checks and session-version invalidation. A sibling subdomain is not automatically a trusted browser origin. Never solve a failing integration with wildcard CORS, unconditional Origin rewriting or weakened CSRF checks.

### 6.2 Third-party OAuth and application links

Register the following new callback URLs before activating app-host flows. Keep previously registered apex callbacks through the rollback window. The paths below are established by the current runbook; enable only providers actually configured in the deployment. [R9] [R14]

| Flow | New callback |
|---|---|
| Google sign-in | `https://app.citeladder.com/api/v1/auth/oauth/google/callback` |
| Search Console | `https://app.citeladder.com/api/v1/integrations/oauth/gsc/callback` |
| Analytics | `https://app.citeladder.com/api/v1/integrations/oauth/ga4/callback` |
| Bing, when configured | `https://app.citeladder.com/api/v1/integrations/oauth/bing/callback` |

Keep the same Google OAuth client for sign-in, Search Console and Analytics. Do not interpret the GitHub/Apple entries in the provider catalog as implemented sign-in flows. [R9]

The hostname that issues an OAuth transaction cookie must also receive that transaction’s callback. New flows start and finish on the app hostname. Apex callbacks must not be globally redirected to the app before their nonce validation. During cutover, preserve a bounded legacy flow or require an explicit restart of an expired/incompatible transaction; never accept a callback without its original binding.

Inventory every `FRONTEND_URL` consumer and explicit provider redirect override. Classify login/error redirects, invitation links, integration returns, public documentation links and billing return paths separately. An invitation acceptance URL must move to the app without losing its existing token semantics. Do not invent an email delivery system where the existing owner does not provide one.

Keep OAuth `state`, nonce, PKCE and validated internal return-path behavior. An arbitrary `return_to`, `next`, request host or forwarded host must never determine a trusted destination. Sign-in and workspace initialization must reuse the existing navigation/session owners, not a new Worker authorization layer.

### 6.3 MCP protocol origin stays stable; browser consent moves

**Do not change `MCP_PUBLIC_BASE_URL` to the app origin.** The existing implementation binds authorization requests and grants to the public MCP resource. Pinning the apex avoids changing that identity accidentally when `FRONTEND_URL` becomes the app. [R6] [R7]

Implement the following bounded changes in the existing backend owners:

| Owner | Required change |
|---|---|
| `oauth_provider.py`: authorization destination | Generate the browser consent URL from the configured app origin. Keep `resource_url()` and the issuer on the apex. |
| `server.py`: consent principal/login redirect | Send an unauthenticated browser to app `/login`, returning only to the validated app consent transaction. Do not reuse `public_base_url()` for browser login. |
| Consent GET and POST | Serve on app `/mcp/oauth/consent`; preserve the existing session-bound CSRF token, explicit approval/denial and one-time transaction consumption. |
| Transport security and dispatch | Accept the app host/origin for the exact browser-consent surface. Keep machine-facing protocol host/origin restrictions on the apex. Inspect where the SDK applies checks; do not broadly disable them. |
| Public discovery, registration and tokens | Preserve apex issuer, resource, registration, authorization, token and revocation URLs. Do not advertise the origin hostname or a second app-host MCP resource. |
| Documentation links | Keep public setup instructions at apex `/docs/mcp`; update any product-navigation links separately. |

An existing GET to apex consent can redirect to the app. A legacy submitted consent POST must either complete under its original valid session/CSRF binding during the configured transaction lifetime or fail safely and restart. It must not be redirected or silently approved. Measure the drain against the deployed TTL; the source default is 600 seconds, not proof of the live value. [R6] [R8]

Keep the current MCP SDK, authorization records, token hashes, membership rechecks, refresh rotation and revocation behavior. No cross-host session sharing is necessary in this design: browser login/consent uses the app, while protocol identity remains on the apex. Keep the existing MCP owner’s bounded tool and membership semantics. [R19]

**Cutover gate:** An existing authorized client can still read permitted data; a fresh client can discover, register, authorize through app login, approve or deny, exchange and refresh tokens, and revoke access. Local protocol tests alone do not prove a real client’s deployed acceptance.

## 7. Public pricing and checkout continuation

This is required migration work, not an optional billing redesign. The current marketing pricing component combines public catalog rendering, session checks, purchases and pending intent in apex `sessionStorage`. The new app cannot read that store. [R10] [R11]

### Target flow

```text
apex /pricing: SSR public catalog
       |
       | ordinary link containing a bounded, non-sensitive selection
       v
app /pricing: validate selection and capture app-local pending intent
       |
       +--> app login if necessary --> return to app /pricing
       |
       v
current workspace + fresh catalog + current quote + explicit confirmation
       |
       v
existing backend-authorized, idempotent checkout / purchase implementation
```

Introduce the app `/pricing` continuation route by reusing existing billing components, hooks and domain rules. Extract shared public presentation where necessary; do not build another checkout engine or catalog. The public website must not collect billing addresses or perform authenticated purchases after the split.

The marketing-to-app link may carry only a validated selection: existing purchase kind, catalog key, a bounded positive quantity and credential-mode/BYOK choice. Treat every value as untrusted. **Do not put prices, tax amounts, billing details, personal information, session credentials or authorization decisions in the URL.** No cross-origin storage bridge or new database handoff service is needed for these public selection fields.

At the app, validate the schema and supported choices, capture the pending intent in app-local storage before authentication, then reuse the existing capture/resume owner. Update `PRICING_RETURN_PATH` consumers deliberately: `/pricing` now means app purchase continuation for those consumers, while public links use the website origin. Preserve the separate MCP return-path flow. [R18]

After login, resolve the actual workspace and authorization, reload the live catalog and obtain the current quote. A link, a GET, login completion or browser reload must not authorize a charge. Require deliberate purchase confirmation. Reuse the existing idempotency key for an uncertain attempt; do not mint a new key on every retry. Maintain existing tax, country, provider-mode and entitlement guards.

Old apex pending intents are not migrated magically. Preserve enough legacy behavior to avoid breaking an in-flight payment; otherwise ask the user to select again. Do not serialize the old pending object into a URL, because it can contain billing information. [R11]

Keep actual webhook URLs at their existing apex paths, with the same raw request bodies, signature checks and response semantics. Provider webhooks are not browser navigation and must not redirect to the app. Review return URLs and approved frontend domains only for enabled providers; this migration does not activate or replace a payment provider.

## 8. Worker-to-GCP ingress and proxy contract

### 8.1 Authenticated origin, not an open backend

Provision the proposed `origin.citeladder.com` as a dedicated, Cloudflare-proxied origin hostname pointing to the existing VM. Check for an existing record before creating it. Neither application Worker may be attached to this hostname. Do not use a wildcard Worker route that captures it and recurses.

Keep the existing Cloudflare-only web firewall, IAP administration and loopback database/backend exposure. Add Worker-to-origin authentication at Caddy or the established ingress owner. A Cloudflare source IP alone does not establish that a request came from one of CiteLadder’s Workers.

Use a dedicated random ingress credential in a server-only header, for example proposed `X-CiteLadder-Origin-Token`. The Worker overwrites any caller-supplied value. Ingress rejects missing/invalid credentials before forwarding and never returns the credential to a client. Do not replace the user’s `Authorization` header with this credential. Store values in Worker secrets and the existing GCP secret delivery system, not browser bundles, Terraform values, committed files, deployment output or request logs.

Ensure the origin certificate covers the origin hostname and retain Full (strict) TLS. Do not use Flexible TLS, disable verification, expose port 8000 or open the firewall globally. Keep the old apex origin virtual host only for the explicit rollback/transition period; retire its unintended backend bypass after acceptance.

Rotate ingress credentials by temporarily accepting the old and new versions at ingress, deploying both Workers with the new version, verifying them, then removing the old version. Record secret version references, not payloads.

### 8.2 Public host and client identity

The outbound TLS/HTTP destination is the origin hostname, but the backend must receive the **verified public request origin** needed for redirects, cookies and MCP host validation.

Use this trust chain: Worker verifies its inbound public host, overwrites internal forwarding headers, authenticates to origin; origin verifies that credential and allowlists the forwarded public host before constructing trusted upstream `Host`/forwarding headers. Allowed production browser hosts are explicitly the apex and app. Protocol restrictions remain path-specific as described in Section 6.

Do not forward arbitrary inbound `X-Forwarded-Host`, `Forwarded`, internal auth headers or a spoofable client-IP value unchanged. Do not rewrite the browser’s `Origin` to hide a CSRF failure. Preserve client identity for rate limiting using Cloudflare’s actual Worker subrequest header behavior and a tested trusted-proxy configuration. Header behavior differs across subrequest cases; verify it on the deployed path instead of assuming the old Caddy chain is unchanged. [C11]

### 8.3 Transport behavior

Implement a transparent transport boundary, not a second backend:

- Use a fixed, validated upstream origin. Preserve methods, path encoding, query strings, body bytes, authorization and application headers. Never accept an arbitrary proxy target from the caller.
- Stream request and response bodies. Do not parse/re-serialize webhook JSON, buffer streams into `.text()`/`.json()`, or change download bodies. Preserve cancellation and the streaming behavior of endpoints that use it.
- Handle redirects manually so OAuth redirects and cookies reach the browser. Preserve status, content type, `Location`, separate `Set-Cookie` headers, `WWW-Authenticate` and protocol response headers. Strip hop-by-hop headers; do not paste Node-only `duplex: 'half'` configuration into Workers without runtime validation.
- Do not cache authenticated responses or retry mutating requests. Preserve upstream errors; return an appropriate 502/504 for transport failure, never an HTML success fallback. Keep request identifiers and useful redacted logs without recording tokens, cookies, consent transactions or payment bodies.

Inventory existing upload/download sizes, request deadlines and any streaming endpoints against Worker limits before cutover. A frontend move must not silently reduce a supported request size or convert a working long response into a short proxy timeout. Heavy computation and background execution remain on GCP.

## 9. Worker implementation, assets and response policy

### 9.1 Marketing runtime

Use an Astro-compatible, locked `@astrojs/cloudflare` version; check its peer dependencies against the installed Astro version. Do not upgrade the framework, React or the product build stack as an incidental migration step.

Current adapter guidance uses its server entrypoint or supported custom handler, rather than the old `dist/_worker.js/index.js` convention. It also replaces the old `Astro.locals.runtime` API. Use the chosen version’s actual exports and generated configuration; do not combine snippets from different adapter generations. [C2]

Wrap the supported Astro handler only as needed for protocol routes and legacy redirects. Do not create an independent HTML server around it. Replace the existing Node-specific marketing proxy with the shared Worker transport implementation. Keep backend credentials out of client imports.

Inspect generated bindings before deployment. The adapter can provision image/session resources. Do not introduce an Astro session store alongside backend authentication or silently activate paid image transformation. Select an explicit image strategy that preserves current output; preoptimized/static assets and build-time transformations are sufficient unless actual runtime image needs are established. Any unavoidable adapter-owned resource needs an explicit recorded purpose, not a fake disable option or an unused application dependency. [C2]

A Node-based build does not prove that SSR works in Workers. Validate request-time rendering in `workerd`, including server imports and any browser-only dependencies. A build-time prerender workaround must not become a hidden Node requirement for request-time pages.

### 9.2 Product runtime and fallback

Keep the existing Vite-plus build. A normal Vite build deployed with Wrangler and Static Assets is sufficient; do not replace Vite-plus or add the Cloudflare Vite plugin to the product simply because the marketing adapter uses it.

Prefer asset-first delivery with a small Worker fallback. **Do not enable an unconditional SPA fallback for every unmatched URL.** Workers’ SPA navigation handling can bypass Worker code for navigation requests unless routing is configured deliberately. Browser navigations to API/OAuth paths must still reach the backend. [C4] [C6]

The product handler must follow this decision order:

```text
reserved API / exact browser-consent path -> backend proxy
other reserved protocol / health route    -> explicit handler or real error
existing static asset                    -> asset response
missing asset or non-document request    -> real 404
GET/HEAD HTML browser navigation         -> SPA entry
unsupported method                       -> appropriate 404/405, never SPA
```

Require Worker-first routing, or an equivalent precedence safeguard, for product `/api/*`, the exact browser-consent path, reserved protocol and discovery paths, and `/health`. This includes every callback path that needs Worker handling. Build checks must also prevent a public asset from shadowing a reserved path. Test both ordinary fetch requests and `Sec-Fetch-Mode: navigate`; do not test only XHR. Apply an equivalent safeguard to marketing routes if the selected asset settings could bypass its Worker.

Serving the SPA entry must not loop back into the same Worker or apply its own fallback recursively. Unknown app document routes may reach the existing React not-found experience; unknown marketing routes and missing assets must still return real HTTP errors.

Retain the existing bundle manifest, vendor chunking, browser targets and bundle budget. Keep a small retained set of prior fingerprinted assets for old tabs and the migration’s apex asset URLs. Each retained file must be immutable and traceable to a release, not a second maintained frontend build.

### 9.3 Response/cache matrix

| Response | Initial policy |
|---|---|
| Fingerprinted JS/CSS/fonts/images | Preserve the existing immutable long-lived cache policy only for content-addressed filenames. |
| App HTML, login shell and navigation fallback | `Cache-Control: no-store`; app `noindex` policy. No user-specific data in the shell. |
| Ordinary marketing SSR HTML | Browser revalidation; no new shared full-page cache in the initial cutover. Add public caching only after demonstrating that the response is independent of cookies/user state and defining freshness. |
| Public pricing | Fresh backend-owned catalog for SSR; `no-store` initially. No shared cache of a country/user-specific quote. |
| Sessions, consent, authenticated APIs and checkout | `private, no-store` or the equivalent stricter existing policy. Never cache `Set-Cookie` responses as public content. |
| Public metadata/static documents | Correct content type, canonical origin and an explicitly chosen freshness policy. |
| Temporary legacy redirects | `302` and `no-store` until migration acceptance. |

Apply headers in the correct owner: `_headers` affects static assets, not Worker/SSR-generated responses. Add generated-response headers in the handler/middleware as well. Do not assume a shared `_headers` file covers both. [C5]

Preserve effective HSTS, content-type protection, referrer and frame/security policies previously supplied by Caddy. Keep app and marketing CSP needs separate; inspect actual payment, OAuth, analytics and image origins before changing CSP. Do not add wildcard script allowances to make tests pass. Do not prefill every subdomain with HSTS policy without checking certificate readiness.

Because both builds currently share `frontend/public`, separate **host-specific output policy** from genuinely shared assets. A single source for logos/fonts is fine; identical robots, manifest, headers and canonical settings are not. Stage or generate the correct per-host files without duplicating hand-maintained content. Confirm that `.env`, Worker server bundles, backend files and private build artifacts cannot be fetched as static assets.

### 9.4 Cost and performance claims

Treat production SSR and proxy requests as compute traffic, not as unlimited free static hosting. Workers Free has a 100,000-request daily allowance and 10 ms CPU per invocation; the paid plan currently starts at USD 5 monthly. Static asset delivery has different billing from Worker invocation. Verify the account’s plan, shared usage and deployment limits before release. [C7] [C8]

Plan production capacity using measured SSR CPU and actual proxy volume; do not force prerendering of dynamic data or weaken functionality to fit a free quota. Set a reviewed CPU ceiling and cost alerts. Use the paid tier when the measured workload or production headroom requires it, with owner approval.

Expected benefits are frontend delivery independent of the VM and removal of frontend-serving processes/builds. Do not promise faster backend calls, outage immunity or an immediate GCP bill reduction. The VM still runs; savings require measurable utilization changes and a separately justified capacity change.

## 10. Implementation sequence and CI ownership

Deliver bounded, reviewable phases. Do not combine DNS cutover, authentication changes, unrelated refactoring and deletion of rollback infrastructure into one unreviewable change.

| Phase | Implementation result | Exit gate |
|---|---|---|
| 0. Reconcile baseline | Record commit, deployed topology, route families, public origins, callback overrides, enabled providers and current build commands. Classify every affected URL/config consumer. | No guessed production facts or unclassified origin consumers. |
| 1. Prepare contracts | Add explicit website/app/protocol origins, protected origin ingress and shared proxy behavior. Make backend browser-origin changes backward-compatible until cutover configuration changes. | Existing apex deployment still works; unauthorized origin access fails. |
| 2. Build both targets | Astro Worker, app Worker, legacy redirects, app consent routing, crawlable catalog presentation and purchase handoff. | Both builds and runtime tests pass without changing product business rules. |
| 3. Separate deployment | Add independent protected Worker deployment jobs and release records. Keep GCP backend delivery intact. | Reproducible artifacts, explicit environments and no duplicate production deployer. |
| 4. Validate staging | Deploy to isolated staging hosts and backend/test data. Exercise the full route/auth/billing/MCP matrix. | Automated and external gates are separately recorded; unresolved gates block production. |
| 5. Cut over | Execute Section 11 with operator approval. Keep rollback artifacts and temporary redirects. | Production acceptance and working rollback path. |
| 6. Remove superseded runtime | Remove frontend containers, stale CI/configuration and duplicate routing after the stability gate. Update canonical docs. | No remaining production dependency on the old frontend-serving layer. |

### Build and deployment rules

The existing commands below are baseline commands, not a finished deployment recipe. Confirm them against the implementation commit; update canonical scripts rather than hiding commands only inside a workflow. [R15]

```bash
pnpm --dir frontend install --frozen-lockfile
pnpm --dir frontend build          # existing Astro build
pnpm --dir frontend build:vite     # existing product build
pnpm --dir frontend exec tsc --noEmit
pnpm --dir frontend check:contract
pnpm --dir frontend check:bundle
```

Add explicit build/deploy commands for each Worker. Proposed names such as `build:marketing`, `build:app`, `deploy:marketing` and `deploy:app` are **new interfaces to implement and test**, not commands assumed to exist. Each deploy command must select the correct source/generated Wrangler configuration and environment without relying on auto-detection from the repository root.

Keep two checked-in configuration owners, proposed at `frontend/apps/marketing/wrangler.jsonc` and `frontend/apps/app/wrangler.jsonc`. Generated adapter output is an artifact, not a second hand-edited configuration source. Inspect the effective environment, entrypoint, assets directory, routes and bindings during CI; the marketing adapter’s generated configuration must not be replaced by an older generic Wrangler example.

Pin package manager, lockfile, Wrangler and the reviewed compatibility date. A compatibility date must not change automatically with every build. Generate and check Worker environment types; do not silence runtime differences with `any`, broad `@ts-ignore` or weakened TypeScript settings.

Build each changed target. A shared component, public asset, origin helper, dependency or shared proxy change can require both targets to rebuild. A marketing-only change must not redeploy the database or quiesce backend writers. A product-only change must not rebuild the marketing container. A passing root build alone is not proof both targets built.

Use existing CI/test admission rules. Run targeted component/runtime tests for the changed contracts, then the required lint, formatting, type, contract and bundle gates. Backend auth/MCP changes require backend lint/type checks and their focused tests. Do not write dozens of trivial tests or bypass existing safety tests to keep the diff small.

Production GitHub Actions must use protected environments, least-privilege Cloudflare tokens, per-target concurrency and immutable release artifacts. No production secrets in untrusted PR jobs. Preserve GCP Workload Identity Federation and its existing approvals. Disable any competing Cloudflare dashboard Git auto-deployment for these same production Workers.

A release record must identify source commit, non-secret build configuration fingerprint, artifact hashes, Worker version/deployment identifiers and the compatible backend release. Reusing an artifact by commit alone is unsafe when public build variables changed. Do not dump environment contents into logs.

## 11. Deployment and rollback runbook

This runbook defines required sequencing. The implementing PR must turn it into tested repository commands in the canonical operations document. Account IDs, DNS records, secret identifiers and generated build paths must come from verified configuration, not this specification.

### 11.1 Pre-cutover record and safety checks

Create a deployment record in the protected release/PR system containing:

1. The current deployed commit and exact backend, marketing and app image digests; immutable copies of the old frontend asset outputs; the current Compose/Caddy files; secret **version references** and relevant non-secret runtime settings.
2. Current apex/app/origin DNS and Worker route associations, certificate coverage, SSL mode and effective cache/WAF/access rules. `app` and `origin` must be checked for conflicts before creation. Preserve email and unrelated DNS records.
3. Existing OAuth callback registrations, explicit redirect overrides, active payment/webhook endpoints, MCP discovery/issuer/resource metadata and an authorized client’s successful baseline read. Do not put live tokens in the record.
4. Baseline status/error checks and representative frontend timing/SSR CPU measurements where available; approved capacity and rollback triggers. Confirm that the normal backend backup is healthy, without treating this frontend change as a database migration.

Retain recoverable previous frontend artifacts for at least the seven-day stabilization window and until the operator accepts decommissioning. Preserve the versions required by the subsequent rollback policy as well. A source commit alone is not a rollback artifact when the old build may no longer reproduce.

### 11.2 Prepare origin and staging before public cutover

Provision and validate the protected origin hostname while the existing apex deployment remains live. Confirm that an unauthenticated origin request is rejected, an authenticated Worker request succeeds, forwarded public host/client identity is correct and database/backend ports remain inaccessible externally.

Create isolated staging deployments. Suggested names `staging.citeladder.com` and `staging-app.citeladder.com` are proposed only; verify their availability and certificate coverage. Use staging secrets, callback registrations, backend data and host allowlists. Protect previews, prevent indexing and disable unnecessary public `workers.dev`/version-preview access. Do not point an unprotected preview at production sessions, customer data or payment credentials.

Run the acceptance matrix in Section 12 through deployed Workers, not only local Vite or Node. Verify the effective configuration and all generated bindings before approving them.

### 11.3 Prepare provider registrations and production app

Add new app callback URLs alongside old apex URLs in the existing provider applications. Verify approved JavaScript origins/return URLs only where those providers require them. Preserve the Google single-client setup. Record which providers are intentionally disabled rather than calling their skipped tests a pass.

Deploy the product Worker to its new production hostname and verify TLS, assets, health, route handling and backend reachability before making it the public login destination. A new app must not be advertised while the backend still generates incompatible callbacks.

Deploy backward-compatible backend changes before switching browser-origin configuration. Pin MCP to the apex throughout. Retain old callback registrations and transition code for in-flight transactions; drain or explicitly restart them without bypassing verification.

### 11.4 Coordinated cutover

With explicit operator approval:

1. Confirm the protected origin and both production artifacts are ready. Record the exact prior routing/configuration immediately before the change.
2. Activate the app browser origin in backend configuration and effective provider overrides; keep `MCP_PUBLIC_BASE_URL` fixed. Ensure the new app-host login/callback/consent flow works before marketing links point to it.
3. Attach the marketing Worker to the apex with its preserved protocol/API routes and temporary old-page redirects. Inspect existing DNS and overlapping Worker routes when using Custom Domains; do not delete the old apex record or attach a wildcard blindly. Custom-domain setup is a separate routing operation, not merely uploading a Worker version. [C9]
4. Switch public app links, catalog handoff and metadata to their intended origins. Do not redirect webhook, token, API or OAuth callback POSTs. Keep old fingerprinted asset URLs available during the transition.
5. Run the production acceptance gate immediately. Keep the old frontend services and their rollback files intact until the stabilization/decommission gate; they must not receive normal new frontend traffic.

Do not edit MX, SPF, DKIM, DMARC or unrelated Cloudflare settings as part of this cutover. Do not disable a security control globally to repair one failing path.

### 11.5 Acceptance and stabilization

Check unauthenticated raw HTML, app login, legacy links with project context, OAuth sign-in/integrations, MCP existing and new clients, catalog handoff, authorized purchase continuation and webhook handling. Use approved sandbox/fixture methods for payment validation; do not initiate an unapproved real charge.

Monitor by hostname and route family: Worker exceptions, CPU limit failures, origin errors, auth/callback failures, consent failures, missing chunks and incorrect redirects. Use redacted request IDs to correlate Worker and origin failures. Compare frontend delivery with the baseline; do not present backend latency as a frontend-hosting improvement without evidence.

After seven stable days and owner acceptance, finalize eligible legacy browser redirects and decommission the superseded serving layer. A failed security, checkout or integration gate blocks completion even when the homepage looks correct.

### 11.6 Rollback: choose the narrowest safe action

| Failure | Rollback action |
|---|---|
| A later release of one Worker regresses | Restore that Worker’s last accepted version/artifact and repeat the affected acceptance checks. Keep the other Worker and GCP services unchanged. |
| First migration fails before acceptance | Restore the captured apex routing and the exact previous Caddy/frontend runtime artifacts; restore the compatible backend browser-origin configuration. Keep the app host available as needed to handle active app-host API requests and safely return browser GET/HEAD navigation to the old site. |
| A callback/configuration change fails | Restore the previous verified origin/override and provider registration combination. Do not bypass nonce/CSRF validation or send callbacks across hosts indiscriminately. |
| Origin credentials or forwarding fails | Restore the previously accepted credential/header configuration using version references. Do not expose the backend or disable TLS validation. |

A Worker rollback does not restore DNS associations, secrets, provider settings, GCP configuration or database state. Track and restore these separately where required. [C10]

During first-migration rollback, disable the opposite redirect direction before adding an app-to-apex browser bridge; prevent redirect loops. Never redirect `/api` mutations as a generic fallback. App-host sessions do not become apex sessions; a fresh login may be required again. Preserve payment/MCP identities and existing backend records.

**Do not restore a database backup to undo a frontend deployment.** This plan introduces no required schema change. Any separate schema migration and possible data-loss restore needs its own approved recovery procedure.

Rehearse both a Worker-version rollback and the first-migration route/configuration rollback in staging. Record the actual commands and identifiers. After permanent browser redirects have been issued, cached redirects make a full hostname reversal less predictable; prefer restoring a working Worker implementation rather than relying on clients to forget a permanent redirect.

### 11.7 Decommission only after the rollback gate

Remove the old marketing Node and app Caddy **frontend** containers from normal production deployment, their image-build/push jobs, frontend health dependencies, runtime ports and frontend-only configuration. Remove dead package dependencies and commands once no supported workflow needs them.

Keep the GCP VM, backend Caddy ingress, FastAPI, PostgreSQL, jobs, secrets, backup timers, Artifact Registry entries still needed for rollback, firewall and IAP administration. Do not run Terraform destroy, delete persistent disks, remove database volumes or dismantle the existing backend deployment pipeline.

Remove the old Astro-versus-Vite Caddy dispatcher from production after its compatibility duties have moved to the Workers. Retain only one finite legacy redirect map and the required release assets. Archive rollback artifacts rather than keeping two indefinitely maintained production frontend implementations.

## 12. Acceptance matrix: evidence required before completion

Reuse existing tests where they already own a contract. Add focused regression coverage for the new boundary, not duplicate suites for every helper. Record automated results separately from provider-console and real-client acceptance.

| Contract | Required evidence |
|---|---|
| Marketing crawlability | Raw GET and JavaScript-disabled browser checks for homepage, pricing, a product/commercial page, docs, article and legal page. Substantive content, metadata and links exist before hydration. |
| Public catalog | SSR includes real public catalog data, with a deterministic country/currency treatment and matching hydrated initial state. Unavailability is explicit; no invented prices. |
| Status and asset integrity | Unknown public routes return 404; missing JS/CSS/font/image requests never return a 200 HTML document. MIME types are correct. |
| Reserved routing | `/api`, callbacks, consent, token/discovery and webhook paths remain server-owned for fetch, browser navigation and supported POSTs. Test navigation headers as well as XHR. |
| Legacy links | Exact and dynamic old app links reach the right app page with project/workspace/invitation context; unknown descendants do not accidentally redirect. No app/apex loop. |
| Browser sessions | Fresh app login, reload, logout and session invalidation work. Cookies remain host-only and HttpOnly where intended. The apex cannot read an app session. |
| Authorization and CSRF | Two users/workspaces remain isolated. Invalid Origin/CSRF/return paths fail closed. Changing a hostname does not change backend authorization. |
| OAuth | Google sign-in and each enabled integration complete through registered app callbacks with transaction binding intact. Disabled/unimplemented providers remain disabled. |
| MCP continuity | Existing grant/client remains valid on the apex; new authorization uses app login/consent. Approval, denial, refresh, revocation and membership changes retain their semantics. |
| Purchase continuation | Anonymous selection crosses to the app, survives login and is revalidated. Tampered selection cannot set price or permissions. GET/reload does not purchase; uncertain retries retain idempotency. |
| Webhooks and payment returns | Existing URL and raw-body signature verification work; duplicate delivery is handled by the existing owner. No cross-host POST redirect. |
| Proxy transport | Multiple cookies, manual redirects, authorization headers, upload/download bytes, streaming endpoints and cancellations survive the Worker/ingress chain. |
| Origin protection | Direct unauthenticated origin access fails. Spoofed internal headers cannot impersonate a Worker or customer. Real client identity reaches rate limiting correctly. |
| Cache/privacy | Two independent sessions cannot receive each other’s data. App/auth/consent responses are not public cached. Host-specific robots/noindex policy does not leak to marketing. |
| Deployment | Both required artifacts build, runtime tests use Workers, secrets are absent from public output, and a configuration-only change produces the intended deployment. |
| Recovery | Worker-version rollback and first-cutover routing/configuration rollback are rehearsed without database restoration or broken protocol identities. |

Production probes must use safe test accounts and approved test data. A mock provider or local component test cannot establish production OAuth, payment-provider or third-party MCP-client acceptance. Mark unavailable checks **not executed**, with a concrete gate owner; never relabel them as passed.

## 13. Targeted debt removal and documentation ownership

### 13.1 Code and deployment cleanup map

The paths below are existing owners to inspect, not an instruction to delete every file. Confirm live consumers and preserve supported development/test workflows before removal.

| Area | Files/owners | Required cleanup |
|---|---|---|
| Marketing runtime | `frontend/apps/marketing/astro.config.mjs`, its middleware, `frontend/Dockerfile`, `frontend/package.json` | Replace Node runtime/proxy assumptions; remove `@astrojs/node` and standalone Node start/build delivery when unused. Keep marketing rendering/content intact. |
| App delivery | `frontend/apps/app/Dockerfile`, `frontend/apps/app/Caddyfile`, `server-proxy.ts`, `vite.config.ts` | Remove superseded production container serving. Keep local development proxy behavior or replace it with the tested equivalent; preserve chunk/bundle controls. |
| Shared ingress | `frontend/Caddyfile`, `infra/gcp/runtime/frontend-routes.caddy`, production `Caddyfile` | Remove duplicated Astro/Vite route switching after cutover; retain secured backend ingress. One legacy redirect map only. |
| VM deployment | `infra/gcp/runtime/compose.gcp.yml`, `deploy-vm.sh` | Remove frontend services, image variables, frontend-only health dependencies and ports without breaking backend recovery, backups or worker startup. |
| CI | `.github/workflows/gcp-demo-deploy.yml`, `ci.yml`, `compose-smoke.yml` | Split frontend deployment from GCP; update affected smoke tests/path filters. Do not delete backend deployment or general quality gates. |
| Origins and links | Frontend configuration/navigation owners; backend callback/configuration owners | Remove ambiguous touched origin aliases and stale absolute app URLs. Distinguish website, app, MCP and backend origins explicitly. |
| Auth and pricing | Cookie helpers, marketing auth hints, pricing presentation/capture consumers | Remove obsolete cross-surface coupling; retain one session owner, one public catalog and one purchase implementation. |
| Tooling and comments | Affected scripts, types, dependency graph and active docs | Remove stale Next rewrites/Cloud Run assumptions, dead generated-file references, unused imports and obsolete commands. Do not weaken checks or add parallel compatibility frameworks. |

New Worker files/configurations must use the existing ownership structure. A small server-only shared module is justified; a new monorepo platform, app-shell abstraction, generic gateway framework or duplicated route catalog is not.

Do not leave both Pages and Workers deployment definitions for CiteLadder “just in case.” Do not retain both old and new environment names indefinitely. Any temporary compatibility entry needs an owner, removal condition and date in the migration record.

### 13.2 Update canonical documents, not a pile of parallel reports

`docs/README.md` is the existing owner index. Update a document when its actual contract or procedure changes; do not append this entire plan into every guide. Routine validation evidence belongs in the PR/CI record. [R13]

| Canonical owner | Update required when the change ships |
|---|---|
| `docs/architecture.md` | Two frontend Workers, public origins and unchanged GCP compute/data ownership. |
| `docs/frontend-architecture.md` | SSR/prerender policy, app SPA delivery, route precedence, public configuration, cache and asset boundaries. |
| `docs/workspace-access.md` | Host-only app sessions, origin-change re-login, browser navigation and invitation destinations. |
| `docs/mcp.md` | Stable apex protocol identity versus app browser login/consent; real-client acceptance requirements. |
| `docs/billing-entitlements.md` | Public pricing presentation versus authenticated app purchase continuation and untrusted handoff. |
| `docs/integrations-traffic-analytics.md` | Effective callback origins and provider setup changes; retain existing credential ownership. |
| `docs/operations/GCP_RUNBOOK.md`, `docs/operations/GOOGLE_CLOUD.md`, `infra/gcp/README.md` | Remaining backend/VM deployment, protected origin, removed frontend steps and corrected recovery procedure. |
| **Proposed new** `docs/operations/WORKERS_RUNBOOK.md` | Sole Worker operator procedure: environment inputs, tested build/deploy commands, domain attachment, smoke checks, logs, rollback and cleanup gates. |
| `docs/DEVELOPMENT.md`, `CONTRIBUTING.md`, `docs/release-checklist.md` | Only changed setup/validation commands and external release acceptance gates. |
| `docs/decisions.md` | Accepted cross-feature choices: Workers, subdomain, rendering, host-only sessions, stable MCP identity and ownership separation. |
| `docs/README.md`, `docs/plans/ACTIVE.md` | Link the new operations owner and track the assigned migration’s real status. Do not treat a plan index as permission to deploy. |

Update `AGENTS.md` only if its bootstrap/routing instructions actually change; do not turn it into another migration manual. Correct inbound links when retiring documents. Do not rewrite unrelated archived evidence as though it describes the new deployment.

If this specification is added to the repository, a suitable **proposed** path is `docs/plans/cloudflare-workers-migration.md`. Mark it as a plan, and on completion move durable behavior into the canonical owners above rather than maintaining competing sources of truth.

## 14. Sol execution contract and completion criteria

### Non-negotiable prohibitions

Do not infer live infrastructure, account permissions, enabled providers or successful deployment from source files. Do not downgrade Astro for Pages, replace the product framework, share authentication cookies across all subdomains, move MCP identity implicitly, redirect protocol POSTs, blanket-cache SSR/API responses, or introduce a second authentication/billing/database layer.

Do not publish production automatically merely because the document contains a runbook. Implementation, staging validation, production cutover and destructive cleanup are separate gates. Missing operational permissions block the operational step, not the ability to finish a reviewable implementation.

### Completion is four distinct states

| State | Required result |
|---|---|
| **Implementation ready** | Reviewed code, both builds, scoped regression coverage, updated configuration contracts and tested operator commands. |
| **Staging accepted** | Deployed Worker runtime and integration tests demonstrate the new boundaries; remaining external gates are explicit. |
| **Production accepted** | Operator-approved cutover, production route/auth/crawlability/MCP/billing checks and recoverable prior artifacts. |
| **Migration closed** | Stability gate passed, old production frontend runtime/debt removed and canonical documentation matches what is actually deployed. |

Sol’s handoff must state the achieved state, changed ownership boundaries, actual test commands/results, unexecuted external checks, required configuration names without secret values, release/rollback references and temporary compatibility items still retained. “Frontend migration complete” is not an acceptable substitute for these distinctions.

### Implementation kickoff

> Read `AGENTS.md`, `docs/README.md`, this specification and the smallest affected canonical owners. Reconcile the current commit and deployed configuration with the verified baseline. Implement the fixed target architecture in reviewable phases, preserving business rules and protocol identities. Resolve unknown infrastructure values from authorized inspection rather than guessing. Run proportional tests and both affected builds. Update the existing documentation owners and provide the exact tested deployment/rollback commands. Do not cut over production or remove rollback infrastructure until the corresponding operator gate is explicitly authorized.

## 15. Evidence and reference links

Repository links below identify the reviewed owners on the default branch; they are not immutable release pins. The implementing agent must record its exact commit. Platform references were checked on 22 September 2026; use the documentation matching the versions actually locked during implementation.

### Repository sources

Infrastructure and deployment: [R1], [R2], [R14]. Frontend build/rendering: [R3], [R4], [R12], [R15], [R16]. Authentication and MCP: [R5], [R6], [R7], [R8], [R9], [R17], [R19]. Billing: [R10], [R11], [R18]. Documentation ownership: [R13].

[R1]: https://github.com/Cube-27/Citeladder/blob/main/infra/gcp/README.md
[R2]: https://github.com/Cube-27/Citeladder/blob/main/infra/gcp/runtime/frontend-routes.caddy
[R3]: https://github.com/Cube-27/Citeladder/blob/main/frontend/apps/marketing/astro.config.mjs
[R4]: https://github.com/Cube-27/Citeladder/blob/main/frontend/apps/app/vite.config.ts
[R5]: https://github.com/Cube-27/Citeladder/blob/main/backend/app/api/browser_cookies.py
[R6]: https://github.com/Cube-27/Citeladder/blob/main/backend/app/core/config/mcp.py
[R7]: https://github.com/Cube-27/Citeladder/blob/main/backend/app/domain/mcp/oauth_provider.py
[R8]: https://github.com/Cube-27/Citeladder/blob/main/backend/app/domain/mcp/server.py
[R9]: https://github.com/Cube-27/Citeladder/blob/main/backend/app/core/config/oauth.py
[R10]: https://github.com/Cube-27/Citeladder/blob/main/frontend/components/marketing/pricing/pricing-catalog.tsx
[R11]: https://github.com/Cube-27/Citeladder/blob/main/frontend/lib/billing/pending-pricing-intent.ts
[R12]: https://github.com/Cube-27/Citeladder/blob/main/frontend/apps/marketing/src/pages/pricing.astro
[R13]: https://github.com/Cube-27/Citeladder/blob/main/docs/README.md
[R14]: https://github.com/Cube-27/Citeladder/blob/main/docs/operations/GCP_RUNBOOK.md
[R15]: https://github.com/Cube-27/Citeladder/blob/main/frontend/package.json
[R16]: https://github.com/Cube-27/Citeladder/blob/main/frontend/apps/marketing/src/pages/index.astro
[R17]: https://github.com/Cube-27/Citeladder/blob/main/docs/workspace-access.md
[R18]: https://github.com/Cube-27/Citeladder/blob/main/frontend/lib/config/billing.ts
[R19]: https://github.com/Cube-27/Citeladder/blob/main/docs/mcp.md

### Platform sources

Platform and adapter: [C1], [C2], [C3]. Assets, routing and headers: [C4], [C5], [C6]. Billing and limits: [C7], [C8]. Domain attachment, rollback and forwarding: [C9], [C10], [C11]. Crawlability: [C12], [C13]. Browser cookie/storage boundaries: [C14], [C15].

[C1]: https://developers.cloudflare.com/pages/
[C2]: https://docs.astro.build/en/guides/integrations-guide/cloudflare/
[C3]: https://developers.cloudflare.com/workers/framework-guides/web-apps/astro/
[C4]: https://developers.cloudflare.com/workers/static-assets/routing/worker-script/
[C5]: https://developers.cloudflare.com/workers/static-assets/headers/
[C6]: https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/
[C7]: https://developers.cloudflare.com/workers/platform/pricing/
[C8]: https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/
[C9]: https://developers.cloudflare.com/workers/configuration/routing/custom-domains/
[C10]: https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/
[C11]: https://developers.cloudflare.com/fundamentals/reference/http-headers/
[C12]: https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics
[C13]: https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag
[C14]: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie
[C15]: https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage
