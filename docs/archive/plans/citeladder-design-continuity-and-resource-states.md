# Design continuity and resource states — Terra High implementation plan

## Status and execution boundary

Completed on 13 September 2026. All six slices, affected owner documentation,
focused unit coverage, and controlled browser acceptance are delivered.
Prepared for **Terra with High reasoning** from the supplied “Verified Issue
Report — Design Consolidation & Performance”. This document is an implementation
handoff; registering it does not execute the work or change model settings.

Verification baseline: `64588a77`, with a clean working tree before this plan.
Implementation verification used deterministic unit/MSW coverage and authenticated
Playwright fixtures for shell continuity, Site Health retry, Opportunities
history/reload, and Performance first-use/zero/partial states. No live providers,
deployment, or performance measurement was run.
Report P0/P1 labels below denote delivery priority, not verified incident severity.

The [runtime correctness plan](citeladder-runtime-correctness-and-continuity.md)
remains active for its recorded acceptance and measure-gated Slice 5 work.
Its Slices 0–4 are recorded as delivered. This plan owns the remaining shell,
resource-state, URL-state, and presentation changes described here; do not rerun
the previous slices or absorb their SSE/deployment acceptance. The existing
integrations and payment queue remains unchanged.

## Intended outcome

Keep application structure understandable while authorized context resolves;
make failed reads recoverable without unnecessarily removing usable evidence;
make Opportunities filters and selected evidence addressable; and replace
unhelpful pre-data scaffolds with truthful, actionable states.

Preserve the existing visual system and domain ownership. This is frontend
continuity work, not a new design system, evidence model, or performance claim.

## Verification decisions

Paths in this table are relative to `frontend/`. Symbols are the primary
locators because line numbers will change during implementation.

| Report finding | Verified current behavior and correction | Planned disposition |
|---|---|---|
| 1. Shell-less cold loading, P0 | `app/(authed)/layout.tsx` uses `ShellFallback` for Suspense and SessionGuard. `app/(authed)/(app)/layout.tsx` places `OnboardingGate` outside `AppShell`; the gate waits for project context and entitlement. `components/layout/shell-fallback.tsx` is a canvas plus PageLoading. Its claim that project waits occur inside the shell contradicts the actual layout. | Slice 1: separate safe pre-session structure from the authenticated shell and content gate. |
| Cold query cache as root cause | `lib/providers/query-provider.tsx` creates one client per provider mount; `lib/api/query-client.ts` sets 60-second freshness and 30-minute retention. A hard reload has no persisted query cache, but this does not prove persistence is needed. Project reads already run alongside session resolution. | Preserve provider lifetime and concurrent reads. No browser query persistence or additional cache layer. |
| 2. Website and Issues error takeover, P0 | `screenBlockingState` in `components/site-health/site-health-screen.tsx` blocks on either query error regardless of cached data. `components/site-health/issues-screen.tsx` chooses its error branch before its crawl/catalog branch. Neither failure offers retry. The existing Website test explicitly checks that entitlement failure removes tabs. | Slice 2: distinguish initial failure, refresh failure, and access failure; preserve safe content and add read recovery. |
| No placeholder means no stale-data path | Dashboard/entitlement factories lack `placeholderData`, but that option concerns observer transitions between query keys. The screen's unconditional error branches are the demonstrated defect; absence of that option is not proof that a same-key cached result disappears. | Exercise a real QueryClient success → failed refetch path. Do not add broad keep-previous-data as the fix. |
| Commerce counterexample | `components/products/catalog-header.tsx` keeps its catalog composition and displays an inline failure. With a known crawl its button refetches dashboard/catalog; without a crawl the same control calls `createCrawl`. | Reuse the continuity principle, not that conditional mutation button, for read retry. |
| Missing resource-state primitive | `Alert` accepts React children, so it already composes with Button; Overview and AI Referrals contain working retry compositions. There is no dedicated action prop, but that does not prevent composition. | Extend existing primitives with one narrow shared read-error presentation used by Website and Issues, not a universal query framework. |
| 3. Opportunities URL/history, P0 | `useCatalogFilters` and `selectedId` in `components/opportunities/opportunities-catalog.tsx` use local state; the pager is local too. `lib/navigation/url-state.ts` already supplies typed codecs and push/replace updates. | Slice 3: adopt the existing owner with an explicit URL contract. |
| Additional broken handoffs | `components/projects/dashboard-primitives.tsx` links to `?selected=…`; `components/intelligence/opportunity-insight.ts` emits `?opportunity=…`. The catalog consumes neither. | Normalize both entry forms and consolidate internal link producers. |
| Drawer/back-forward assertions | Shared Drawer supports outside click and Escape; `components/ui/overlays.test.tsx` covers dismissal and focus restoration. No application URL restoration exists in this flow. A bfcache explanation remains a hypothesis without a browser trace. | Test Opportunities integration and real history. Do not redesign Drawer or claim a browser cause was reproduced. |
| 4. Performance pre-data scaffold, P1 | `components/performance/performance-screen.tsx` renders metrics/chart/GA4 row/breakdowns after initial query gates even with a null selected snapshot. The tab reservation is now owned by `performance-breakdowns.tsx`. `useRangeProjection` also handles null snapshots with concrete window bounds. | Slice 4: distinguish prerequisite, pending projection, range absence, measured zero, and partial evidence. |
| Performance dimensions | Six tabs represent GSC dimensions; GA4 is a separate summary row. Optional Bing is a separate panel beneath the GSC tables. | Preserve provider distinctions and exact snapshot/window identity. |
| 5. Empty-state outliers, P1 | Demand's no-snapshot 404 branch is an info Alert despite importing EmptyState. Movement uses a bordered `min-h-36` div. Visibility and AI Referrals already use shared empty components but retain toolbars above them; AI Referrals' unconditional toolbar is rendered in `ai-referrals-content.tsx`. | Slice 5: migrate the two outliers and retain only meaningful pre-data controls. |
| 6. Overview hierarchy, P1 | `/projects` is Overview. DashboardHeader includes Company facts before SummarySections; the summary starts with Next action and Track, then Project state and Movement. Ranked actions/proof follow, then TopInsights. | Slice 6: put state, movement, action, and supporting evidence in the canonical design order; move facts below decision content. |
| Top insights density | TopInsights renders a multi-column Insight grid, but passes `hideWhyThisMatters`; the report overstates the fields actually visible there. Insight is an existing shared evidence owner. | Preserve its evidence contract. Do not replace it with a second insight renderer. |
| 7. Loading fragmentation, P1 | PageLoading, Spinner, Skeleton, EmptyState and an existing delayed spinner policy already exist. BillingSkeleton is a remaining initial-load outlier. Other section skeletons and specific loading labels often have valid different meanings. | Fold bounded cleanup into Slices 1 and 5; no app-wide label rewrite or removal of useful section placeholders. |

The report's broad missing-PageHeader, missing-typography-system, missing-card/
table/toolbar, and equal-prominence prompt-button claims do not enter the work.
The current owners exist and PromptToolbar explicitly distinguishes primary
Add from secondary controls. Three `bodyStrong` section headings are a small
consistency cleanup only. Commerce width tuning and a new Insight layout are
not established requirements and remain outside this plan.

## Terra High working instructions

1. Read root `AGENTS.md`, `docs/README.md`, this plan, and the affected owner
   before each slice. Recheck source rather than trusting this baseline forever.
   For frontend code, follow `frontend/AGENTS.md` and inspect the installed
   Next.js guide relevant to layout, Suspense, and navigation changes.
2. Execute the slices in order. Keep each slice independently reviewable and
   runnable. Do not mix shell authorization changes with cosmetic cleanup.
3. Preserve dirty-tree work. Search callers, query keys, types, permissions,
   tests, and link producers before editing. Use `apply_patch` and pnpm.
4. Keep each existing public screen entry point. Extract a cohesive internal
   owner when needed; production modules stay within 500 LOC and complexity 12.
   No new exceptions, mirrored query store, second URL framework, or generic
   component with domain-specific flags.
5. Preserve UUID identities, workspace-authorized requests and same-origin
   `/api/v1`. Never retain another workspace/project/crawl's data under a new
   identity. A cached entitlement cannot authorize a mutation after access fails.
6. A read Retry only refetches the failed read. It cannot crawl, sync a provider,
   recompute recommendations, activate prompts, publish, or change billing.
   Existing explicit actions and display-only range projection keep their owners.
7. Update canonical docs only when the slice changes their shipped contract.
   Record ordinary validation evidence in the PR; use this plan's checkboxes
   for delivery state, not a new progress/evidence document.

## Slice 1 — safe shell continuity and recoverable bootstrap

**Priority:** P0. **Dependencies:** none.

**Owners:** authenticated layouts; `components/layout/{app-shell,shell-fallback,
onboarding-gate,page-loading}.tsx`; shell consumers including project switcher,
sidebar, user menu, command palette and agent sheet; `lib/auth/session-guard.tsx`;
project and entitlement contexts remain their existing owners.

**Contract and implementation:**

1. While session identity is unknown, show a neutral, non-interactive structural
   shell placeholder using existing shell geometry tokens and one accessible
   loading status. It contains no cached identity, project names, private data,
   enabled account actions, or capability assertions. Do not mount AppShell's
   session-dependent consumers outside SessionGuard.
2. Once authenticated, mount AppShell around the project-route content gate.
   Keep account/workspace recovery reachable while context resolves or fails.
   Keep project data behind the gate and capability-dependent actions unavailable
   until their owning inputs resolve. Inspect every shell consumer first; moving
   the JSX wrapper alone is not sufficient evidence of safety.
3. Use an in-pane pending/notice presentation after shell mount. GateNotice
   currently owns a full-viewport `main`; remove nested main landmarks and
   viewport-sized layouts when placing it inside AppShell. Keep one main and a
   truthful heading. Maintain stable shell controls through pending → ready.
4. Preserve onboarding redirects only for confirmed empty, creation-eligible
   workspaces. Preserve missing-project, failed-read, Viewer, and unresolved
   allowance distinctions. Workspace-only routes must not wait on an entitlement
   query that is disabled because no workspace has resolved.
5. Handle initial non-401 session failure explicitly with a recoverable notice
   and a retry of `auth.me`. Current `!value` returns fallback after retries are
   exhausted. Preserve 401 cache clearing and single redirect behavior. Reuse
   existing transport deadlines/retries; introduce no competing timer policy.
6. Keep providers at the authenticated parent and project/session reads concurrent.
   Correct stale gate-placement comments. Do not add route loading files merely
   because none exist or persist private query results in browser storage.

**Regression coverage:** extend `session-guard.test.tsx` and
`onboarding-gate.test.tsx`; add a composition-level shell test if the existing
isolated tests cannot detect wrapper placement. Cover delayed session without
protected content; authenticated delayed context with shell recovery controls;
initial 503 → explicit retry → success; 401 clearing; empty eligible workspace;
Viewer/no allowance; workspace-only invitation/settings entry; context switch
with a late old response. Retain existing seed-before-navigation coverage.

**Acceptance:** throttled hard loads of `/projects`, `/prompts`, and
`/site/crawls/[crawlId]/pages/[siteUrlId]` have truthful visible structure, then
one authenticated shell lifetime. No private flash, nested main, inaccessible
recovery, disabled-query deadlock, or duplicate provider/request waterfall.

## Slice 2 — Site Health read failure and refresh continuity

**Priority:** P0. **Dependencies:** Slice 1 for integrated shell acceptance.

**Owners:** Website and Issues screens, `lib/site-health/use-site-health-screen.ts`,
`lib/api/site-health.ts`, `lib/api/errors.ts`, shared Alert/Button primitives.

| State | Required presentation | Allowed recovery |
|---|---|---|
| Initial pending, no usable data | Existing header/structural chrome with PageLoading in the affected region | Existing bounded request policy |
| Initial transient failure | Scoped failure with readable reason and Retry; never an empty/no-crawl claim | Exact failed read(s) |
| Same-scope cached data plus transient refetch failure | Retain evidence/catalog/tabs and show an inline refresh-failure notice | Exact failed read(s), visibly pending while retrying |
| Session/access failure | Existing 401 transition or explicit unavailable/access state; do not keep unauthorized evidence interactive | Existing sign-in/workspace recovery, not blind retries |
| Entitlement unresolved/error | Read evidence only where still authorized; disable entitlement-dependent mutations | Entitlement read or existing administrator guidance |
| Successful no-crawl response | Existing truthful prerequisite state | Explicit Website/crawl action under existing permissions |

1. Introduce a small shared read-error presentation composed from Alert/Button
   and the existing safe error formatter. Website and Issues are its two initial
   production consumers. Domain owners decide whether content is usable and what
   retry means; the primitive does not inspect query keys or start network work.
2. Change Website's blocking-state decision to consider usable data, identity,
   error class, and access separately. Remove non-null entitlement assumptions
   from paths that now render without a resolved allowance. Independent authorized
   panels may remain visible; unavailable dependent sections explain their state.
3. Apply the same behavior to Issues without substituting a guessed crawl ID.
   A retained catalog stays bound to the dashboard's exact known crawl. A newly
   selected scope cannot borrow the old dashboard just to avoid a placeholder.
4. Wire Retry to dashboard/entitlement reads that actually failed. Avoid global
   cache clearing or broad invalidation. Preserve single polling ownership, SSE
   acceleration, mutation notices, and terminal snapshot selection.
5. Include safe correlation information when supplied by the existing API error
   contract. Nonretryable validation/access failures get actionable guidance;
   arbitrary raw exceptions never become UI text.

**Regression coverage:** use existing Site Health screen/MSW fixtures and a real
QueryClient. Cover initial failure/retry; success then transient failed refetch
with the same evidence still visible; dashboard failure with independent panel
content; entitlement unresolved with no mutation enabled; scope change followed
by an old response; and successful no-crawl remaining distinct from error.
Add equivalent Issues coverage at its screen boundary. Update the old takeover
test to preserve its authorization protection while testing the new composition.
Assert read retry does not invoke `createCrawl` or other mutations.

**Acceptance:** a transient Site Health failure no longer erases safe usable
content, and initial failures recover without a document reload. New shared
presentation replaces the two hand-rolled error branches, not every Alert in the app.

## Slice 3 — Opportunities URL state and working evidence handoffs

**Priority:** P0. **Dependencies:** no new shared state package.

**Owners:** Opportunities catalog/filter internals, EvidenceDrawer, existing
`lib/navigation/url-state.ts`, `lib/table/use-cursor-table.ts`, scoped navigation,
Overview action links and `components/intelligence/opportunity-insight.ts`.

**URL contract:**

| Parameter | Meaning | Default/validation |
|---|---|---|
| `type` | Existing opportunity type filter | `all`; existing allowed values |
| `severity` | Existing severity filter | `all`; existing allowed values |
| `status` | Existing workflow filter | `active`; omit to retain server active-queue default |
| `action_path` | Owned/earned path filter | `all`; existing allowed values |
| `selected` | Drawer opportunity UUID | Absent means closed; reject malformed UUIDs before requesting |
| `opportunity` | Existing alternate inbound link spelling | Read as an alias only when `selected` is absent; normalize with replace |

1. Move filters and selection to typed codecs over the existing URL utility.
   Omit defaults, preserve `project`, `workspace`, unrelated parameters and hash,
   and avoid writes when the effective URL is unchanged. Keep parsing/defaulting
   in one opportunity-owned seam rather than duplicating state in effects.
2. A committed filter change pushes one atomic entry, clears selection, and
   resets the existing local pager. Opening a drawer pushes one entry; selecting
   another item while it is open replaces that selection. Closing by close,
   Escape or scrim replaces the URL without the selection. It must never call
   unqualified `history.back()` on a direct deep link.
3. Browser Back immediately after opening restores the prior closed list state;
   Forward reopens the same drawer. Back/Forward restores committed filters.
   Reload/direct entry restores filters and selection independently of bfcache.
   Explicit close does not create an extra history entry just to reopen the drawer.
4. Keep cursor stack/page size local in this bounded slice; reload and restored
   filters begin at page one. This is an explicit exception to full pagination
   restoration, not a claim that page position is shareable. Include workspace,
   project, filters and page size in the applicable reset identity; never replay
   a cursor against different scope. Do not mirror an opaque cursor in the URL
   without its bound context and a defined Previous-page contract.
5. Consolidate current internal link producers on `selected`. Retain the small
   read alias for existing inbound `opportunity` links as a URL compatibility
   contract; its focused test is alias → canonical replace → correct drawer.
   Remove it only as an explicitly accepted URL-contract retirement, not a cleanup.
6. Fetch a selected detail even if it is absent from the current filtered page.
   Validate returned detail belongs to the currently selected project before
   exposing evidence or mutation controls: workspace authorization alone cannot
   justify attaching another project's detail to this project's status footer.
   Missing/inaccessible detail stays dismissible with truthful recovery.
7. Project/workspace navigation drops route-owned selection and cursors while
   preserving the destination's scope contract. Retain shared Drawer focus and
   dismissal behavior. If URL updates require changing the shared utility's
   hash/no-op behavior, cover existing consumers at that shared boundary.

**Regression coverage:** catalog interactions through real URL updates, plus
one focused browser history path. Cover all filter dimensions in a coherent
round trip; open → Back → Forward; reload; direct `selected` and alias links;
malformed UUID; foreign-project detail; 404 dismissal; filter change resetting
paging/selection; scope switch; and URL scope/hash preservation. Keep the existing
status-mutation tests and shared overlay coverage; do not duplicate Radix tests.

**Acceptance:** Overview and Top Insights handoffs open the intended authorized
opportunity. Filters/drawer survive reload through the URL, and closing a direct
link stays on Opportunities.

## Slice 4 — truthful Performance pre-data presentation

**Priority:** P1. **Dependencies:** shared presentation from Slice 2 when applicable.

**Owners:** `components/performance/performance-screen.tsx`, performance chrome,
readiness ladder, breakdowns, metric/chart components, existing Performance API
schemas and selection helpers. No new backend projection or provider operation.

1. Define a small presentation decision from persisted dashboard coverage,
   selected/comparison window identity, readiness, and existing projection state.
   Do not decide “no data” using metric truthiness, empty chart buckets alone,
   or `snapshot_id === null` alone.
2. With no source evidence/usable window, render shared EmptyState plus relevant
   readiness and the existing permitted connection/sync path. Hide meaningless
   metric shells, granularity and six empty reserved table panels. Navigation to
   setup remains workspace/project-scoped and respects role permissions.
3. With a concrete missing range being projected, retain the existing projection
   action/poll lifecycle and truthful progress. A presentation early return must
   not unmount its owner or strand a pending task. Preserve range controls so
   users can return to a covered window; never call provider sync from rendering.
4. A missing comparison must not hide an available selected window. A selected
   window with measured zeros renders zeros. Partial GSC, GA4 or Bing evidence
   remains distinguishable and visible where available; no GSC-only predicate
   may erase valid independent provider evidence.
5. Same-scope retained data during range changes remains explicitly associated
   with its actual returned window until replaced. Do not label old figures as
   the requested range. Preserve valid snapshot identity for every dimension read.

**Regression coverage:** add a focused Performance screen test if no current
screen owner test exists; reuse `lib/performance/performance.test.ts` fixtures
and API schemas where suitable. Cover no evidence, pending concrete range,
available selected/missing comparison, measured zero, partial provider coverage,
and project change. Assert hidden tables issue no dimension request without a
snapshot, while eligible range projection behavior still completes.

**Acceptance:** a new project has a clear next step and no empty table-sized
reservation. Existing, zero, partial and pending measurements remain truthful.

## Slice 5 — bounded empty/loading consolidation

**Priority:** P1. **Dependencies:** Slices 1 and 4 establish the state distinctions.

1. Replace Demand's verified no-snapshot branch with existing EmptyState and a
   scoped path to the current Performance/setup workflow. Verify the actual
   supported action before writing its copy; do not invent a user-facing
   “recompute Search Demand” control or conflate every 404 with absent evidence.
   Preserve unavailable Search Console evidence as a distinct state.
2. Replace Movement's bespoke empty bordered block with a compact shared
   EmptyState preserving comparable-measurement prerequisite language. Keep
   observed no-change data in the measured path.
3. In Visibility and AI Referrals, hide controls that cannot affect a confirmed
   first-use empty state. Preserve start/manage actions under existing permissions,
   active-run notices, and selection/reset controls whenever they can recover
   from a filtered or uncovered range. Do not hide the whole toolbar on any
   generic empty predicate; pending/error states must remain recoverable.
4. Replace only BillingSkeleton's full-screen initial wait with PageLoading.
   Keep useful section-level pending UI, existing delay/reduced-motion behavior,
   and specific accessible labels. Disabled queries must not imply pending work.
5. Align the three identified section headings in usage meters, invoice history,
   and TopInsights with the existing sectionTitle owner. Do not widen this into
   a typography migration or shared dialog/drawer redesign.

**Regression coverage:** extend Demand and billing tests only for changed state
decisions. Test Visibility/AI Referrals first-use versus filtered-empty recovery
and preservation of measured zero. Reuse dashboard tests for no-comparable
Movement. Cosmetic heading changes need no new tests.

**Acceptance:** prerequisite states identify absence and a valid next step;
controls needed to escape a selection remain available. No duplicate empty or
initial-loading implementation survives at the replaced call sites.

## Slice 6 — Overview decision hierarchy

**Priority:** P1. **Dependencies:** Slices 3 and 5 for handoffs and Movement.

**Owners:** `components/projects/dashboard-{screen,sections,primitives,controls}`,
existing TopInsights/Insight components. Retain command-center query/action owners.

1. Separate compact project identity from Company facts inside the existing
   header owner. Preserve facts inspection/edit access and all persisted content.
2. Use this reading/DOM order: route header and compact identity; applicable
   warnings; Project state with Track context; Movement; Next action; Ranked
   actions and proof; Top insights; Company facts. Follow `docs/design.md`'s
   current state → movement → next action → evidence hierarchy.
3. Keep desktop/mobile DOM order consistent. Do not use CSS ordering to make
   keyboard/screen-reader navigation disagree with the visual hierarchy.
4. Preserve ranked action reorder state, optimistic-concurrency behavior, report
   download, scoped links, and the existing narrow reset boundary. Moving facts
   must not remount unrelated insight content when action order changes.
5. Keep shared Insight anatomy, source links, eligibility filtering, server order,
   and provenance. Do not remove evidence to make a card shorter or add a new
   Insight variant solely for this report's subjective density claim.

**Regression coverage:** existing dashboard tests cover facts/actions, PDF
recovery, zero/unavailable values and no-remount behavior. Extend only for a
credible changed navigation/control regression. Verify visual order, responsive
density, facts discoverability and keyboard access in browser review rather
than source-order assertions or full-markup snapshots.

**Acceptance:** first-use and measured Overview lead with decision context,
facts remain reachable, and ranked-action/Insight handoffs work after reordering.

## Validation and delivery gates

For future implementation, run the smallest affected tests serially. From
`frontend/`, use `pnpm exec vitest run <affected-test-paths>`; for browser tests,
use `pnpm exec playwright test --config playwright.config.ts <affected-specs>`
under the setup documented in [Development](../DEVELOPMENT.md). Use deterministic
MSW/local fixtures and no real provider credentials. Log test output beneath
the worktree Git directory resolved by `git rev-parse --absolute-git-dir`;
report exit status and read only failure tails unless more context is needed.

Run `./scripts/check.ps1` once when the executable changes for a delivery are
complete. It owns static/contract checks and formatting. Do not run overlapping
test/check processes, repeat successful checks for handoff, or run the full
backend suite. CI owns full release validation. Review `git diff --check`,
`git diff --stat`, and `git diff --name-status`; search for replaced symbols and
all Opportunity URL producers before completion.

Browser acceptance uses controlled delayed/failed requests at desktop and compact
widths. Cover cold direct entry, SPA navigation, refetch failure/retry, project
switch, URL Back/Forward/reload, first-use/zero/partial states, keyboard dismissal
and focus restoration. Record request counts and visible transition behavior;
do not claim latency improvement without comparable before/after traces. If
authenticated fixtures are unavailable, record browser acceptance as pending
rather than marking it passed or substituting a login-page trace.

Canonical documentation changes are conditional:

- `frontend-architecture.md`: shell ownership, shared read-error responsibility,
  and any explicit URL/pagination policy change.
- `design.md`: only changed loading/empty/hierarchy presentation rules.
- `workspace-access.md`: only changed bootstrap/recovery behavior.
- `site-health.md`, `opportunities.md`, and `integrations-traffic-analytics.md`:
  only the corresponding changed shipped read/navigation/pre-data contracts.
- `api-error-contract.md`: only if shared read-error presentation becomes part
  of its public UI contract. Backend envelopes remain unchanged.
- `decisions.md`: only an accepted qualifying cross-feature decision, not
  ordinary implementation evidence. `ACTIVE.md` tracks selection/completion.

## Completion checklist

- [x] Slice 1 implementation: safe bootstrap structure, authenticated shell continuity and recovery.
- [x] Slice 2 implementation: Website/Issues read recovery with same-scope continuity and access safety.
- [x] Slice 3: URL filters, history, scoped selected detail and repaired handoffs.
- [x] Slice 4: Performance first-use/pending/zero/partial presentation.
- [x] Slice 5: bounded empty/loading/heading consolidation.
- [x] Slice 6: Overview hierarchy with controls and evidence retained.
- [x] Superseded gate/error/local-filter/BillingSkeleton/empty-block paths removed.
- [x] Affected tests and one completed-delivery check pass; browser acceptance recorded.
- [x] Changed owner contracts updated; active index reflects actual delivery state.

No database migration, cache persistence, backend ranking/scoring change,
full design-system replacement, blanket tab mounting, speculative performance
optimization, live-provider execution, payment activation, deployment, or
automatic publication is authorized by this plan.
