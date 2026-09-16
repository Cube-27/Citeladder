# Frontend migration — Next.js to Vite and Astro

## Target architecture

- `frontend/` remains the single frontend dependency, tooling, component, API,
  query, design-token, and public-asset owner. The migration does not create a
  second design system or product-state layer.
- `frontend/apps/app/` owns the authenticated Vite entry, React Router Data Mode
  route tree, and application build. `frontend/apps/marketing/` owns Astro
  marketing SSR and its build. Existing framework-neutral code under
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
  fallback, serves Astro marketing SSR for remaining public routes, and sends
  backend-owned paths directly to FastAPI. The Astro marketing server owns a
  no-store `/health` liveness response; Astro owns
  `/manifest.webmanifest`, `/llms.txt`, `/robots.txt`, and `/sitemap.xml`.
  `BACKEND_ORIGIN` remains server-side; no browser CORS configuration is
  introduced.
- The completed runtime has no Vite compatibility aliases or Next migration
  scaffolding. Future work must not reintroduce either.

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

**Implementation complete — final validation pending.** Astro owns marketing
SSR, Vite owns authenticated routes, Caddy provides same-origin routing, and
the Next runtime and migration compatibility layer are removed. Final
engineering, browser, and performance validation remains required before this
migration is marked complete.

Final validation must prove both builds, same-origin Caddy ownership, direct
authenticated refreshes, public-route SSR/SEO behavior, and the required
engineering, browser, and performance gates.

## Completed phases

- **Phase 0 — migration contract (2026-09-13):** current auth/navigation,
  loading/performance, framework, deployment, metadata, and endpoint ownership
  mapped from code and tests. The target ownership and cutover order above are
  authoritative.
- **Phase 1 — Next stabilization (2026-09-13):** session expiry, project
  creation progress, route-handoff observability, and stable initial geometry
  were established before the runtime migration. Focused coverage and controlled
  browser observations were recorded.
- **Phase 2 — Vite foundation (2026-09-13):** `frontend/apps/app/` established
  the React Router application under the existing dependency, API, query,
  style, font, and asset owners. Development proxying and the Caddy container
  established same-origin API/session transport, backend MCP/OAuth ownership,
  browser `/register`, direct SPA refreshes, and a no-store `/health`.
- **Phase 3 — critical Vite vertical (2026-09-14):** real `/login`,
  `/register`, `/projects`, and `/onboarding` routes replaced the temporary
  route. The Vite tree retained its QueryClient, bootstrap, session gate,
  shell, URL state, and persisted-creation handoff; focused coverage and a
  controlled login-to-Overview observation were recorded.
- **Phase 4 — product route batches (2026-09-14):** Vite took ownership of
  Website, Issues, Demand, Performance, Opportunities, Visibility, Runs,
  Prompts, Content, Commerce, AI Referrals, Settings, and invitation
  acceptance while retaining existing shared behavior owners.
- **Final implementation — Astro, ingress, and runtime deletion (2026-09-14):**
  Astro SSR owns marketing/public routes, Vite owns authenticated routes, and
  Caddy routes both surfaces and backend-owned paths at one origin. The Next
  runtime, App Router tree, dependencies, and temporary compatibility adapters
  are removed. Final validation is pending.
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
  not production latency; real before/after values remain a final-validation
  measurement.
- Cold direct entries have no in-memory prefetch cache. Issues and Opportunities
  intentionally retain dependent first-paint request chains; flatten them only
  if post-migration traces show material cost without breaking coherence.
- Final validation must confirm that no Next dependency or compatibility import
  remains, root `/register` remains a browser signup route, and
  `/mcp/register` remains the distinct dynamic MCP registration endpoint.

## Validation gates

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

### Completion record — 14 September 2026

- The repository check ran once. Its migration failures were corrected, then
  each failed gate was rerun directly: lint, TypeScript, complexity, dead-code,
  Astro production build, and Vite production build pass.
- Authenticated Vite acceptance covered the migrated route matrix during the
  cutover; the final built preview also rendered `/login`. Astro browser smoke
  rendered `/`, `/blog`, a dynamic article, manifest, `llms.txt`, and no-store
  health responses with no page errors after the marketing query-provider fix.
- Product-route splitting reduced the initial Vite JavaScript entry from
  1,586.69 kB to 457.90 kB raw and from 462.26 kB to 139.80 kB gzip. CSS stayed
  150.43 kB raw / 27.74 kB gzip. Astro hydrates only interactive islands;
  content-hashed Astro and Vite assets receive immutable cache headers.
- Caddy sends bounded authenticated direct refreshes to Vite, backend protocol
  routes to FastAPI, and public/unknown routes to Astro. Independent final
  review found and closed the marketing Docker stylesheet-copy gap and the
  Vite `/app-assets/*` missing-chunk fallback/cache bug; no P0-P2 findings remain.
- `next`, `@next/*`, `next.config.ts`, the App Router tree, standalone server,
  `.next` handling, compatibility adapters, and obsolete route tests/fixtures
  are absent. Clean container builds remain a CI responsibility.
