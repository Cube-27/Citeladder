# CiteLadder Targeted Layout Consolidation

> **Status:** approved visual direction; implementation has not started.
> **Hard precondition:** do not implement this plan on the current
> `vorflux/billing-consolidation-implementation` worktree. Begin only after that branch is merged,
> local `main` is synchronized with its upstream, and `git status --short` is empty. Re-read all
> named owners after synchronization because the current branch changes frontend billing and
> entitlement contracts.
> **Prototype:** `C:\Users\abhij\Downloads\citeladder-prototype.html` was requested and the
> available approved artifact is `C:\Users\abhij\Downloads\preview.html`. It is a visual and
> interaction specification, not an implementation or source of product copy, fixture data,
> routes, permissions, or business behavior.
> **Companion authorities:** [`design.md`](../design.md),
> [`frontend-architecture.md`](../frontend-architecture.md),
> [`ui-component-system.md`](../ui-component-system.md),
> [`architecture.md`](../architecture.md), and [`invariants.md`](../invariants.md).
> Those documents describe the currently shipped interface. This approved cutover deliberately
> supersedes their desktop-topbar, Growth Agent placement, public display-font, and mobile
> navigation language; each contradiction must be updated in the same implementation slice that
> changes the corresponding owner.

## 1. Outcome

Make the shipped product feel like one compact, evidence-led system by consolidating the few
structural owners that control every screen:

- one restrained blue-accent token system with semantic status colors;
- one Geist typography system with a 14px product baseline;
- one authenticated shell with a compact sidebar, desktop Search and Agent actions, no desktop
  global topbar, and a mobile topbar plus off-canvas navigation drawer;
- one explicit in-pane page header per authenticated route;
- four reusable composition patterns proven on Overview, Website, Issues, and Content;
- one focused-flow treatment for login, registration, and onboarding;
- a quieter public landing page with materially fewer decorative icons;
- a final migration and deletion sweep that removes the superseded paths instead of leaving
  parallel implementations.

This is a layout and presentation consolidation. It is not a product redesign, data migration,
routing rewrite, permission change, API change, or new component framework.

## 2. Locked boundaries

### Preserve exactly

- Current routes, deep links, browser-history behavior, and same-origin API use.
- Project and workspace authorization; capability and entitlement gates.
- Project switching, add/edit project flows, account access, Settings, and sign-out behavior.
- Command Palette behavior: pointer launch, Ctrl/Cmd+K, filtering, keyboard selection, navigation,
  project switching, Escape, and focus restoration.
- Growth Agent behavior: capability gate, route/project/date/filter context, contextual launchers,
  project-change reset, one drawer owner, and no autonomous external mutation.
- Website's five tabs, server-phase default selection, progressive crawl states, crawl controls,
  export, persisted projections, filters, sorting, cursor pagination, evidence, and unavailable
  state vocabulary.
- Issues' Defect/Advisory distinction, URL state, server filters, group/detail queries, evidence,
  occurrence cursor, copy-fix action, and complete compact-screen detail.
- Content's handoff authorization, target alternatives, channel/format skills, generation
  lifecycle, polling, cancel/retry/regenerate, Markdown output, copy/export, feedback, history,
  deletion rules, and provenance.
- Login, registration, OAuth, demo/MCP handoffs, validation, onboarding gates, discovery,
  confirmation, payloads, billing/capacity states, and redirects.
- Public-site copy, factual claims, section order, URLs, session redirect, navigation, footer,
  platform marks, and product preview behavior.
- Semantic distinctions among unknown, unavailable, zero, historical, conflicting,
  not-applicable, and excluded.

### Do not introduce

- No new UI library, icon package, CSS-in-JS system, layout framework, or dependency.
- No universal `Page`, `Screen`, `Toolbar`, `Metric`, `Panel`, or `Form` component with a large
  option surface.
- No route-local token namespace or stylesheet.
- No copied prototype fixture state, fake interactions, sample project picker, Design system
  destination, hash router, or string-template rendering.
- No compatibility wrapper, alias, deprecated path, duplicated controller, or second navigation
  registry.
- No backend, schema, API-contract, provider, queue, billing, scheduling, or permission changes.
- No copy rewrite. Existing explanatory text may move into a page header, but its factual wording
  must not change in this visual cutover.
- No indiscriminate flattening. Cards, hairline bands, ledgers, tables, wells, drawers, and
  dialogs retain distinct semantics.

## 3. Evidence map

| Surface | Current owner | Demonstrated structural debt | Approved decision |
|---|---|---|---|
| Authenticated shell | `components/layout/app-shell.tsx` | Desktop sidebar and global topbar split primary shell actions; mobile has separate primary and secondary nav renderers | Remove desktop topbar. Put Search and Agent between project switcher and nav in the sidebar. Use a 56px mobile topbar and the same sidebar/navigation content in an off-canvas drawer below 980px. |
| Page title | `components/layout/page-header.tsx`, `page-titles.ts` | The shell owns a detached title while route actions and tabs live inside the page | Make `PageHeader` an explicit in-pane route composition with title, optional existing description, and optional route-owned actions. Migrate every authenticated route atomically so exactly one H1 remains. |
| Search | `components/ui/command-palette.tsx` | One mature controller is coupled to its topbar trigger; Settings routes are duplicated outside the shared nav model | Keep one dialog/controller. Render its desktop trigger in the sidebar and open that owner from a lightweight mobile launcher event. Derive route commands from the shared navigation source with the same capability filtering as visible navigation. |
| Growth Agent | `components/layout/agent-sheet.tsx` | One mature controller is coupled to topbar placement | Keep one drawer/controller and the existing contextual event contract. Render its main desktop trigger in the sidebar and add only a compact mobile launcher for the same owner. Do not mount two `AgentSheet` instances. |
| Navigation | `nav-items.ts`, `sidebar-nav.tsx` | Desktop, mobile-primary, mobile-secondary, and Command Palette presentations have drifted; active Settings state can fall through to Overview | Keep one route/station registry and one capability resolver. Reuse the full sidebar navigation in the mobile drawer. Delete the fixed mobile primary/secondary implementations after the drawer is proven. Preserve every current destination. |
| Project/account access | `ProjectSwitcher`, `UserMenu`, Overview `ProjectControls` | Overview repeats shell-level project enumeration and selection | Keep `ProjectSwitcher` and `UserMenu` as the shell owners. Retain Overview edit/facts/report actions, but remove its duplicate project picker after project switching is proven through the shell. |
| Layout tokens | `app/globals.css` | Current 220px/52px shell geometry and green-ground palette conflict with the approved blue compact prototype; some feature layouts bypass shared split and spacing tokens | Replace values through existing semantic variables. Do not create a parallel prototype token set. Add only missing shell geometry variables with multiple real consumers. |
| Typography | `app/layout.tsx`, `globals.css`, `website-type.css`, `ui/typography.tsx` | Product uses Geist while public/focused display uses Barlow; call sites override named roles with local weight/tracking/leading | Use Geist for product, public, and focused flows. Keep named semantic role ladders for product versus public scale, but remove font-family mixing and call-site overrides. Remove Barlow loading/assets only after all consumers migrate. |
| Shared composition | `ui/workspace.tsx`, `ui/layout.tsx`, `ui/card.tsx`, `ui/tabs.tsx`, `ui/table.tsx` | Existing useful hairline, ledger, section-header, stack, card, tab, and table primitives coexist with repeated local wrappers | Reuse and tighten these owners. Add no new abstraction unless at least two production consumers have the same semantic shape. |
| Overview | `components/projects/dashboard-*.tsx` | Nearly every region is boxed; project switching is duplicated | Keep semantic cards for project identity, Next action, and Track. Convert Movement, ranked actions, report proof, facts, and metrics to open or ruled sections where the prototype demonstrates hierarchy without containment. |
| Website | `components/site-health/**` | Correct domain composition is visually split across many boxed regions; route adds a redundant `TooltipProvider` | Preserve every panel and query owner. Use open section hierarchy, shared metric strips, tabs, and existing table/record strategies. Remove only the redundant provider and visual wrapper duplication. |
| Issues | `components/issues/issues-catalog.tsx` and presenters | The split ratio is hard-coded despite `--pane-list-detail`; list and detail read as unrelated boxes | Use the shared split token and one feature-owned master-detail boundary. Desktop keeps a sticky bounded detail region; compact widths use a horizontally reachable master list above the complete detail. |
| Content | `components/content/**` | The composer and generated state are wrapped as separate cards despite being one creation flow; route adds a redundant provider | Use one open, readable creation column with shared fields and a quiet context/action boundary. Keep semantic result/error/generating regions and the History drawer. |
| Auth/onboarding | `components/auth/flow-shell.tsx`, `auth-form.tsx`, `components/onboarding/**`, `website-type.css` | Optional `FlowGroup.icon` adds five decorative heading tiles; repeated stage headers and mixed typography roles add noise | Keep `FlowShell`. Remove decorative group icons, consolidate the repeated stage heading locally, use Geist flow roles, and retain every functional/status icon and interaction. |
| Public landing | `components/marketing/landing/**`, `lib/marketing-content/landing.ts` | Seventeen content records force decorative icon/tile metadata; four section owners render the full icon wall; typography is locally overridden | Remove the 13 decorative reveal/industry/trust icons. Retain at most four workflow-stage wayfinding icons, all in one blue treatment, plus functional arrows and platform/product-preview marks. Normalize typography in existing section and button owners. |
| Route wrappers | authenticated route entries | Multiple routes add `TooltipProvider` beneath the shell; several add no-op one-child grid wrappers | Remove duplicates only after confirming the route remains under `AppShell`; retain real Suspense and provider boundaries. |

## 4. Intentional differences from the prototype

The prototype is deliberately sparse and uses fixtures. Production must differ where real product
semantics require it:

1. **Real information architecture stays.** Production keeps all current routes and destinations;
   the prototype's `Design system` and `Sample: Populated` controls are omitted.
2. **Real states stay.** Loading, empty, first-crawl, progressive, blocked, stale, error,
   unavailable, permission, capacity, and destructive-confirmation states remain even when the
   prototype shows only a populated example.
3. **Website stays evidence-complete.** All five tabs and their persisted projections remain; no
   prototype labels, scores, mock rows, or alternate crawl lifecycle are copied.
4. **Issues stays query-complete.** Compact presentation must not replace URL-backed filters,
   cursors, selected-group detail, evidence, or Defect/Advisory semantics.
5. **Content stays production-complete.** Both target inputs, skill selection, authorized handoffs,
   output provenance, duplicate header/footer result actions, and History drawer remain.
6. **Public marketing stays factual.** The seven production landing sections, real copy, platform
   marks, session redirect, navigation, footer, and product illustration remain. The prototype
   supplies rhythm, type, color, and restraint—not replacement marketing content.
7. **Semantic objects may remain cards.** Project identity, next action, Track state, result/error
   regions, remediation wells, dialogs, and drawers retain boundaries where containment carries
   meaning.
8. **Dense datasets keep the suitable compact strategy.** Existing labelled-record conversions
   remain for Website Architecture/AEO. Other tables keep horizontal containment where reducing
   columns would remove evidence.
9. **URL detail keeps the entity as the sole H1.** Omit the generic route `PageHeader` heading on
   that screen; the compact mobile shell title remains non-heading text.

## 5. Approved visual foundation

Implement these values by rebinding existing semantic tokens, then verify contrast and all status
states. Do not paste prototype class names into route files.

### Color and type

- Product/public/flow family: Geist variable.
- Product baseline: 14px/1.45 with `letter-spacing: -0.01em`.
- Primary ink: `#172338`; strong ink: `#111c30`; muted: `#536178`; subtle:
  `#78869b`.
- Accent: `#175cd3`; hover: `#164aab`; soft: `#eaf2ff`; line: `#b9d2fa`.
- Canvas: `#f3f6fb`; paper: white; quiet surface: `#f7f9fc`; stronger quiet surface:
  `#edf1f7`.
- Hairline: `#e2e7ef`; strong hairline: `#cbd4e1`.
- Status roles remain separate: success, warning, error, and informational states must not be
  collapsed into brand blue or inferred from color alone.
- Page title: 26px desktop and 24px compact, strong ink, balanced wrapping, tight tracking.
- Section title: 16px; body/control: 14px; supporting: 13px; metadata: 12px; eyebrow:
  approximately 11.5px uppercase. Use named roles rather than route-local size/weight strings.
- Weights may use the Geist variable axis where hierarchy requires it, but each semantic role owns
  the weight. Callers must not add `font-bold`, `font-medium`, tracking, or leading to restate it.

### Geometry

- Desktop sidebar: 232px; 210px between 981px and 1200px.
- Mobile navigation breakpoint: 980px, matching the approved shell rather than Tailwind's generic
  `md` boundary.
- Mobile topbar: 56px.
- Workspace content cap: 1392px.
- Workspace gutters: 28px desktop, 22px through short-laptop widths, 16px compact.
- Desktop workspace: white, minimum 100dvh, 12px left-side radius; compact workspace: square and
  edge-to-edge below the mobile-shell breakpoint.
- Spacing ladder remains 4/8/12/16/20/28/40px through existing variables.
- Controls remain compact on desktop but retain at least 44px touch targets on compact touch
  surfaces where the existing design contract requires them.
- Shadows remain for floating overlays and the off-canvas drawer, not ordinary page containment.

### Composition rules

- One page H1, optional factual description, and existing page actions form the in-pane header.
- Tabs immediately follow the page header and use a hairline with a blue active indicator.
- Metrics form shared hairline bands rather than collections of individual cards.
- Page architecture comes from whitespace, section headings, rules, ledgers, and tables.
- Cards are reserved for semantic objects or bounded interaction/state.
- Accent blue indicates action, selection, focus, links, and primary chart emphasis. Status colors
  indicate only their status.
- Icons remain for navigation concepts, controls, providers/platforms, status, and compact
  wayfinding. Decorative repeated icon tiles are removed.

## 6. Delivery sequence

Each phase begins from the result of the preceding phase and ends with its own actual-surface
smoke plus focused lint, type, and affected behavior tests. Repository-wide `check.ps1` and
`test.ps1` run once after the full planned implementation, in the required order. Do not begin a
later phase with a known failure or open parallel implementations of the same shared owner.

### Phase 0 — clean-main re-baseline

**Precondition, not optional implementation work**

1. Confirm the current branch is merged.
2. Synchronize local `main` with its upstream and confirm the working tree is empty.
3. Re-read the named shell, entitlement, billing/settings, route, CSS, test, and documentation
   owners. The current unmerged branch changes billing/entitlement frontend files, so this plan's
   file map must be reconciled rather than applied blindly.
4. Re-run structural searches for every `PageHeader`, `TooltipProvider`, Barlow variable,
   legacy typography alias, navigation registry, topbar-height consumer, mobile navigation
   renderer, landing icon field, and route-local no-op layout wrapper.
5. Launch the clean-main product with deterministic fixtures and capture before images at
   1440x900, 1280x720, 768x1024, 767x1024, and 390x844. Record horizontal overflow, shell mode,
   scroll owner, one-H1 count, and reachable actions.
6. If clean main has materially changed an owner or contract, update this plan before editing.
   Preserve the decisions and boundaries above; do not resurrect the old branch implementation.

**Exit:** synchronized clean `main`, current owner/deletion inventory, and reproducible before
surfaces.

### Phase 1 — shared contracts, atomic shell cutover, and visual foundation

**Primary owners**

- `frontend/app/globals.css`
- `frontend/app/website-type.css`
- `frontend/app/layout.tsx`
- `frontend/components/ui/typography.tsx`
- `frontend/components/layout/app-shell.tsx`
- `frontend/components/layout/page-header.tsx`
- `frontend/components/layout/page-titles.ts`
- `frontend/components/layout/nav-items.ts`
- `frontend/components/layout/sidebar-nav.tsx`
- `frontend/components/ui/command-palette.tsx`
- `frontend/components/layout/agent-sheet.tsx`
- `frontend/components/layout/project-switcher.tsx`
- `frontend/components/layout/user-menu.tsx`
- all authenticated route/screen coordinators that must acquire the explicit `PageHeader`
- associated component tests, `frontend/e2e/shell.spec.ts`, source-policy checks, and
  `scripts/validation.json`
- `docs/design.md`, `docs/frontend-architecture.md`, `docs/ui-component-system.md`, and the
  Growth Agent placement sentence in `docs/architecture.md`

**Slice 1A — shared behavior seams under the existing shell**

1. Create one shared destination/capability resolver consumed by sidebar navigation, compact
   navigation, and Command Palette results. Preserve every current destination and capability
   gate, then delete the Command Palette's parallel Settings list and duplicated filtering.
2. Extract a trigger-only presentation from each interactive controller. Keep one mounted
   Command Palette dialog and one mounted Agent drawer; sidebar and compact launchers open those
   owners through explicit events while preserving focus restoration and contextual Agent events.
3. Split `UserMenu` into one menu/logout controller and explicit desktop-sidebar and
   compact-topbar trigger presenters. The compact drawer must exclude the sidebar account block
   because account remains in the mobile topbar. Do not mount a second logout mutation.
4. Prove the refactor under the current shell before changing geometry. Delete superseded
   command/account controller paths in this slice after all callers migrate.

**Slice 1B — atomic shell and page-header cutover**

1. Convert `PageHeader` from a shell-topbar title into a small explicit route primitive with only
   three responsibilities: resolved title, optional existing description, and optional actions.
   Migrate all authenticated page coordinators in one cutover. Move existing page actions into the
   header only where their owning state is already available; do not create a context/portal system
   to force an action upward.
2. On URL detail, omit the generic route heading entirely and let the visible entity heading be
   the sole H1. Error and not-found routes also keep one truthful heading.
3. Remove the desktop topbar. Build the compact sidebar in this order: brand,
   `ProjectSwitcher`, Search, Agent, grouped navigation, Settings/supporting access, and desktop
   account at the bottom.
4. Below 980px, render a 56px sticky topbar with menu, compact non-heading title, Search, Agent,
   and the sole compact account trigger. The menu opens the existing sidebar brand/project/tools/nav
   content as a focus-managed off-canvas drawer with a scrim; route selection and Escape close it
   and restore focus.
5. In the same cutover, delete the old desktop topbar, fixed mobile primary navigation, mobile
   secondary strip, stale topbar-height geometry, and obsolete safe-bottom reservation. Do not
   carry hidden duplicate trees into later phases.
6. Keep shell providers and the authenticated shell mounted across instant route navigation.
7. Update active documentation in this slice so no active document still mandates a desktop
   topbar, topbar Agent, screen-reader-only duplicate route H1, or fixed five-slot mobile bar.

**Slice 1C — visual token and typography foundation**

1. Rebind the existing semantic palette, type, radius, spacing, content-width, and shell geometry
   variables to the approved foundation. Preserve semantic variable names used by current
   components.
2. Make Geist the only loaded family. Move public/flow named roles onto Geist; migrate every
   Barlow family consumer before deleting the Barlow loader, CSS variable, bundled font files,
   license file, and stale two-font comments in this slice. Preserve separate semantic type scales
   even though they share a family.
3. Add explicit validation mappings for global CSS/website CSS and changed shell owners so the
   final repository diff selector includes source-policy checks and relevant shell/public browser
   coverage. Do not broaden ordinary component changes to all E2E tests.
4. Update `docs/design.md`, `docs/frontend-architecture.md`, `docs/ui-component-system.md`, and
   the Growth Agent placement sentence in `docs/architecture.md` with the shipped owners and
   values.

**Acceptance**

- Every authenticated route has exactly one truthful H1.
- Desktop has no global topbar; Search and Agent are reachable in the sidebar.
- Compact widths have one mobile topbar and one off-canvas navigation tree; no fixed bottom nav or
  duplicated secondary tree remains.
- Ctrl/Cmd+K, pointer Search, Agent, project switch, account access, navigation prefetch/active
  state, capability filtering, route context, and focus restoration still work.
- A document-width check passes at all target widths and final content is not hidden behind fixed
  chrome or safe-area padding.

**Focused checks after each Phase 1 slice**

- Exercise the affected shell behavior in actual Chromium. For the completed shell cutover,
  include 980/981 and 767/768 boundary checks.
- Run `pnpm --dir frontend lint` and `pnpm --dir frontend exec tsc --noEmit`.
- Run the affected shell, PageHeader, Command Palette, Agent, and UserMenu Vitest files; run the
  focused shell Playwright scenario after Slice 1B. These are iteration checks, not substitutes
  for the final repository selector.

### Phase 2 — four representative product archetypes

Apply the shared foundation to one representative of each recurring page pattern. Do not migrate
remaining routes until these four are visually and behaviorally proven.

#### 2A. Overview — `/projects`

**Owners:** `components/projects/projects-screen.tsx`, `dashboard-screen.tsx`,
`dashboard-sections.tsx`, `dashboard-primitives.tsx`, and `dashboard-controls.tsx`.

- Keep current query/mutation owners and reading order.
- Put Manage project, Edit facts, and conditional Executive PDF actions in the page header when
  their state permits.
- Keep project identity, Next action, and Track as bounded semantic objects.
- Convert company facts, project-state metrics, Movement, ranked actions, and report proof to open
  or ruled sections using existing `EditorialSectionHeader`, `MetricGroup`/`MetricItem`, ledger,
  and stack owners where their semantics match.
- Preserve unavailable versus zero, stale/error notices, keyboard reordering, report state, and
  pre-audit usefulness.
- Remove the duplicate Overview project selector only after the shell `ProjectSwitcher` is proven
  with two projects; keep edit/add actions and all capability gates.

#### 2B. Analytical workspace — `/site`

**Owners:** `components/site-health/site-health-screen.tsx`, `dashboard-layout.tsx`,
`status-strip.tsx`, score/overview/inventory/page-kind/facts presenters, all five tab panels, and
`app/(app)/site/page.tsx`.

- Put the title, any existing factual description, Export, and the one contextual Run/Stop action
  in the page header; keep the five-tab list directly below it.
- Preserve server-phase tab defaults, URL state, prefetch, crawl lifecycle, progressive inventory,
  separate projections, evidence, query order, and contextual Agent launcher.
- Normalize score/overview facts through shared hairline bands without forcing score rings or
  coverage semantics into a universal metric API.
- Keep Architecture/AEO compact labelled-record behavior and ordinary dense-table horizontal
  containment.
- Remove the route-level `TooltipProvider` only after confirming `AppShell` ownership.

#### 2C. Collection/master-detail — `/issues`

**Owners:** `components/issues/issues-screen.tsx`, `issues-catalog.tsx`, summary, list, detail,
occurrence, evidence, and filter presenters.

- Keep the compact issue summary and server-backed toolbar.
- Replace the hard-coded desktop split with `--pane-list-detail`.
- Compose list and detail inside one Issues-owned hairline boundary; do not create a global
  master-detail component.
- Keep the selected list row obvious through blue accent, not an extra card.
- Preserve sticky, viewport-bounded detail and independently scrollable evidence on desktop.
- Below the compact breakpoint, present the list as a horizontally reachable master strip above
  the complete detail; selection must not hide or discard evidence.
- Keep no-crawl, no-match, loading, and error states semantically explicit.

#### 2D. Creation workspace — `/content`

**Owners:** `app/(app)/content/page.tsx`, `components/content/content-screen.tsx`, composer,
result/state, target/skill, and history owners, plus `frontend/lib/content/markdown.tsx`.

- Move History into the page header while retaining its current drawer and state rules.
- Remove the outer composer card and use one open creation column capped at a readable measure
  around the prototype's 840px, while allowing generated output/table content to own its necessary
  width.
- Preserve the two target alternatives, instruction, channel/format skills, quiet context summary,
  and one primary Generate action.
- Keep generating, error, and successful results as distinct semantic states. Preserve bounded
  output, provenance, truncation, feedback, and both header/footer output actions.
- In the rendered Content surface, demote generated Markdown headings one semantic level
  (`h1`→`h2` through `h5`→`h6`, clamping `h6` at `h6`) so the page header remains the sole H1.
  Preserve the raw Markdown byte-for-byte for copy and export.
- Remove the route-level `TooltipProvider`; retain Suspense and handoff parsing.

**Acceptance for Phase 2**

- The four routes visibly share page-header, type, spacing, button, tab, metric, rule, and table
  language without becoming the same screen.
- No route changes a query key, mutation, payload, URL-state rule, capability check, or factual
  label.
- All four retain loading, empty, populated, error, unavailable, and compact-width paths.
- No route adds a second component hierarchy or local stylesheet.

**Focused checks**

- Browser-check all four routes at 1440x900, 1280x720, 768x1024, and 390x844.
- Exercise Website tabs/crawl actions/table, Issues filters/selection/evidence/pagination, Content
  target/skill/generate/cancel/history/output actions, and Overview project/report/facts actions.
- Confirm exactly one H1 even when generated Content begins with `#`, no document-level horizontal
  overflow, intended local table scrolling, reachable actions, sticky/scroll behavior, and visible
  focus.
- Run `pnpm --dir frontend lint` and `pnpm --dir frontend exec tsc --noEmit`.
- Run the affected Projects, Site Health, Issues, Content, and Markdown-renderer Vitest files plus
  the focused route Playwright scenarios. Leave repository-wide selection to the final gate.

### Phase 3 — focused flows and public landing

**Primary owners**

- `components/auth/flow-shell.tsx`, `auth-form.tsx`, login/register routes
- `components/onboarding/onboarding-screen.tsx`, `onboarding-stages.tsx`, `review-step.tsx`,
  `icp-confirmation.tsx`, and focused choice controls
- `app/website-type.css`
- `components/marketing/landing/{shift,workflow,packs,trust}.tsx`
- `components/marketing/primitives/button.tsx`
- `lib/marketing-content/landing.ts`
- shared marketing/flow tests, browser specs, and design-source policies

**Focused-flow changes**

1. Keep `FlowShell` as the single auth/onboarding geometry owner and retain its scroll/action/footer
   ownership.
2. Apply the approved compact card measures, short-laptop height rules, and all-Geist focused-flow
   ladder centrally in `website-type.css`.
3. Replace mixed product/public type calls in `AuthFormShell` with named focused-flow roles.
4. Add only a small local onboarding stage-header owner for the three identical stage heading
   assemblies; do not turn it into a universal page header.
5. Delete `FlowGroup.icon` and the five decorative icon-tile uses in review/confirmation. Retain
   Google identity, password visibility, progress, status, selection, add, and edit icons because
   they communicate state or action.
6. Preserve form labels, errors, `aria-invalid`, browser autocomplete, OAuth, submission, loading,
   back/exit, discovery, confirmation, capacity, and sticky action behavior.

**Landing changes**

1. Keep all seven production sections and every factual string.
2. Remove decorative icon/tile metadata and rendering from Shift (three), Packs (six), and Trust
   (four): 13 decorative icons removed.
3. Retain no more than the four workflow-stage wayfinding icons, normalize them to one blue accent
   treatment, and colocate their small mapping with the one consumer. Delete the broad
   `landing-icons.ts` registry if it has no remaining consumer. Functional CTA arrows, platform
   logos, and product-preview glyphs remain.
4. Replace icon-tile grids with numbered/open editorial rows and hairline separation in the
   existing section owners. Do not add a replacement card component.
5. Remove heading/body weight, tracking, leading, mono, and size overrides that restate named
   website roles. Move shared action type into the marketing button primitive.
6. Keep the real product-preview type inside `.app-type-scale`; its compact product UI is
   intentionally distinct from surrounding marketing copy.
7. Apply compact gutter/section rhythm through shared variables and `Section`; inspect every public
   route that consumes those owners for regressions without redesigning the route.
8. Correct only stale comments made false by the cutover. Do not rewrite marketing claims.

**Acceptance**

- Login, registration, and onboarding are compact, coherent, keyboard reachable, and fit short
  laptop and mobile heights without losing actions.
- Landing icon density falls from 17 repeated decorative tiles to at most four lifecycle
  wayfinding icons; all content and factual claims remain.
- Product, public, and focused-flow typography use Geist and named roles with no Barlow or local
  role-restating overrides.
- Shared public CSS changes do not regress pricing, enterprise, solutions, blog, compare, FAQ,
  MCP docs, or legal routes.

**Focused checks**

- Exercise `/login`, `/register`, and every onboarding stage at 1440x900, 1280x650, 768x1024,
  640x900, and 390x844, including validation, password control, back/edit, progress, sticky actions,
  and completion/capacity paths.
- Inspect `/` and one representative shared `PageHero` route at desktop/tablet/mobile; verify one
  H1, section order, menu behavior, real product preview, CTA destinations, and no document-level
  overflow.
- Run `pnpm --dir frontend lint` and `pnpm --dir frontend exec tsc --noEmit`.
- Run the affected flow, auth, onboarding, landing, and marketing-primitives Vitest files plus the
  focused auth/onboarding and marketing Playwright scenarios.

### Phase 4 — migrate remaining authenticated routes

Migrate bodies only after the four representative patterns pass. The Phase 1 header/shell cutover
already guarantees one H1 and current navigation for these routes.

| Pattern | Routes | Application rule |
|---|---|---|
| Analytical workspace | `/demand`, `/performance`, `/products`, `/visibility`, `/ai-referrals` | Reuse page header, tabs/toolbars, open sections, metrics, and existing table/record primitives. Preserve date/filter/query semantics and presentation-specific charts. |
| Collection/detail | `/opportunities`, `/runs`, `/runs/[runId]`, `/prompts` manage/read modes | Reuse the proven list/detail or ledger/detail rhythm only where the current screen has that semantics. Preserve URL state, drawers, evidence, schedules, pagination, and mode gates. |
| Focused settings | `/settings` and its current tabs | Use the compact page header, fields, sections, and responsive stack. Preserve provider/integration/billing behavior from clean main and do not absorb settings into a generic auth form. |
| Entity detail | `/site/crawls/[crawlId]/pages/[siteUrlId]` | Omit the generic route heading so the entity heading is the sole H1. Preserve evidence, drawers, and back/deep-link behavior; apply only shared type, spacing, rule, and action treatment. |
| Shell states | `(app)/loading`, error, and not-found surfaces | Keep truthful status/error semantics and fix stale canonical links; use the same page geometry without pretending these are full analytical workspaces. |

For each owner:

1. Classify its existing regions against the four proven patterns.
2. Move existing actions into the in-pane header where state ownership permits.
3. Replace only demonstrated duplicate wrapper/spacing composition.
4. Retain domain-specific control and presenter owners.
5. Remove route-level `TooltipProvider` and no-op one-child layout wrappers only when shell/screen
   ownership is confirmed.
6. Do not make a route visually identical to a representative at the cost of its information
   hierarchy.

**Acceptance**

- Every authenticated route uses the approved shell, one page header, compact role ladder, and
  sanctioned composition primitives.
- Filters, tables, drawers, scheduling, page actions, URL/deep-link state, and API behavior are
  unchanged.
- No route has a local fork of shell, header, toolbar, metric, button, or token behavior.

**Focused checks**

- Exercise every route at desktop and one compact width; use the full four-width matrix for routes
  with tables, drawers, schedules, fixed/sticky controls, or master/detail regions.
- Explicitly exercise Demand filters, Performance ranges, Commerce Suite tables/actions,
  Opportunities filters/handoff, Visibility tabs, Runs evidence and scheduling, AI Referrals,
  Prompts modes, Settings integrations/providers/billing, and URL detail evidence.
- Run `pnpm --dir frontend lint` and `pnpm --dir frontend exec tsc --noEmit`.
- Run the affected route-owner Vitest files and focused Playwright scenarios for each migrated
  behavior. Leave full diff selection to final `test.ps1`.

### Phase 5 — runtime proof and final zero-reference cleanup

Every known replacement is a clean cutover: migrate all callers and delete its superseded path in
the owning phase above. Phase 5 does not postpone the old topbar, mobile navigation, duplicate
controllers, Barlow assets, decorative icon APIs, route providers, or feature-local geometry. It
begins only after the migrated actual product passes its full-surface smoke and removes only
unplanned zero-reference leftovers exposed by the completed cutovers.

**Full runtime proof before final cleanup**

- Use real Chromium against the actual application, not static source assertions.
- Verify 1440x900 desktop, 1280x720 short laptop, 768x1024 tablet, 767x1024 breakpoint edge,
  390x844 mobile, and 980/981 shell boundary spot checks.
- Traverse Overview → Website → Issues → Content → remaining routes through navigation and browser
  history while confirming the shell remains mounted.
- Exercise Search/Ctrl+K, Agent/context launch, project switch, account/Settings, form validation,
  drawers, tables, filters, pagination, scheduling, page actions, and public navigation.
- For every representative route, check `documentElement.scrollWidth <= clientWidth + 1`, exactly
  one H1, local overflow ownership, safe-area clearance, action reachability, and visible focus.
- Use keyboard-only passes for menus, Command Palette, tabs, radio/choice controls, dialogs,
  drawers, and Escape/focus return. Check reduced-motion and forced-color modes on the shared shell
  and one focused flow.

**Cutover deletion record and final cleanup**

Confirm the known deletions already happened in their owning phases:

- Phase 1A: duplicate Command Palette Settings/filter logic and duplicate account/controller paths.
- Phase 1B: desktop topbar, fixed mobile primary/secondary navigation, stale topbar-height/safe-area
  geometry, and superseded page-title override paths/tests.
- Phase 1C: Barlow loader, variable, font files, license, and stale two-font comments.
- Phase 2: representative-route duplicate providers/wrappers, Overview project picker plumbing,
  and hard-coded Issues split geometry.
- Phase 3: `FlowGroup.icon`, its decorative imports, and obsolete landing icon/tile metadata or
  registries.
- Phase 4: remaining authenticated route provider/no-op wrappers and legacy typography aliases
  after their final callers migrate.

After runtime proof, search again and delete any additional truly unused primitive, stale comment,
or incorrect canonical link exposed by the cutover, but only with zero-reference proof and no
active documentation contract. Do not delete domain coordinators, Website tab panels, evidence
presenters, Content history/result owners, project edit/facts owners, query hooks, or behavior
tests merely because their visual wrappers changed.


**Review and final gates**

1. Perform a scope/simplification review of the full diff: behavior preservation, duplicated
   owners, prop-heavy abstractions, obsolete code, accessibility, responsive overflow, and active
   documentation contradictions.
2. Apply review findings, repeat the affected actual-surface scenarios, and record every file
   changed while fixing a failed `test.ps1` retry.
3. From repository root, run once in required order:

   ```powershell
   .\scripts\check.ps1
   .\scripts\test.ps1
   ```

4. Fix every failure without weakening lint, complexity, duplication, architecture, design,
   validation mapping, type, or test policy. Re-run `test.ps1 -ChangedFiles ...` only after an
   earlier failing `test.ps1` in this task and include the complete retry delta.

**Done means** all requested behavior is visually proven on the real application, both root gates
pass, all active docs describe the shipped shell/type system, all superseded paths in the deletion
ledger are gone, and no mock/prototype implementation has entered production.

## 7. Test strategy

### Keep and update behavior tests

- Shell/navigation: canonical destinations, active state, drawer open/close/focus, capability
  visibility, route prefetch, instant navigation, mobile account access, and one H1.
- Command Palette: shortcut, pointer/mobile launcher, filtering, arrow/Enter, Escape, focus return,
  project switching, shared destination/capability parity, and no results.
- Agent: entitlement states, route/date/filter/project context, contextual launcher, project reset,
  close/focus, and one drawer owner.
- Overview: onboarding handoff, pre-audit state, facts, zero/unavailable distinction, next action,
  Track, report, editing, notices, and keyboard reordering.
- Website: tab URL/default rules, one Run/Stop action, export, first crawl, progressive state,
  terminal transitions, sorting, filters, cursors, evidence, labelled records, and detail links.
- Issues: filter/cursor/history state, Defect/Advisory vocabulary, selection/detail query,
  remediation/evidence, copy prompt, affected page kinds, and occurrence pagination.
- Content: authorized handoffs, target alternatives, skills, empty instruction, lifecycle,
  cancel/retry/regenerate, rendered heading demotion with one page H1, byte-for-byte raw Markdown
  copy/export, truncation, feedback, History, and active-row deletion protection.
- Auth/onboarding: provider/email paths, validation/API errors, handoffs, redirects, stage gates,
  discovery, confirmation, caps, payload, capacity, and completion.
- Landing/public: one H1, exact section order/anchors, factual claim guards, anonymous content,
  CTA routes, navigation, real product preview, and shared page/footer behavior.

### Do not add low-value tests

- No snapshots of prototype HTML.
- No Tailwind class-string or token-value assertions in component tests.
- No tests that merely count cards, icons, wrappers, or DOM children.
- No source-text tests for visual recipes beyond the repository's existing architectural/design
  policy owners.
- No duplicate jsdom viewport cases for geometry that only a browser can prove.

Responsive clipping, sticky/fixed overlap, drawer double-scroll, table/record transformation,
short-height action reachability, and visible focus belong in the real-browser smoke above. Add a
permanent Playwright assertion only when it protects stable behavior or reproduces a plausible
regression discovered during implementation.

## 8. Risks and controls

| Risk | Control |
|---|---|
| Current branch changes entitlement/billing owners before this work starts | Hard clean-main precondition and Phase 0 re-baseline; never apply this plan to the dirty branch. |
| Removing the topbar creates missing or duplicate H1s | Atomic explicit `PageHeader` migration across every authenticated route; one-H1 browser check. |
| Desktop/mobile launchers mount duplicate dialogs or drawers | One controller owner per feature; mobile uses explicit launch events, never a second component instance. |
| Responsive account access duplicates state or logout mutations | One `UserMenu` controller and menu content owner with trigger-only desktop/mobile presenters; omit the account block from the compact drawer. |
| Mobile drawer reduces route discoverability | Reuse the same complete navigation registry and sidebar renderer; test every group/destination and active state. |
| Navigation and Command Palette capability rules diverge | One shared destination/capability resolver; delete parallel Settings commands and duplicated filters. |
| New 980px shell breakpoint conflicts with feature breakpoints | Keep feature-local responsive modes unless visually broken; test 980/981 plus 767/768 and tablet widths. |
| Removing cards changes sticky or overflow ancestors | Prove Issues, tables, output, and drawers before cleanup; preserve the intended scroll owner explicitly. |
| Global token/type changes regress public or focused routes | Named role migration, explicit public-route sweep, and validation mappings for both CSS owners. |
| All-Geist cutover leaves dead font payload or mixed roles | Zero-reference search before deleting Barlow; final search for `--font-barlow`, Barlow files, and call-site role overrides. |
| Icon reduction removes meaning | Delete only decorative repeated tiles; retain action, status, provider, platform, selection, and compact workflow wayfinding icons. |
| Visual consolidation mutates product behavior | Keep coordinators/hooks/contracts intact; tests assert consumer-observable behavior, not new markup. |
| The change grows a generic wrapper hierarchy | Require two semantically identical production consumers; otherwise keep composition in the existing feature owner. |

## 9. Initial implementation map

The intended first implementation session, after the clean-main precondition, is deliberately
narrow:

1. Re-baseline clean main and record the final owner/deletion inventory.
2. Implement Phase 1A only: unify destinations/capabilities and extract trigger presenters for the
   single Command Palette, Agent, and account controllers under the existing shell.
3. Prove 1A with focused shell interaction, lint, type, and affected behavior tests; delete its
   superseded parallel lists/controllers.
4. Implement Phase 1B as one atomic shell/header cutover, update its active docs, delete the old
   topbar/mobile navigation paths, and prove every route still has exactly one H1.
5. Implement Phase 1C visual tokens and all-Geist family cutover, delete Barlow in that slice, and
   prove shared public/focused surfaces before changing representative route bodies.
6. Stop adding shared foundation. If a representative page needs a one-off structure, compose it
   locally first; promote it only after the second real consumer is known.
7. Implement Phase 2 in the fixed order Overview → Website → Issues → Content, with behavior and
   responsive proof after each route and one consolidated focused-check pass.
8. Continue to flows/landing and remaining routes only after the four archetypes are coherent.
9. Run the final zero-reference cleanup and reviewer pass only after the migrated actual product is
   proven, then run the repository-wide gates once in their required order.

This order keeps the highest-leverage owners first, makes the four representative pages the design
proof instead of inventing abstractions in advance, and leaves product functionality untouched.
