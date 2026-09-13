# Frontend migration — Next.js to Vite and Astro

## Target architecture

- `frontend/` remains the single frontend dependency, tooling, component, API,
  query, design-token, and public-asset owner. The migration does not create a
  second design system or product-state layer.
- `frontend/apps/app/` owns the authenticated Vite entry, React Router Data Mode
  route tree, and application build. `frontend/apps/web/` later owns the Astro
  marketing entry and static build. Existing framework-neutral code under
  `frontend/components/` and `frontend/lib/` is reused and migrated in place.
- One browser-router root retains one document-wide `QueryClient`. Below it,
  the authenticated route boundary retains one `ProjectProvider`,
  `SessionGuard`, and `EntitlementProvider` lifetime across `/projects`,
  `/onboarding`, and all authenticated product routes; `/login` and `/register`
  remain outside those providers. The application shell remains below session
  and entitlement gates; onboarding remains shell-free without remounting the
  authenticated identity providers.
- TanStack Query remains the sole server-state and request-lifecycle owner.
  React Router owns matching, parameters, navigation, and error/not-found route
  boundaries; router loaders do not duplicate component-owned API reads.
- Browser APIs and event streams remain credentialed relative requests. Vite
  development proxying and production ingress keep `/api/*`, `/mcp` and
  `/mcp/*`, `/authorize`, `/token`, `/revoke`, and OAuth well-known endpoints
  on FastAPI. Browser `/register` remains the account-registration route;
  dynamic MCP registration remains `/mcp/register`.
- Final production ingress serves explicit application paths with Vite SPA
  fallback, serves Astro marketing output as static routes, and sends
  backend-owned paths directly to FastAPI. The static frontend server owns a
  no-store `/health` liveness response; Astro owns
  `/manifest.webmanifest`, `/llms.txt`, `/robots.txt`, and `/sitemap.xml`.
  `BACKEND_ORIGIN` remains server-side; no browser CORS configuration is
  introduced.
- A narrowly scoped Vite-only compatibility alias may unblock an incremental
  route slice, but it must be listed when introduced, may not become a product
  abstraction, and must be deleted at authenticated-app cutover. All remaining
  Next migration scaffolding is deleted with the Next runtime.

## Non-negotiable invariants

- Preserve URLs, session-cookie and session-version semantics, full-document
  post-login reset, logout failure behavior, global downstream-401 expiry,
  query-cache clearing, project/workspace authorization, billing, and visual
  design unless a phase names a user-visible correction.
- Preserve workspace selection precedence, project selection precedence,
  canonical `?project=` / `?workspace=` history semantics, project-detail
  authority over stale lists, and scope-bearing query keys. No project or
  workspace data may survive an identity transition into another scope.
- Preserve one provider lifetime between onboarding and the application. A
  newly committed project is fetched, seeded into the correct workspace list,
  persisted, and selected before `/projects?project=<uuid>` opens.
- Reads remain persisted projections. Migration work does not change backend
  APIs, authorization, lifecycle truth, billing behavior, or provider calls
  without a separately evidenced source defect.
- Initial, empty, unavailable, forbidden, failed, stalled, background-refresh,
  and retained-data states remain distinct. Stable geometry must not expose
  stale cross-project evidence or make empty copy appear before a successful
  empty response.
- Keep the current CSP coverage for Razorpay routes, global ingress security
  headers, local Geist assets, canonical/OG/Twitter/JSON-LD output, analytics,
  robots, sitemap, manifest, `llms.txt`, and health behavior.
- No new global state system, query layer, design system, navigation facade,
  duplicate route architecture, or speculative performance optimization.
- No autonomous publishing, deployment, payment activation, database reset, or
  external mutation is authorized by this plan.

## Current phase

**Phase 2 — Vite foundation.** The migration contract and bounded Next
stabilization are committed. Next feature architecture is frozen: subsequent
changes to authenticated product behavior belong to the Vite route migration,
except for a source defect that independently blocks parity.

The ordered execution is:

1. Stabilize only verified Next runtime gaps: auth URL/content consistency,
   session-expiry navigation, project-creation progress/recovery timing, and
   stable initial geometry on Overview, Issues, and Demand.
2. Add `frontend/apps/app/`, the Vite/React Router root, and same-origin
   development/production serving path; prove the runtime before product
   migration.
3. Migrate the critical vertical: login, session bootstrap, projects,
   workspace/project URL state, onboarding, persisted creation, and Overview.
4. Migrate product routes in reviewed batches: Site Health + Issues; Demand +
   Performance; Opportunities + Visibility + Runs; Prompts + Content + Commerce
   + AI Referrals; Settings + Billing + remaining account utilities.
5. Cut authenticated traffic to Vite only after the engineering, browser, and
   performance-comparison gates pass. Delete authenticated Next route ownership
   and all Vite compatibility aliases at this cutover.
   During Vite/Next coexistence, ingress sends `/login`, `/register`,
   `/projects`, `/onboarding`, and every authenticated product/account path to
   Vite; sends backend protocol paths to FastAPI; and leaves marketing routes,
   generated public endpoints, `/_next/*`, public assets, unknown-route 404s,
   and the frontend `/health` probe on Next.
6. Add `frontend/apps/web/`, migrate marketing/static routes to Astro, preserve
   metadata and analytics, and hydrate only interactive islands.
7. Delete Next, its App Router tree, configuration, standalone runtime,
   workarounds, tests, dependencies, and all remaining migration scaffolding.
8. Profile the final Vite application and implement only evidence-backed
   query, render, bundle, or interaction performance fixes.

## Completed phases

- **Phase 0 — migration contract (2026-09-13):** current auth/navigation,
  loading/performance, framework, deployment, metadata, and endpoint ownership
  mapped from code and tests. The target ownership and cutover order above are
  authoritative.
- **Phase 1 — Next stabilization (2026-09-13):** confirmed session expiry now
  clears account state before full-document sign-in navigation; confirmed
  project creation immediately shows page-level persisted progress; completion
  request, worker, and route-handoff durations have separate observability; and
  Overview, Issues, and Demand reserve screen-shaped initial geometry. Focused
  frontend/backend tests and controlled Chromium acceptance passed.

## Known unresolved issues

- Controlled Chromium now proves cold login, confirmed-401 navigation,
  recoverable non-401 session verification, delayed project creation, exact
  created-project handoff, direct Overview loading, and delayed Issues/Demand
  loading. Logout success/failure and browser-observed cookie/cache/storage
  destruction remain part of the authenticated cutover matrix; component tests
  currently own those transitions.
- Completion request and navigation-handoff durations are available as bounded
  User Timing entries; terminal completion attempts and queue-to-terminal
  completion durations are structured worker-log fields. Retry attempts never
  emit a falsely terminal duration. Fixture delays prove boundary separation,
  not production latency; real before/after values remain a Phase 5 cutover
  measurement.
- Cold direct entries have no in-memory prefetch cache. Issues and Opportunities
  intentionally retain dependent first-paint request chains; flatten them only
  if post-migration traces show material cost without breaking coherence.
- Current full-auth Suspense exists for Next `useSearchParams`. Vite must keep
  structural private-content protection without translating that framework
  bailout into a second shell or blank fallback.
- Production route ownership is split between current Next rewrites and GCP
  Caddy. Root `/register` is a browser signup route in production even though
  Next currently also declares a backend rewrite; the cutover must keep browser
  signup and `/mcp/register` distinct.
- Marketing currently depends on Next metadata/static-param APIs, Image, Script,
  local font integration, cache headers, and public generated endpoints. Those
  stay on Next until the Astro phase rather than being optimized in place.

## Cutover gates

### Each implementation phase

- Inspect the complete phase diff, run only affected behavior tests, then run
  `./scripts/check.ps1` once for executable changes.
- Exercise the changed surface in a real browser. Record only flow/result,
  timing facts needed for a decision, and unresolved failures.
- Run an independent phase review for unintended behavior changes, duplicate
  architecture, compatibility wrappers, missed cleanup, and tests that assert
  implementation rather than observable behavior.
- Update this document, commit the phase, and checkpoint the next phase from
  this state. Do not overlap validation or begin a dependent phase before its
  gate passes.

### Vite foundation

- Vite production build loads with initial CSS; direct application-route refresh
  returns the SPA; relative `/api/v1` and SSE requests remain same-origin;
  session cookies reach FastAPI; backend-owned MCP/OAuth/well-known paths bypass
  the SPA; browser `/register` remains reachable.

### Critical vertical

- Cold login has no black/private flash or URL/content mismatch. The shell does
  not disappear or duplicate. Workspace/project bootstrap cannot spin forever.
- Project creation gives immediate page-level progress, survives refresh when
  persisted work permits recovery, opens the correct UUID, and retains provider
  continuity. Overview paints stable geometry before data.

### Authenticated application cutover

- Lint, typecheck, affected tests, production Vite build, and the repository
  check pass.
- Browser acceptance covers login, logout, cold login, hard reload, project and
  workspace switching, onboarding/creation, every product route, Site Health
  crawl, billing, and mobile navigation.
- Before/after evidence records initial JavaScript, CSS availability, time to
  shell, login-to-shell, route navigation, requests, API latency, layout shift,
  and material rerenders. Backend latency is not labeled a framework defect.
- No authenticated route or component depends on a Next compatibility alias.
- The coexistence ingress route table sends every application/auth direct
  refresh to Vite, backend protocol routes to FastAPI, and all still-Next
  marketing/generated/public paths plus unknown-route handling to Next.

### Astro and final deletion

- Marketing browser and SEO acceptance covers every public route, canonical and
  social metadata, JSON-LD, analytics, robots, sitemap, manifest, `llms.txt`,
  cookies, fonts/assets, CSP, and the known concurrent-animation case. The
  replacement static frontend `/health` returns process liveness with
  `Cache-Control: no-store`, and the container probe no longer depends on Next.
- `next`, `@next/*`, `next.config.ts`, the App Router tree, standalone server,
  `.next` handling, SWC/Turbopack/prefetch workarounds, dead Next tests, and all
  temporary migration adapters are absent. Dead-code/dependency tooling and the
  final engineering/browser gates pass before migration completion.
