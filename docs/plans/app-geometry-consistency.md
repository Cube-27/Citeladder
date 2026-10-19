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

## Acceptance

At 982×900 and at 1280×900, light and dark, the census returns:

- buttons, inputs, selects, tabs, segmented controls, sidebar destinations,
  switcher and account menu: **one** height, 32;
- badges: one height, 20; boxes: one radius, 12, one padding, 16;
- control font size 14 everywhere, badge 12, h1 20, h2 16, h3 14;
- no product component carries `sm:`/`md:`/`lg:`/`xl:`.

The owner judges the result on their own screen against the reference product,
not against this list.

## Out of scope

Palette, type faces, the ground and sheet, the sidebar grouping, copy, data,
flows, the public website, docs, auth and onboarding geometry (their 36/44
rungs stay), and dark-mode retuning.
