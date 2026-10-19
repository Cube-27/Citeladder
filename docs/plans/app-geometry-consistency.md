# App geometry consistency

Owner finding (2026-10-19): the authenticated app looks inconsistent and "vibe
coded" next to a reference product whose design is boring and has no
deviations. The grained ground and the floating sheet are not the problem; the
variation in rendered controls is: a button at one height beside a tab at
another, repeated on every screen. Code reading does not see it, and the
2026-10-09 token pass (#318–#320) did not fix it, because `pnpm check:policy`
checks what the code *asks for* (tokens, classes) and the eye sees what the
browser *renders*. This plan removes the variation at its source and adds a
check that measures the rendered app, so the variation cannot return.

Brand, palette, type, the ground, the sheet, hairline material and every
feature's content stay as they are. Visual work changes no copy, data or flow.

## Evidence

A rendered census of all 20 app routes at 982×900 (the owner's viewport), DPR 1,
through the E2E shell fixture (`e2e/helpers/app-fixture.ts`), light theme,
empty/error data states. Numbers are bounding-box heights.

| Category | Rendered heights (count) | Where |
| --- | --- | --- |
| Buttons | 24 (4), **28 (36)**, **32 (57)**, 34 (18), 36 (2), 44 (18) | 24: Runs status pills; 28: every page action and filter trigger; 32: icon buttons, Retry; 34: project switcher; 44: account menu |
| Tabs | 32 (30) | Prompts, Visibility, AI Traffic, Settings |
| Inputs | 26 (4), 34, 36 | 26: the Prompts search field and the three Agent screens; 34/36: login |
| Selects | 28 (4), 32 (2) | AI Traffic and Actions 28; Prompts and Settings 32 |
| Chips | 28 avatar, 40 (Settings), 4/6 dots | |
| Sidebar links | 32 (207), 24 (36), 26 (18) | |
| Headings | h1 20px/28 tall; h2 16px; Agent section headings 14px | |

Concrete pairs the eye meets on one screen:

- Every sheet route's header, left to right: page action **28** → Open agent
  **32** → theme toggle **32** → account menu **44**.
- Prompts: the search field is **26** beside a **28** Filter button, both under
  **28** header actions and **32** icon buttons.
- Visibility and AI Traffic: **32** tabs stacked 9px above **28** filter
  triggers (tab padding 10px, trigger padding 12px).
- Runs: **24** status pills with 12px text in the same band as a **28** Launch
  audit with 14px text.
- Sidebar: the project switcher is **34**; the Dashboard | Agent switch is a
  28 track with 24 segments; destinations are 32.

Static cause, in `frontend/`:

- `components/ui/button-variants.ts` exposes seven sizes. `size="sm"` (28px)
  is used **212** times, the 32px default 22 times, `lg` 12, `icon` 20,
  `iconSm` 5, `compact` inputs 6. Non-default sizes are chosen in **110 files**
  across 20 folders.
- `apps/app/src/globals.css` `[data-page-band='control']` rebinds
  `--control-height-md` to `--control-height-sm`, so a 32px control becomes 28
  the moment it enters a toolbar.
- `components/ui/segmented-variants.ts` sets a 28 track with 24 segments;
  `filter-chip-variants.ts` sets 24 (interactive) and 20 (static);
  `components/layout/user-menu.tsx` is 44 around a 28 avatar.
- `PageShell` (`components/layout/page-shell.tsx`) has the right bands and
  slots (`actions`, `tabs`, `controls`), but only 12 of 29 users fill
  `controls`; 13 folders render `FilterRow`/`SearchField` outside it.
- App components carry 209 responsive Tailwind prefixes (45 `lg:` at 1024px)
  while the app's own breakpoints are 980 and 1200. At 982px every `lg:` rule
  is off, so the layout the owner sees is not the layout the code reads as.
  The reference product has 30 prefixes and no `@media` in its globals.

A second census the same day measured spacing. The shell is uniform: identity
band 57 tall with 24 gutters and 16 title→actions, tabs 32 with a 4 gap,
content gutter 24 on every route, sidebar rows 32 / padding 12 / gap 4. The
variation is below the bands, where no organism owns the rhythm:

| Role | Rendered | Intended |
| --- | --- | --- |
| Gap between content sections/cards | 0 (Demand, Settings) · 16 (Products, Prompts, Integrations) · 24 (Runs, Billing, Agent) | 24 |
| Card → next card | 16 (Products) · 24 (Billing); horizontal 12 (Demand) · 16 (Settings) | 16 |
| Heading → content | 4 · 8 · 12, three values on Billing alone | 12 |
| Error / empty block | the same block at 20 · 32 · 88 · 120 · 152 tall | one footprint |
| Card padding | 16 visible on 8 of 9 cards, but on the card element for only 4; Products error card 40 | 16 on the card |
| Tab padding-x | 10 (off-grid) against button 12 | 12 |
| Control band | 41 (Runs, 24px pills) · 45 (others) | one height |

Tables and most cards did not render under the 404 fixture, so the PR 2 spec
stubs at least one list route with fixture rows to measure cells and rows.

The census artefacts (spec, config, summariser, records, screenshots) are in
the session scratchpad and are reproduced by the PR 2 spec below.

## Owner decisions (2026-10-19)

Recorded from the owner's answers in chat on 2026-10-19: the census above was
confirmed as the problem ("the problem is inconsistency, not the grained ground
and floating sheet"), the reference is a product that is "absolutely consistent
and boring, no deviations", and the six decisions and the three-PR delivery
below were approved as written.

1. **One control height in the product: 32px.** Buttons, inputs, selects,
   search fields, filter triggers, segmented controls, tabs, sidebar
   destinations, the project switcher, the account menu, the theme toggle and
   icon buttons are all 32. The 28 rung (`--control-height-sm`, `size="sm"`,
   `iconSm`, `compact`) and the toolbar rebind are deleted from the product, not
   kept as options. `lg` 36 and `xl` 44 remain for the public website and the
   auth/onboarding flow only, where they already are.
2. **One badge height: 20px, 12px text,** for status and count objects that sit
   inside text or cells. Anything the user clicks is a control, not a badge:
   the Runs status pills and the interactive filter chips become 32px controls
   with 14px text.
3. **One box recipe.** `Card` (a semantic object) and `Panel` (a nested
   structural box) stay distinct in meaning but share radius 12, padding 16 and
   a one-pixel `border` edge; no tone or padding variant may change geometry.
4. **One page recipe inside `PageShell`.** Every list screen is identity band →
   optional tab row → control band (search, filters, segmented switch) →
   content. Search and filters render only through the `controls` slot; no
   feature renders a toolbar of its own.
5. **One product breakpoint.** Product components use the app's own
   `desktop` variant (≥981px, matching `globals.css`) for layout changes and
   nothing else; `sm:`/`md:`/`lg:`/`xl:` are removed from `components/` outside
   `marketing/`. Public and flow surfaces keep their own ladder.
6. **Rendered geometry is a CI check.** A Playwright spec walks every product
   route at 982×900 and fails when a category renders more than one height,
   radius or font size. The policy check keeps guarding inputs; this guards
   outputs.

Added the same day, owner's framing: "the atomic design theory in essence will
solve everything". The app has atoms (`components/ui`, each with a size menu)
and pages (feature folders composing atoms and setting geometry) but no
mandatory molecule/organism/template layer; the reference product has one.

7. **Atoms have one form.** No size, padding, gap or radius prop on an atom;
   an atom's geometry is a token the atom owns. Text controls share one
   horizontal padding (12), icon-only controls 0, tabs the same 12 as buttons
   (the census found 0 / 8 / 12 / 16 on buttons and 10 on tabs).
8. **Pages compose organisms and templates, never geometry.** Feature folders
   may not carry `h-*`, `p-*`, `gap-*`, `rounded-*`, `size=`, `padding=` or
   responsive prefixes. A page is a template (`ListScreen` or `DetailScreen`
   inside `PageShell`) plus data plus the organisms it shows (`FilterBar`,
   `TabRow`, `StatRow`, `QueryState`, `DataTable`). When a page needs something
   new, the organism is built in `ui/`, not assembled in the page.
   `check:policy` enforces the layering so the result is structural.

## Work

Three PRs, each ≤100 files, dependency-ordered, repository runnable after each.
No compatibility layer: PR 1 and PR 2 move call sites to the default *before*
PR 3 deletes the variants, so nothing is aliased or deprecated.

### PR 1 — call sites to the one height (visibility, agent, site-health, ai-traffic, settings, projects, layout)

- Remove `size="sm"`, `size="iconSm"` and `size="compact"` from ~67 files in
  these folders; the primitives' defaults are already 32.
- Delete the `[data-page-band='control']` rebind in `globals.css` so toolbar
  controls render at the same 32 as the rest of the page.
- Runs status pills and filter chips used as controls become 32px `Button`
  variants in these folders.
- Account menu 32 (avatar 24), project switcher 32, Dashboard | Agent switch a
  32 track with 28 segments.
- Verify: the census spec from PR 2, run locally on these routes, reports one
  button/input/select/tab height.

### PR 2 — remaining call sites, the organisms and templates, the rendered check

- Same prop removal in the other folders (~45 files: billing,
  search-intelligence, runs, prompts, products, demand, performance,
  onboarding, knowledge-base, integrations, providers, mcp, ui).
- Organisms in `ui/`, each owning its geometry: `FilterBar` (search + filter
  triggers + segmented switch, one gap), `TabRow`, `StatRow` (replaces
  `stat-grid`, `audit-metric-strip` and `dashboard-primitives` metric rows),
  `QueryState` (loading, read-error and first-use empty in one footprint),
  `DataTable` (header, rows, pager, states; wraps `Table`). Templates
  `ListScreen` and `DetailScreen` inside `PageShell` own the band order and
  every band-to-band gap.
- The 13 folders that render search/filters outside `PageShell` move onto
  `FilterBar` in the `controls` slot; the spacing census (below) decides which
  other page-local compositions move onto an organism in this PR.
- `e2e/geometry-census.spec.ts`: for every product route, stub the shell,
  measure every visible control/badge/tab/heading/box and its padding, every
  band gap and card gap, and assert one value per role. Added to the E2E
  job's file list.

Done in PR 2: the prop removal; `FilterBar` (replaces `FilterRow` and
`pageToolbarClasses`; `PageShell` `controls` renders it), `TabRow` (replaces
`TabsBar` and the `Tabs` `variant` prop; `PageShell` `tabs` renders it, padding
12), `QueryState` (replaces `PageLoading` and every route-level loading,
read-error and first-use empty, including `NoProjectState`'s body); `PageShell`
content stacks sections 24 apart; badges render at 20; Runs status pills are
32px secondary `Button`s with `aria-pressed`; the census spec, selected in CI by
the organisms, `PageShell`, `globals.css` and the shell fixture.

Moved to PR 3: `StatRow`, `DataTable` (whose header takes the card-scoped
`FilterBar`s left in Visibility sources and fan-out, Search Intelligence
datasets, Settings members, Site Health internal links and the Products catalog
search), `ListScreen`/`DetailScreen`; deleting `EmptyState`, `InlineEmpty`,
`screen-states` and `FilterChip` once their remaining section-level users move;
segmented items' 12px badge text; a fixture with neighbouring cards so the
census measures card→card gap.

### PR 3 — delete the menus, lock the recipes, one breakpoint, the layering check

- Delete `sm`, `iconSm`, `iconRound` from `button-variants.ts`, `compact` from
  `input.tsx`/`search-field.tsx`, the 24/20 interactive chip rung, every
  padding variant on an atom, and `--control-height-sm` from the product
  ladder; regenerate the controls table in `docs/design.md`.
- `Card`/`Panel` geometry locked to one radius/padding; tone-only variants.
- Add the `desktop` variant; replace `sm:`/`md:`/`lg:`/`xl:` in product
  components.
- `check:policy` layering rule: feature folders may not carry geometry
  utilities (`h-*`, `p-*`, `px-*`, `py-*`, `gap-*`, `space-*`, `rounded-*`,
  `m-*`), `size=`/`padding=` props or responsive prefixes; geometry lives in
  `ui/` only. Existing debt is ratcheted to zero within this PR, not baselined.
- `docs/design.md`: Data and geometry and Component recipes updated to the
  single height, single padding, single badge, single breakpoint and the
  atomic layering; the review checklist points at the census.

Done in PR 3:

- Atom menus deleted, no aliases: `sm`, `iconSm`, `iconRound` from
  `button-variants.ts` (the theme toggle is the 32px `icon` button);
  `compact` from `Input`, and `SearchField` has no `size` at all;
  `FilterChip` and the 24px interactive chip rung (`filter-chip.tsx`,
  `filterChipClasses`; the market and engine toggles in the launch dialog are
  secondary `Button`s with `aria-pressed`, the radio chip is the same face);
  `filter-chip-variants.ts` is `tag-variants.ts` (tags only); the filter
  trigger's wide-screen-only glyph; `--control-height-sm` and
  `--badge-height-md` from the product ladder. The only 28 left is the
  website's coded product views, scoped to `[data-public-surface]` /
  `[data-flow-surface]` in `website-type.css`. The controls table in
  `docs/design.md` is regenerated.
- One box recipe: `cardClasses` and `panelClasses` are radius 12, a 1px
  `border` and padding 16 on the box element; `Panel`'s `pad` and `edge`
  options and `CardContent`'s `flush` are deleted, and every call site that
  cancelled or re-added the inset (`p-0`, `pt-*`, `m-[var(--card-padding)]`)
  is gone. Tinted panels keep a transparent border, so the geometry is one.
  A `QueryState`/`EmptyState` nested in a box shares its inset.
- The `desktop` variant (`@custom-variant`, ≥981px) and zero
  `sm:`/`md:`/`lg:`/`xl:`/`min-[…]`/`max-[…]` in `components/` outside
  `marketing/`, `auth/` and `onboarding/` (62 rules in `ui/` and `layout/`,
  ~140 in features). Segmented items set control text (14).
- `check:policy` layering rules (`featureLayeringFindings`):
  `layer-breakpoint` in every product folder (count 0), and in feature
  folders `layer-geometry` (spacing, sized-box and radius utilities) and
  `layer-size-prop` (`size=`/`padding=`), ratcheted per file.
- The census runs at 982×900 and 1280×900, light and dark, with the same
  literals, and now also requires box padding 16 / radius 12 / border 1 and a
  measured card→card gap (two Settings integration cards from a fixture).

Left for a follow-up (the plan stays active for these):

- The organisms and templates moved from PR 2: `StatRow`, `DataTable` (and
  the five card-scoped `FilterBar`s onto its header), `ListScreen` /
  `DetailScreen`, then deleting `EmptyState`, `InlineEmpty` and
  `screen-states` once their 16 / 39 / 1 users are on `QueryState` and the
  organisms. They did not fit: the four PR 3 parts alone touched ~125 files.
- The ratcheted layering debt, 1,342 findings in every feature folder at the
  time of PR 3 (`site-health` 188, `agent` 145, `visibility` 120, `runs` 100,
  `projects` 99, `settings` 92, `prompts` 91, `performance` 48, `ai-traffic`
  48, `demand` 48, `opportunities` 45, `products` 43, `billing` 66,
  `search-intelligence` 59, `knowledge-base` 37, `auth` 39, `onboarding` 28,
  `integrations` 23, `providers` 15, `mcp` 8). Most are icon sizes, row gaps
  and the hand-built record tables that `DataTable` will own. The remaining
  `size=` props are `Avatar`, `BrandLogo`, `Spinner` and `ScoreRing` size
  menus (atoms with more than one form) and the `size="icon"` button form.

### PR 4 — the organisms and templates

Done in PR 4:

- `StatRow` (`ui/stat-row.tsx`): one KPI row of equal segments divided by
  hairlines (up to four a row, balanced beyond), segments padded 12 and 16
  from their divider, flush with the card on every outer edge, one height per
  row; label with icon and marker, caption, the `figure` value or a 48px
  `ScoreRing`, delta, sub-line, one action, pressable toggles. It replaced,
  with every user migrated and no alias: `ui/stat-grid.tsx` (`StatGrid`,
  `StatItem`), `MetricGroup`/`MetricItem`/`metricItemClasses` and
  `hairlineBandClasses`/`hairlineBandItemClasses` in `ui/workspace.tsx`,
  `site-health/audit-metric-strip.tsx` (deleted; the Website scores are a
  `StatRow` in a card from `overview-metrics.tsx`) and `StateMetric` in
  `projects/dashboard-primitives.tsx`.
- `DataTable` (`ui/data-table.tsx`): one card with a 49px header row (title
  and the table's `FilterBar`), a fixed `Table` from column width roles, a
  padded full page of rows, the framed `Pager`, and loading/error/empty inside
  the body under the header. On it: Runs (`runs-table.tsx`), Visibility query
  fanouts, Search Intelligence datasets, Settings members and Site Health
  internal links. The Visibility Sources table keeps its `CardHeader`
  toolbar (two column sets, hinted non-sortable headers, a near-miss body and
  a cursor pager with a size control do not map onto `columns` mechanically);
  the Products catalog is a navigation tree, not a record table, and keeps its
  search.
- `ListScreen` and `DetailScreen` (`layout/page-shell.tsx`): every route
  screen is on one of them and `PageShell` is no longer exported.
  `DetailScreen` requires `back` and takes an `aside` in a
  `main-aside`/`list-detail` split (Action detail uses it); `ListScreen` takes
  `measure` and `fill` (the two chat screens).
- `QueryState` gained the `inline` empty presentation (one 32px row); the 16
  `EmptyState` users, 39 `InlineEmpty` users and the router's
  `screen-states` (now `NotFoundScreen`/`ScreenError` in
  `apps/app/src/route-error.tsx`) are on it, and `ui/empty-state.tsx`,
  `ui/inline-empty.tsx`, `layout/screen-states.tsx` and
  `.empty-state-surface` are deleted.
- Last size menus: `Spinner` (16) and `ScoreRing` (48) have one form;
  `Avatar` (`inline` 24 / `identity` 40) and `BrandLogo` (`mark` 16 / `row` 20
  / `identity` 40) take a `placement`, and neither takes a `className`.
  `ledgerClasses('boxed')` is the panel recipe (padding 16).
- The census also requires the `DataTable` header at 49, `StatRow` segment
  padding 12 and a zero height spread within a row (a run's detail is now
  rendered from a fixture), and excludes the inline state and a table's state
  row from the block footprints. It passes at 982/1280, light and dark.

Left for PR 5 (the plan stays active):

- The ratcheted layering debt, 1,289 findings after PR 4 (`site-health` 178,
  `agent` 144, `visibility` 106, `runs` 100, `projects` 94, `prompts` 89,
  `settings` 88, `billing` 65, `search-intelligence` 52, `demand` 48,
  `ai-traffic` 47, `opportunities` 45, `performance` 45, `products` 42,
  `auth` 39, `knowledge-base` 36, `onboarding` 27, `integrations` 22,
  `providers` 14, `mcp` 8), of which 42 are `size=` props (mostly
  `size="icon"` buttons and `MetricValue`'s two value sizes).
- Record tables still hand-built on `Table`: Visibility Sources
  (`visibility-sources.tsx` and `source-*`), `source-near-misses`,
  `source-prompts`, `ranking-rows`, `engine-comparison`, `source-movers`,
  `source-url-cards`, `visibility-by-market`, the breakdown tables in
  `visibility-accuracy`/`-ads`/`-perception`; Site Health
  `aeo-readiness-panel`, `architecture-panel`, `changes-panel`,
  `inventory-section`, `issue-detail-rail`, `issues-catalog`,
  `overview-details`, `page-kind-scores`, `pages-table`, `robots-history`,
  `site-facts-panel`, `url-detail`; `runs/executions-table`,
  `runs/surface-evidence`; `search-intelligence-competitors`;
  `demand-signal-table`; `agent/actions-screen`; AI Traffic
  `crawl-log-connections`, `overview-signals`, `pages-view`,
  `referral-details`, `referrals-dashboard`, `traffic-views`;
  `performance/dimension-table`; `prompts/prompt-table`,
  `prompt-answer-states`, `csv-import-dialog`; `settings/member-invitations`.

#### PR 5c — the remaining twelve feature folders

Scope: `search-intelligence`, `demand`, `ai-traffic`, `opportunities`,
`performance`, `products`, `auth`, `knowledge-base`, `onboarding`,
`integrations`, `providers`, `mcp`; nothing in `ui/` or `layout/` changed.

Done in PR 5c:

- Everything an existing organism absorbs moved onto it: vertical rhythm onto
  `Stack` (on its four rungs, so 8 → 12 and 2 → 4 where a page had picked its
  own), hand-built boxes onto `panelClasses`, divided lists onto
  `ledgerClasses`, skeleton loading blocks onto `QueryState` (Opportunities
  evidence, Products target cards, business map, data sources, provider
  list), label/control pairs onto `Field`, the Performance chart strip onto a
  bordered `CardHeader` with the granularity select in `actions`, the
  Search Intelligence metric definitions onto `Disclosure`.
- The auth and onboarding flows are product screens: their buttons and inputs
  render the one 32px control (`size="lg"`/`size="md"` deleted), and the
  onboarding brand grid uses `splitPaneClasses('peers')` instead of `sm:`.
- On `DataTable`: Search Intelligence competitive footprint, AI Traffic
  requests by purpose and request activity.
- Layering findings in these folders fell from 425 to 234; the whole layering
  debt from 1,289 to 1,098 (1,073 `layer-geometry`, 25 `layer-size-prop`).

Left (the plan stays active). Findings per folder: `demand` 34,
`performance` 31, `search-intelligence` 29, `products` 26,
`knowledge-base` 24, `auth` 20, `ai-traffic` 16, `integrations` 15,
`opportunities` 12, `onboarding` 11, `providers` 8, `mcp` 8. They wait on
organisms that do not exist in `ui/` yet:

- An `Inline` (horizontal cluster) at the button's 8 gap — about 88: icon +
  label, meta rows, button groups and chip wraps (`flex items-center gap-*`)
  in every folder; `Stack` is vertical only and has no 8 rung.
- An `Icon` atom with one size per role — about 39 lucide `size-3.5`/`size-4`/
  `size-5` classes (lucide renders 24 without one), plus the 32px icon tile in
  `integrations/data-source-setup`.
- An `IconButton` (the `size="icon"` form without a size prop) — 7:
  `knowledge-base/business-map-editor` ×3, `onboarding/choice-controls`,
  `products/catalog-list`, the password-reveal `Pressable` in `auth/auth-form`.
- A ledger row / list row that owns its padding — about 28 (`py-2`/`py-3`,
  `first:pt-0 last:pb-0` rows in `opportunities`, `products`, `providers`,
  `integrations`, `search-intelligence`, `ai-traffic/insight-strip`; the
  workspace chooser's `listRowClasses` row).
- `Tabs` owning its strip→panel gap — the `rootClassName="grid gap-*"` in
  `performance/bing-panel`, `performance-breakdowns`, `date-range-dialog` and
  `knowledge-base/brand-profile-panel`.
- A filter width role in `FilterBar` (only search has one) —
  `ai-traffic/traffic-controls` ×2, `search-intelligence-dataset-view`,
  `performance-chrome`.
- Skeleton, chart and status-mark sizes — skeleton heights in Search
  Intelligence and `performance/dimension-table`, `referrals-dashboard` chart
  height, `readiness-ladder` step marks; `MetricValue`'s two value sizes.
- One-offs: a removable chip (`business-map-editor`), an inline code token
  (`mcp/connect-strip`), a dropdown matching its trigger width
  (`connect-strip`), a wide `Dialog` (`crawl-log-connections`), the checkbox
  caption indent (`auth-form`), fallback/gate page padding
  (`policy-acceptance`, `workspace-access-gate`, `onboarding-page-client`),
  the flow stage band gap (`onboarding-stages`), the catalog tree row
  (`products/catalog-list`), an equal-halves split (`splitPaneClasses` has
  `peers` but `search-intelligence-history` sets its own gap).

Record tables still on `Table`, with the `DataTable` gap that keeps them there:

- `demand/demand-signal-table`: two-line rows need filler rows of the same
  height, and its rank (`w-16`), signal (`w-44`), clicks/CTR (`w-20`) and
  two-button action (`w-52`) columns have no width role; on the roles the
  fixed columns would total ~1,024px and leave the text column no width at
  982.
- `performance/dimension-table`: a pinned first column, a caption under a
  non-sortable header (`sublabel` renders only with `sort`), a proportional
  first column and its own horizontal scroll frame.
- `ai-traffic/pages-view` and the crawler table in `traffic-views`: numeric
  headers wider than the `figure` role (a wider numeric role, wrapping
  headers or an auto width); the coverage table in `traffic-views` also has an
  h2 title and a cursor pager.
- `ai-traffic/referral-details` (comparison, landing pages) and
  `referrals-dashboard` (source totals): a description under the title; no
  slot for one.
- `ai-traffic/crawl-log-connections` (source diagnostics): sits inside a card
  beside other content; `DataTable` would nest a card.

#### PR 5b — agent, projects, prompts, settings and billing on the shared organisms

Done in PR 5b (no `ui/` or `layout/` change):

- Record tables on `DataTable`: Agent Actions (`actions-screen.tsx`), the
  prompt library (`prompt-table.tsx`, its filtered-empty state now the
  table's own), a prompt's engine coverage and competitor gaps
  (`prompt-answer-states.tsx`) and its implemented work
  (`prompt-detail-screen.tsx`), Settings pending invitations
  (`member-invitations.tsx`), API keys (`api-keys.tsx`), MCP connections
  (`mcp-connections.tsx`) and Billing invoices (`invoice-history.tsx`).
- Vertical rhythm on `Stack`, labelled inputs on `Field`, loading skeletons
  on `QueryState`, card grids on `splitPaneClasses('peers')`, revision and
  property lists on `ledgerClasses`/`listRowClasses`; redundant geometry
  (`size="md"`, `gap-2` on `Button`, `h-8` on `Input`, `size-8` on icon
  buttons) removed. `BillingDetailsForm` lost its `idPrefix` prop.
- Layering findings: `agent` 144 → 85, `projects` 94 → 60, `prompts` 89 →
  52, `settings` 88 → 48, `billing` 65 → 19 (480 → 264); the whole layering
  debt after PR 5c fell from 1,098 to 882. The census passes at
  982/1280, light and dark.

Remainder (264: `layer-geometry` agent 84, projects 52, prompts 48,
settings 47, billing 19; `layer-size-prop` agent 1, projects 8, prompts 4,
settings 1) needs organisms `ui/` does not have yet:

- Icon size owned by placement: `size-3.5`/`size-4` on icons inside
  `Button`, `DropdownItem`, badges and captions in every folder; `Button`
  and menu items should size their `[&_svg]`.
- An inline cluster (horizontal gap, wrap, `justify-between`): title + badge
  rows, key/value rows, button groups and form actions
  (`flex justify-end gap-2` in `output-editor`, `output-canvas`,
  `context-screen`, `workflow-gallery`, `conversation`, billing
  `plan-row`/`extra-purchases`, `member-roster`/`member-invitations` row
  actions).
- `IconButton`: every `size="icon"` button is a size-prop finding
  (`member-roster`, `prompt-table`, `topic-rail`, `overview-grid`,
  `dashboard-primitives`, `project-edit-panel`, `project-markets`,
  `agent-panel-host`).
- An offer row (tonal panel, text column, trailing controls, stacked below
  desktop): billing `plan-row`, `plan-changes`, `extra-purchases`.
- A padded ledger row: `missing-prompts`, `project-markets`,
  `overview-library-widgets`, `candidate-review`, `output-history`,
  `action-detail-screen` members.
- A two-column settings section and facts list (`settings-section.tsx`,
  `action-detail-screen` `ActionFacts`) and an identity row (logo/avatar,
  title, caption: `settings-screen`, `dashboard-sections`).
- Width roles: dialog widths (`w-130`/`w-155`/`w-200`/`w-205`), dropdown
  content (`w-56`/`w-64`) and the quantity input (`w-16`).
- `DataTable`: a row-actions cell, row selection (`candidate-review`), and a
  preview mode so `csv-import-dialog`'s `CsvImportPreview` can pass columns
  instead of framing a `Table`.
- `Tabs` panel spacing (`pt-3` on `output-pane`'s `TabPanel`s), a static
  chart legend key (`prompt-detail-screen`), a chat thread/composer dock
  template (`agent-panel`, `chat-screen`, `composer`, `chat-thread`,
  `command-menu`, `conversation`), a topic tree rail (`topic-rail`), a
  reorderable list (`dashboard-sections`) and the overview widget toolbar
  (`overview-grid`).

#### PR 5a — site-health, visibility and runs on the shared organisms

Done in PR 5a:

- The layering debt of `site-health` (178), `visibility` (106) and `runs`
  (100) is gone: those folders carry no `h-*`, `p-*`, `gap-*`, `m-*`,
  `rounded-*`, `size=` or responsive prefix and have no baseline entry.
- New one-form atoms and organisms in `components/ui`, each built once:
  `Inline` (a row on the gap ladder, plus `meta` for a wrapping caption row)
  and an `item` (8) rung on `Stack`; `Icon` (the 16px glyph) and `Dot` (the
  6px marker); `IconButton`; `ledgerItemClasses`, `SubsectionHeader`,
  `MetaFooter`, `treeBranchClasses` and the `thirds` split role
  (`ui/workspace.tsx`); `ListDetailCard`/`ListDetailRow`/`ListDetailPane`
  (`ui/list-detail.tsx`); `MeterRow`; `ChartFrame`; `FilterDivider`;
  `Skeleton shape`; `Dialog width` (`form`/`wide`); `Tabs spaced`; and in
  `ui/table.tsx` `HintedTableHead`, `TableRowHeader`, `TableCell nested` and
  `desktopOnly` columns. `TableRecordMetricCell` and `.type-label-before`
  had no users left and are deleted.
- `DataTable` gained the `lead` and `index` width roles, `desktopOnly`
  columns, `hint` on unsortable columns, and the `footer` note band (a
  table's description sits there, under the rows, so the header stays 49).
- On `DataTable` now: Visibility Sources (both column sets, hinted headers,
  the near-miss table and the cursor pager with rows per page;
  `source-heads.tsx` is deleted), `source-prompts`, `ranking-rows`,
  `engine-comparison`, `source-movers`, `source-url-cards`,
  `visibility-by-market` and the accuracy, ads and perception breakdowns;
  Site Health `aeo-readiness-panel`, `architecture-panel`, `changes-panel`,
  `inventory-section`/`pages-table`, `overview-details`, `page-kind-scores`,
  `robots-history` and `site-facts-panel`; `runs/executions-table` and the
  `surface-evidence` presence table. `issues-catalog` and `issue-detail-rail`
  are a list beside its detail (`ListDetail*`), not a record table, and the
  URL detail history stays a ledger.
- The census also requires the `Icon` atom at 16 in both axes. It passes at
  982/1280, light and dark.

Left after PR 5a, 5b and 5c (the plan stays active): 498 layering findings
(478 `layer-geometry`, 20 `layer-size-prop`) in `agent` 85, `projects` 60,
`prompts` 52, `settings` 48, `demand` 34, `performance` 31,
`search-intelligence` 29, `products` 26, `knowledge-base` 24, `auth` 20,
`billing` 19, `ai-traffic` 16, `integrations` 15, `opportunities` 12,
`onboarding` 11, `mcp` 8 and `providers` 8, plus the hand-built tables
listed under PR 4, 5b and 5c outside these three folders. Much of what PR 5b
and 5c waited on now exists: `Inline` with its 8 rung, `Icon`,
`IconButton`, `ledgerItemClasses`, `Tabs spaced`, `Dialog width="wide"`,
`Skeleton shape` and `ChartFrame`.

#### PR 6b — DataTable closes its gaps; twelve feature folders on the organisms

Scope: `ui/data-table.tsx` and `ui/table.tsx`, and the twelve folders of
PR 5c (`demand`, `performance`, `search-intelligence`, `products`,
`knowledge-base`, `auth`, `ai-traffic`, `integrations`, `opportunities`,
`onboarding`, `providers`, `mcp`).

Done in PR 6b:

- `DataTable` gained, as roles rather than numbers: the `metric` (a figure
  whose header names its unit), `category` (a badge longer than a status)
  and `rowActions` (up to two trailing buttons) width roles; plain headers
  that wrap instead of overlapping in the fixed layout; `sublabel` under a
  non-sortable header; a one-line `description` under the 49px header row;
  `rowLines={2}`, which pads a short page with two-line blanks of the real
  anatomy; `pinFirstColumn`; `selection` (a leading checkbox column with a
  select-all box); `nested` (no card of its own inside a box that already
  frames it — also the preview mode for `csv-import-dialog`); and the table
  named by its title or label. `ui/table.tsx` gained `TableCellLines` (a
  value over a caption, each cut to one line), `TableActionsCell` and
  `TableSelectCell`. The cursor pager needed nothing new: a cursor table
  passes its `Pager` controls as `pager`. Covered by
  `ui/data-table.test.tsx`.
- On `DataTable` now: `demand/demand-signal-table`, `performance/dimension-table`
  (pinned lead column, captions under the comparison columns, its loading,
  error and empty states in the table body), AI Traffic `pages-view`, the
  crawler and coverage tables in `traffic-views` (coverage with its cursor
  pager and states), the channel comparison and landing pages in
  `referral-details`, the source totals in `referrals-dashboard` and the
  source diagnostics in `crawl-log-connections` (nested in its card, actions
  in a `TableActionsCell`). The referral trend cards draw their scale on
  `TrendChart`'s own axes (`countYLabels` deleted). The row-actions,
  selection and preview users (`candidate-review`, `csv-import-dialog`,
  settings rows) are in PR 6a's folders and adopt them next.
- Everything else moved onto `Inline`, `Icon`, `IconButton`,
  `ledgerItemClasses`, `treeBranchClasses`, `splitPaneClasses`,
  `Tabs spaced`, `Dialog width="wide"`, `Skeleton shape` and `QueryState`.
  The readiness ladder's step marks are `Icon`s and a `Spinner`
  (`--color-info-border` lost its last user and is deleted); the business
  map's removable chips are list rows with `IconButton`s; the integration
  rows lost their 32px icon tile for the `Icon`.
- Layering findings in these folders fell from 234 to 25; the whole layering
  debt from 498 to 289 (274 `layer-geometry`, 15 `layer-size-prop`). The
  census passes at 982/1280, light and dark.

Left in these folders (25), each waiting on an organism outside them:

- `ui/filter-bar.tsx` — a filter width role (only search has one):
  `ai-traffic/traffic-controls` (`desktop:w-44` folder input,
  `desktop:w-32` status input), `performance/performance-chrome` (`w-36`
  granularity select), `search-intelligence-dataset-view` (`w-40` volume
  input). 4.
- `ui/metric-value.tsx` — one form (or a comparison slot on `StatRow`):
  `performance/metric-cards` `size="figureSm"` and the `border-t pt-1`
  comparison line. 2.
- `ui/input.tsx` — a shared end-of-field icon target (the one `SearchField`'s
  clear button draws): the password-reveal `Pressable` in `auth/auth-form`
  (`size-7`, `rounded-*`). 2.
- `ui/checkbox.tsx` / `ui/field.tsx` — a caption aligned under a checkbox's
  label: `auth/auth-form` Terms notice and error (`ps-[calc(…)]`). 2.
- The Google brand glyph's size in `auth/auth-form` (`size-4` default) — a
  brand-glyph role on `Icon` or `BrandLogo`. 1.
- `layout/shell-fallback.tsx` / a gate template — the fallback and gate page
  padding: `auth/policy-acceptance` and `auth/workspace-access-gate`
  (`p-8`), `onboarding/onboarding-page-client`
  (`p-[var(--page-section-gap)]`). 3.
- `ui/list-row.tsx` — a padded navigation row (the chooser's
  `listRowClasses` row with its own `gap-3 px-3 py-2.5`):
  `auth/workspace-chooser`. 3.
- The flow surface (`auth/flow-shell` + `website-type.css`): the onboarding
  stage band gap (`onboarding-stages` `mt-[var(--flow-block)]`), the
  flow-entity edit row's height (`review-step` `my-1.5` ×2, which keeps the
  row from shrinking while it is edited) and the 20px selection mark's
  glyph (`choice-controls` `size-3.5`). 4.
- `ui/dropdown.tsx` — content matching its trigger's width, and an inline
  code token in `ui/typography` (`mcp/connect-strip`: `w-[var(--radix-…)]`,
  `rounded-*`, `px-2`, `py-1`). 4.

#### PR 6a — agent, projects, prompts, settings and billing carry no geometry

Done in PR 6a:

- Layering findings: `agent` 85 → 0, `projects` 60 → 0, `prompts` 52 → 5,
  `settings` 48 → 0, `billing` 19 → 0 (264 → 5). The whole layering debt
  fell from 498 to 238 (232 `layer-geometry`, 6 `layer-size-prop`), all in
  the folders PR 6b owns plus the five below. The crawl log dialog in
  `ai-traffic` moved from `className="w-144"` to `width="wide"` (576 → 720),
  because `Dialog` no longer takes `className`.
- New one-form organisms in `components/ui`, each with only placement or
  role props:
  - `ControlRow` (`ui/control-row.tsx`): an offer or connection row (an
    optional leading mark, the text column, trailing controls that drop
    under the text below `desktop`); `boxed` puts it on the tonal panel.
    Billing plan rows, plan changes, extra purchases and the integration
    connection row use it.
  - `IconTile` (`ui/icon.tsx`): the 32px recessed square that names a row's
    kind.
  - `FactList` with `layout` `ruled`/`inline`/`spread` (and `total` for a
    quote) and `ValueLedger`, a fixed-row-count ledger (`ui/facts.tsx`).
    `SettingsFacts` is deleted. Settings facts, an Action's facts and
    evidence, the quote lines and the overview widgets' rows draw through
    them.
  - `SettingsSection`/`SettingsSections` moved from `components/settings`
    to `ui/settings-section.tsx` and lost `className`. `IdentityRow` (logo
    or avatar, title, caption, actions) and `MetaFooter trailing` were added
    to `ui/workspace.tsx`.
  - `RailItem`/`RailItemForm` (`ui/rail.tsx`): the topic tree rail.
    `ReorderList` (`ui/reorder-list.tsx`): Ranked actions (drag, and move up
    and down buttons).
  - `FloatingToolbar` (`ui/floating-toolbar.tsx`): the overview widget
    editing controls.
  - `DockedThread`, `ComposerDock`, `ComposerFrame`, `RemovableChip` and
    `SuggestionList` (`ui/chat-dock.tsx`): the chat thread/composer dock
    template for the Agent panel and full-page chat.
  - `ChartKey` (`ui/chart.tsx`): a static legend.
  - `OptionRow` (`ui/list-row.tsx`): a selectable option with a check.
  - `badgeLinkClasses`: an evidence chip that is a link.
- Width and placement roles instead of classes:
  - `Dialog width="review"` (820); `Dialog` lost `className` and its close
    control is an `IconButton`.
  - `DropdownContent width` `panel` (256) and `trigger` (the trigger's
    width).
  - `Input width="quantity"`, `Textarea placement="composer"`,
    `Checkbox nested`, and `Drawer body="dock"` (replaces `bodyClassName`).
- `Button`, `DropdownItem` and badges do not size a descendant `svg`:
  `[&_svg]` would also resize logos and avatars inside a control, so every
  glyph is the `Icon` atom instead.
- Rendered changes, all onto the shared rungs:
  - Dropdown menus: 224 → 256.
  - Dialogs: the project edit dialog 620 → 720 (`wide`), generate setup
    520 → 480 (`form`), review dialogs 800 → 820.
  - Quote lines: 4 → 8 apart.
  - Settings profile identity gap: 16 → 12.
  - Project market ledger rows: 8 → 12 padding.
  - Workflow cards: 8 → 16 apart.
  - The composer chip's remove glyph: 12 → 16.
  - Run step lists and an output's contents hang on the tree hairline;
    run summaries are `Disclosure`s.
- The census also measures `icon-tile.size` (32), `row-part.gap` (12,
  ControlRow and IdentityRow) and `fact-row.padding-y` (8, ruled facts). It
  passes at 982/1280, light and dark. `ValueLedger` rows, `RailItem`,
  `ReorderList`, `FloatingToolbar`, `ChartKey` and the composer dock do not
  render under the shell fixture (they need overview, topic, run or chat
  data), so the census does not measure them.

Left after PR 6a, in these five folders (5 `layer-geometry`, all one
`DataTable` need PR 6b owns):

- Row selection: `components/prompts/candidate-review.tsx`, the sticky
  selection toolbar (`gap-2 py-2`), the select-all panel (`gap-3`) and the
  selectable candidate row (`gap-2 py-3`). It becomes a `DataTable` with
  row selection.
- Row actions needed no `DataTable` change: the Settings member and
  invitation tables and the prompt library put an `Inline` with
  `justify-end` and `IconButton`s in their last column.
- CSV preview: `csv-import-dialog.tsx`'s `CsvImportPreview` carries no
  layering finding, but it still frames a `Table` by hand until `DataTable`
  has a preview mode.

## Acceptance

At 982×900 and at 1280×900, light and dark, the census returns:

- buttons, inputs, selects, tabs, segmented controls, sidebar destinations,
  switcher and account menu: **one** height, 32;
- badges: one height, 20; boxes: one radius, 12, one padding, 16;
- control font size 14 everywhere, badge 12, h1 20, h2 16, h3 14;
- text-control padding-x 12 (tabs included), icon-only 0; section gap 24,
  card→card 16, heading→content 12, card padding 16 on the card element;
  one control-band height; loading, read-error and empty states in one
  footprint per organism; table rows 36 with 6 cell padding-y;
- no product component carries `sm:`/`md:`/`lg:`/`xl:`.

The owner judges the result on their own screen against the reference product,
not against this list.

## Out of scope

Palette, type faces, the ground and sheet, the sidebar grouping, copy, data,
flows, the public website, docs, auth and onboarding geometry (their 36/44
rungs stay), and dark-mode retuning.
