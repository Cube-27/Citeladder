# App shell improvement plan

**Status:** implemented 2026-10-10 in one PR (four phases). Shipped behaviour
is owned by [Frontend architecture](../frontend-architecture.md),
[Architecture](../architecture.md) and [Design](../design.md). Declined during
implementation: 2.10 (both rail mounts share one query key, so the hidden rail
adds no request) and the narrow-column half of 3.5 (backlog).

Feature 15 of the [feature review tracker](feature-review-tracker.md): the
product app shell (`components/layout`, the router in `apps/app/src`), the
navigation and command palette, the product tour, the Dashboard's top insights
(`components/intelligence`) and the shared design system (`components/ui`,
`globals.css`, `website-type.css`). The Dashboard read it depends on
(`services/api/src/projects/command-center.ts`) is in scope where the shell
shows it. Constraints: [invariants](../invariants.md), especially that reads
render persisted projections, and the [no back-compat rule](../invariants.md)
for retired routes. File references are to `frontend/`.

## Why

Three read-only audits (shell and navigation; tour and Dashboard insights;
design system and documents), 2026-10-10, found after verification:

**Product tour.** Its first two steps target `data-tour="dashboard-overview"`
and `dashboard-report`, which nothing renders since #48/#87. The runner retries
for 1.2 s and then saves `skipped`, so every member, and every invitee whose
membership is reset, has silently skipped the tour. The tests hid this by
rendering their own target. When it did run it redirected deep links to
`/projects`, Esc or a scrim click skipped it for good, and its overlay pointed
at an undefined token (`--overlay-scrim`) with stock, untheme'd driver.js CSS
(13px, Helvetica, no dark mode).

**Navigation and shell.**

- Website and AI Visibility are active only on `?tab=pages` and `?tab=trends`
  (`layout/nav-items.ts:40,59`); every other tab of those screens shows no active
  item, and the Website link overrides the screen's own default tab.
- No scroll reset on navigation: the document scrolls and the router has no
  `ScrollRestoration`, so a new screen opens at the previous scroll offset.
- No document titles (every tab reads the index title), no focus move or route
  announcement after navigation. `resolveTitle` already exists.
- A project switch keeps the old project's query IDs (`run`, `prompt`,
  `baseline`, `configuration`, `site_url_id`, `issue`, `cursor`); only `/site`
  strips a few (`lib/navigation/project-destination.ts:24`).
- One error boundary on the private layout: a render error in any screen
  replaces the sidebar with "Reload page". No catch-all route, so an unknown URL
  reaches React Router's default error page.
- The mobile drawer stays open after a project switch.
- Every shell load POSTs `/projects/{id}/logos/refresh` for each logo-less
  project (`lib/project/project-context.tsx:311`): a guaranteed 403 per project
  for viewers, and a live favicon fetch triggered by reading the shell.
- Capability gating in navigation filters nothing: no item sets
  `requiredCapability`. `NavGroup.href`/`icon` are never read. `page-titles.ts`
  titles a route that does not exist.
- Back-compat redirects remain (`/account-security`, `/opportunities` in
  `apps/app/src/router.tsx`), against the owner's no-back-compat rule.
- Dashboard mode has no "Act" destination: Actions and its open count exist only
  in Agent mode, and Integrations appear only in the command palette.
- The command palette's listbox holds `<p>` headings and an empty-state `<p>`;
  the input lacks the combobox role; options are tab stops.
- On mobile the hidden desktop rail still mounts, so Agent mode polls the chat
  and Actions lists twice.
- Route code starts downloading only on click; `/projects` is statically in the
  private boot chunk.

**Dashboard.**

- Top insights refetches the opportunities list that the command-center
  response already carries as `actions`, so an established user sees the top
  Action three times (Next action, Ranked actions, Top insights), and a reorder
  leaves Top insights in the old order. Its cards label AI-answer gaps
  "Demand", show priority twice ("High priority", "Potential impact: High"),
  link "Evidence" to the Action and leak internal kinds ("analysis, metric").
  `Insight`, `ProvenanceChip` and "Why this matters" have no other caller.
- The "New evidence is available" alert is unreachable: `stale` is
  `audits.historical`, true only when an `audit_id` is passed, which the
  Dashboard never does.
- Next action tells a user with prompts and no audit to connect GSC/GA4 first,
  says "Run the first visibility audit" while one is running, and says
  "Optimal state" whenever no Action is open, including at 0% visibility or
  before the first refresh. The empty Ranked actions asks a new user to run
  "another" audit.
- The read awaits about 20 queries one after another, loads up to 100 audits
  with configuration JSON plus prompt texts to find one comparable audit, and
  reads `opportunity_orders` twice.

**Design system and documents.**

- `eyebrowClasses` is an alias of `textRole('label')` with a stale comment.
- Six classes have no consumer (`.pipeline-stream`, `.scrollbar-none`,
  `.origin-centre`, `.website-eyebrow`, `.flow-groups`, `.flow-choice-chip`).
- `text-danger` (a mark token) is used as text ink in two places.
- `InfoHint`'s trigger is a 12px target and its label repeats the tooltip.
- `Dialog` without a description omits `aria-describedby={undefined}`.
- Searchable-select option IDs embed raw values (whitespace makes an invalid
  IDREF).
- design.md describes an accent picker and an `objectTitle` role that do not
  exist, the removed pipeline dots and `website-eyebrow`; frontend-architecture.md
  lists calendars, avatars, disclosure and pagination as unused or
  feature-owned when they are shared primitives with consumers.

**Tests that do not earn their place.** Listed per phase below; each deletion
names its reason in the commit.

## Decisions

Settled by the owner on 2026-10-10:

1. **The product tour is retired**, not repaired or made replayable.
2. **UX addition: Actions in Dashboard navigation.** Order the Dashboard
   sidebar along the loop — Overview, Analyze, Act (Actions with its open
   count), Track — and show Integrations in the sidebar's setup area.
3. **Next action order.** Prompts → first audit (with an "audit running"
   state) → the top Action → first crawl → connect GSC/GA4; never "Optimal"
   while no audit exists or opportunities are unknown.
4. **Top insights is deleted**, not rebuilt. A "where you are missing" block
   (prompts or engines naming competitors but not you) is new data and goes to
   the backlog.
5. **Logo refresh moves off the shell read** to project creation and the
   project's domain change.

## Phase 1: retire the tour (done on the branch)

Delete `components/tour`, the provider in `private-routes.tsx`, the
`/workspaces/{id}/product-tour` GET/PATCH routes, the contract schemas, the API
client, the query key, the tour version config and the five `product_tour_*`
columns on `workspace_members` (baseline, generated types, inserts, seed,
fixtures), the driver.js dependency and its license entry, and the workspace
test. Acceptance: no `product_tour`, `ProductTour` or driver.js reference
outside archives.

## Phase 2: shell correctness

| # | Change | Where |
|---|---|---|
| 2.1 | Active state matches the path only; Website and AI Visibility link to `/site` and `/visibility`; `queryMatch` deleted. | `layout/nav-items.ts`, `sidebar-nav.tsx` |
| 2.2 | Scroll resets per pathname (`ScrollRestoration` keyed by pathname). | `private-routes.tsx` |
| 2.3 | `document.title` is `Page · Project · CiteLadder`; after a push navigation focus moves to `#main`. | `layout/app-shell.tsx`, `page-titles.ts` |
| 2.4 | A project switch keeps an allowlist of non-ID params (`tab`, range, granularity, engine, status, view filters) and drops everything else. | `lib/navigation/project-destination.ts` |
| 2.5 | Screen errors render inside the shell with "Go to Overview" and "Reload"; a `*` route renders an in-shell not-found. | `router.tsx`, `route-error.tsx` |
| 2.6 | The mobile drawer closes on location change. | `app-shell.tsx` |
| 2.7 | Logo refresh leaves the shell (decision 5). | `project-context.tsx`, project create/update owner |
| 2.8 | Delete the unused capability gating, `NavGroup.href`/`icon`, the dead page title, the `/account-security` and `/opportunities` redirects and the stale router mock. | `nav-items.ts`, `page-titles.ts`, `router.tsx`, `router.test.tsx` |
| 2.9 | Command palette: groups are `role="group"` with labels, the input is a combobox, options are not tab stops, the empty state sits outside the listbox. | `ui/command-palette.tsx` |
| 2.10 | The desktop rail does not mount below its breakpoint. | `app-shell.tsx` |

Tests: one sidebar test that the active item follows the path on every tab; one
project-switch test that an ID param is dropped and a tab survives; one router
test for the in-shell not-found and error. Delete `sidebar-nav.test.tsx`
assertions on group titles, command labels, absent retired labels and `<p>`
selectors (constants and markup); the palette's kbd copy test keeps one
platform branch.

## Phase 3: navigation and Dashboard (UX addition)

| # | Change | Where |
|---|---|---|
| 3.1 | Dashboard sidebar: Overview, Analyze, Act (Actions, open count), Track; Integrations in the setup area (decision 2). | `nav-items.ts`, `sidebar-nav.tsx` |
| 3.2 | Next action order and the running-audit state from persisted run status; "Optimal" only after an audit with no open Action; first-run empty copy. | `projects/command-center.ts`, `dashboard-sections.tsx` |
| 3.3 | Delete Top insights, `components/intelligence` and their tests (decision 4). | `dashboard-screen.tsx` |
| 3.4 | Drop the unreachable `stale` field and alert. | contract, `command-center.ts`, `dashboard-screen.tsx` |
| 3.5 | Command-center read: independent queries in parallel. (The narrow comparable-audit lookup and the single `opportunity_orders` read are deferred.) | `command-center.ts` |
| 3.6 | Hover/focus intent also loads the route chunk; `/projects` is lazy. | `route-prefetch.ts`, `router.tsx`, `private-routes.tsx` |

Tests: the command-center ladder (no audit, running audit, audit with no
Action, top Action) through the real PostgreSQL boundary; the sidebar shows the
open-Actions count.

## Phase 4: design system and documents

| # | Change |
|---|---|
| 4.1 | Replace `eyebrowClasses` with `textRole('label')` and delete `ui/eyebrow.tsx`. |
| 4.2 | Delete the six unused classes; fix the `--text-field` and dialog scrim comments. |
| 4.3 | `text-danger` → `text-danger-text` where it is text. |
| 4.4 | `InfoHint` 24px target and label only; `Dialog` `aria-describedby={undefined}` without a description; searchable-select IDs by index. |
| 4.5 | design.md and frontend-architecture.md corrected against the code (accent picker, `objectTitle`, pipeline dots, `website-eyebrow`, capability table). |
| 4.6 | Delete UI tests that assert Radix behaviour, markup, class passthrough or copy (`overlays.test.tsx:41,178,21`, `primitives.test.tsx:33-44,60-65,68-72,131-149` class lines, `switch.test.tsx:15`, `market-select.test.tsx:140-159`). |

## Deferred to the backlog

- "Where you are missing" on the Dashboard (decision 4).
- Cold-load bootstrap waterfall: start the project list, entitlement and access
  reads from the URL or stored workspace in the first wave. It changes the
  bootstrap state machine and needs its own measured slice.
- Design-system known remainder (TrendChart on the chart frame, section
  skeletons, drawer and table width roles, accent check marks, blog palette):
  unchanged since #320.
- A slimmer `GET /projects` for the switcher (no N+1 today).
- Command-center comparable-audit lookup by narrow columns (it loads
  configuration JSON and core prompt texts for up to 100 audits to build the
  comparison key) and one `opportunity_orders` read.
