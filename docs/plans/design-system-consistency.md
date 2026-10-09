# Design system consistency plan

A cross-surface audit and rebuild of the design system: tokens, brand marks,
geometry, type, shared primitives and every product route. **Status: shipped
(2026-10-09) in #318 (Phases 1–3 and 6), #319 (Phase 4 with the Site Health,
Visibility and Overview migrations) and #320 (the remaining routes); owner
decisions below are settled. The [known remainder](#known-remainder) is queued
in the [backlog](backlog.md).** Shipped visual rules are owned
by [Design](../design.md), not by this plan. Visual work does not change factual
copy, data, claims, scripted preview content or workflows.

## Why

An external design review (Claude Design, 2026-10-09) flagged eight token-level
problems. Four read-only audits that day confirmed all eight. They also found
the same kind of drift across the whole frontend: the system has a sound
direction, but too many values, and the routes assemble it differently.

The goal is **absolute consistency**:

- Two things that mean the same look the same on every surface.
- Two things that mean different things never look the same.
- Every value comes from one named role.
- A check fails when that stops being true.

File references are to `frontend/` unless noted. G means
`apps/app/src/globals.css`.

### Findings: brand and colour

1. **The logo carries a retired palette.**
   - `public/citeladder-logo.svg` draws the bubble and "Ladder" in navy `#0F1C31`, and the bars and "Cite" in `#16a34a`.
   - The navy is invisible on screen (1.13:1 against ink `#0b0f0d`). It is debt left from an older palette and appears nowhere else.
   - The bright green sits beside the forest `#14532d` of every action, so the header shows two greens.
   - The mark-only glyph in `components/ui/logo-mark.tsx` already uses ink, so the two logo forms differ.
   - In dark mode, `.brand-wordmark` inverts the lockup to white (G:1296), while the glyph keeps green bars.
   - `public/citeladder-logo-black.svg` and `-white.svg` have no references and use different traced geometry.
   - A comment at G:1096–1105 still describes a "dark navy" and "warm" ink. `website-type.css:2` names a nonexistent "Prism palette".
2. **Action and success are the same colour.**
   - Light: `success` = `success-text` = `accent-hover` = `#166534`.
   - Light: `chart-7` = `accent` = `#14532d`, and `chart-1` = `brand-forest` = `#16a34a`.
   - Dark: `chart-1` = `accent` = `#76df9c`, and five near-identical mints carry action, success and positive.
   - The design contract says accent never means success. On screen, it does.
3. **Status is four overlapping families.**
   - Run states, score bands, sentiment and chart series reuse the same coral, lime, amber, cyan and cool grey (light collision table: 24 shared values).
   - Roles change meaning between themes. `citation-owned` is rust in light (Claude's brand rust) and coral in dark. `run-analyzing` is rust in light and amber in dark.
   - "Bad" has three hue families (danger `#b42332`, coral `#ff6e56`, rust `#9a3412`), and so does "warning".
4. **Status marks separate by hue, not lightness.**
   - Failed coral against completed lime is 1.46:1 in light and 1.36:1 in dark. A deuteranopia simulation renders both as olive.
   - Score low and good are both L*≈64.
   - In light, success and warning marks are both L*37.
   - On white, chart-2, -3, -4 and -5 fall below 3:1 non-text contrast.
5. **There are too many tokens, and they are not named by role.**
   - There are 116 `--color-*` tokens, plus 30 `--tag-*`.
   - Undeclared duplicates: `background` = `shell` = `sidebar`; `muted` = `ink-subtle`; `secondary` = `ink-chip` (light); `background-alt` = `canvas-soft` (light); `brand-gemini` = `brand-google-blue`.
   - 11 tokens have no consumers: `brand-claude`, `brand-gemini`, `brand-openai` and all eight `tile-*`. `tile-purple` is orange.
   - Unused non-colour tokens: `--radius-marketing-well`, `--radius-marketing-preview`, `--shadow-marketing-cta`, `--text-support` and `--leading-tight`.
   - Duplicate recipes: `--elevation-flow` = `--public-frame-shadow`, `--shadow-overlay` = `--public-menu-shadow`, and `--ease-standard` = `--ease-enter`.
6. **Neutrals leave the green-tinted family.**
   - Hover, selected and active mix ink into white and resolve to pure grey: `#f5f5f5`, `#ebecec` and `#e2e2e2`.
   - Other neutrals that are not green-tinted:
     - cool `#6b6b72` and `#3a3a40`
     - warm `#f4f4f1` and dark-mode `#faf9f5`
     - slate `#64748b` and the slate scrollbar colours
     - pure-grey dark `#222222`
     - Google Material `gsc-*` colours outside the chart ladder
   - The public rebind changes `border` and `border-strong` by only 1–2 steps (`#e3e6e4`, `#d0d5d2`). That is a near-duplicate, not a deliberate step.

### Findings: geometry, type and motion

7. **The radius ladder is not enforced.**
   - Public CSS has 63 literal `border-radius` declarations against 43 token uses. The values are 2, 3, 4, 5, 6, 7, 8, 10, 12, 14, 16, 20, 999px and 50%.
   - Product previews use 6, 7 and 10px radii, so they do not show the product's real geometry.
   - The flow sheet is 16px (G:1000) while the app sheet token is 14px.
8. **The dot lattice is copied three times at 18px**, which is off the 4px grid (`marketing.css:202, 267`; `website-type.css:314`).
9. **Public spacing ignores the grid.** Public CSS has about 40 × 6px, 20 × 10px, 25 × 14px and 10 × 18px values, plus 5px, 7px and 3px. The 4px rule exists only for product TSX classes.
10. **The public type ladder is crowded.**
    - Small heading and feature heading are 1px apart: 16/17 on mobile, 17/18 from 768px.
    - Rungs cluster at 15/16/17/18, 19/20/22 and 24/26/28/30.
    - Pages add their own heading sizes outside the roles: `cp-prose-h2` 26, `cp-prose-h3` 19, `ed-h2` 20, `mk-dive-title` 40, docs h2 22.
    - Previews use 13px (`.pv-view`), 11px and 10px text, while the website body is 15px.
    - There are about 120 literal `font-size` and 90 literal `line-height` declarations.
11. **Buttons differ by surface.**

    | Surface | Height | Text |
    |---|---|---|
    | App | 28 / 32 / 36 | 13px |
    | Marketing CTA | 36 (44 hero) | 14 |
    | Public md/lg | 40 | 15 |
    | Auth | 40 (44 on phone) | 15, or 14 in the auth form |
    | Docs | 36 | — |
    | Preview | about 30 | 12, 7px radius |

    Cards are 12, 14 or 16 with three different edge treatments. Callouts are railed in docs and unrailed in marketing. `.cm-switch` carries a bespoke focus ring.
12. **Motion is untokenised on public surfaces.** Durations of 220, 300, 280, 260, 720 and 900ms appear, and `cubic-bezier(0.16, 1, 0.3, 1)` is written out about eight times.

### Findings: drift between the contract and the code

13. **docs/design.md disagrees with the code.**

    | Item | Doc | Code |
    |---|---|---|
    | Section padding | 56 / 80 / 96 | 72 / 104 / 128 |
    | Flow group title | 16/24, `ink-strong` (no such token) | 17/24 |
    | Flow help | 14/20 | 15/22 |
    | Flow metadata | 12/16 | 14/20 |
    | Marketing CTA | 34 | 36 |
    | Marketing button | 48 min | 44 |
    | Data display at 768px | 40/46 | 36/42 |
    | Flow bar | 56 | 64 |
    | Breakpoints | 700 / 981 | 768 |
    | Small-paragraph step | below 540px | nonexistent |

    The `ui/typography.tsx` comments say page title 18/24 at weight 600; the doc and CSS say 20/28 at 500. The token table's value cells are never compared with CSS.

### Findings: product routes

Every route uses `PageShell`, and typography roles mostly hold. The drift is in what each page assembles inside the shell:

14. **Section headers** have five implementations: `CardHeader` 51, raw `<h2>`/`<h3>` 45, `EditorialSectionHeader` 21, `SectionTitle` 5, plus 17 `CardHeader` layout overrides to fit actions. `CardHeader` has no actions slot.
15. **Metric rows** use about 12 local tile shapes beside `MetricGroup`:
    - `StateMetric`, `EvidenceStat`, `SurfaceStat`, `RateTile`, `Stat`, `SignalCard`, `DeliveryMetrics`, `OrphanMetric` and the pressable `MetricCards`
    - four different label roles
    - three ways to show absence
    - three ways to show change, with no Delta primitive
16. **Loading, error and empty states:**
    - Eight local skeletons remain after `PageLoading` retired them.
    - Nine read errors use `Alert danger` instead of `ReadError`.
    - Some pages keep their tabs and filters while loading; others drop them.
    - Twelve different "no project" sentences.
    - About 30 inline "No …" lines in mixed type roles.
17. **Layout:**
    - At least 14 ad-hoc two-column grids at md, lg and xl, beside the 9 `splitPaneClasses` uses.
    - Two separate resizable panes with different separators.
    - Different sticky offsets.
    - Form pages (Settings, Billing) sit on the analytical measure.
18. **Filter rows and pagers:**
    - Seven filter-row recipes.
    - A different `SearchField` width on every page.
    - Secondary filter rows inside card headers.
    - Four pager variants: `CursorPager`, `CursorTableFooter`, `TablePagination`, and a hand-rolled `CatalogPager`.
19. **Links and selection:**
    - Five link recipes and no `TextLink`.
    - Four selected-row recipes: `bg-selected border-accent`, `bg-accent-subtle`, accent ink only, and `bg-accent-soft`.
    - Accent used for an in-progress notice and for decoration.
    - `text-score-high` used to mean "positive".
20. **Controls:**
    - Page actions are `md` on four routes and `sm` on seven.
    - The Visibility toolbar mixes a 28px and a 32px button in one row.
    - Button icons are 3, 3.5 or 4.
    - Local `stroke-[2.5]` and `strokeWidth` overrides.
21. **Charts and sizes:**
    - Four chart stacks: hand-rolled SVG, div bars, raw Recharts with its own tooltip and legend, and the shared frame.
    - Local legend swatches.
    - Arbitrary heights: `h-[220px]`, `h-[240px]`, `h-[304px]`, `height={200}`.
    - Six different table `min-w` values.
    - A `Card` nested inside a `Drawer` (`search-intelligence-page.tsx:394`).

### Findings: enforcement

22. **Enforcement covers product TSX class strings, not the rest.**
    - `check:policy` never reads `.astro` or `.svg` files.
    - CSS outside `globals.css` is checked only for hex values.
    - Arbitrary `rounded-[6px]`, `w-[..]` and `h-[..]` pass.
    - `cva()` recipes and `style={{}}` are not read.
    - Duplicate token values, zero-consumer tokens and doc value drift are not detected.
    - The contrast check skips light charts, the `ink-*` ladder, status text on status backgrounds, tags, state tints and colour-blind separation.
    - No design check runs at commit.

## Decisions

Settled by the owner on 2026-10-09:

| # | Decision | Answer |
|---|---|---|
| D1 | Logo colours | Ink + forest. Bubble and "Ladder" in ink `#0b0f0d`; bars and "Cite" in forest `#14532d`. Remove the unreferenced variants. |
| D2 | Success vs action | Success becomes a teal-green, around teal-700 `#0f766e` in light, with its own text and background. It differs from forest in both hue and lightness. |
| D3 | Status colours | One outcome scale. Run, score and sentiment alias it. Chart series are purely categorical and never equal a status or action value. |
| D4 | Radius ladder | 4 / 8 / 12 / 16 / full on every surface. 16 covers product frames, stages, sheets (app and flow), bento tiles and link cards. 14, 20, 10 and the preview radii are retired. |

Defaults this plan applies unless the owner objects:

| # | Default | Reason |
|---|---|---|
| D5 | Adjacent type rungs differ by at least 2px on each surface. Small heading and feature heading merge into one role. | 1px steps do not read as different levels. |
| D6 | Product previews render on the app's own ladder: 14px body, the app's type roles, 8/12 radii and app control heights. Their layout is not reflowed. | A preview is meant to look like the product. |
| D7 | Public controls share one height ladder with the app: 32 / 36 / 44. 44 is the hero and phone-touch rung. Every surface uses 8px radius and 14px text. | One button should not have four sizes. |
| D8 | The dot lattice moves to 16px spacing and becomes one shared recipe. | It belongs on the 4px grid, and three copies collapse into one. |
| D9 | docs/design.md value tables are generated from CSS, and a check fails when they are stale. | Doc drift becomes impossible rather than reviewed. |
| D10 | New enforcement starts with a ratchet baseline. Counts may only fall, and new violations fail immediately. | The repository stays green while debt burns down. |

## Phase 1: guardrails first

So that later phases cannot regress, and new drift stops now.

- **CSS policy.** A new `scripts/design-system-css-checks.mjs`, called from `check-design-system.mjs`, parses CSS with postcss and `postcss-value-parser`. It covers every CSS file except `globals.css`, plus `.astro` `<style>` blocks.
  - Rejects literal `border-radius` (allowed: `var(--radius-*)` and `0`).
  - Rejects literal `font-size` and `line-height` (allowed: `var(--text-*)` and roles).
  - Rejects off-grid padding, margin, gap and inset values (multiples of 4; 2 allowed for hairline insets).
  - Rejects raw durations and easings (allowed: `--motion-*` and `--ease-*`).
  - Rejects outline recipes outside the shared focus rule.
  - Rejects `box-shadow` outside the shadow and elevation tokens.
- **Ratchet.** Each rule takes a per-file baseline in a checked-in JSON file, in the same model as the jscpd baseline. A file may lower its count but not raise it.
- **TSX gaps.**
  - Treat `rounded-[Npx]` as a raw radius.
  - Reject literal `w-`, `h-`, `min-*` and `size-[Npx|rem]` outside `components/ui/`.
  - Read `cva()` variant objects and imported recipe constants.
  - Read `style={{}}` object literals for literal px values, colours and shadows.
  - Reject stroke overrides on Lucide icons.
- **Assets.** Extend the walker to `.svg` and `.astro`. An SVG fill must be `currentColor` or appear in a brand-asset allowlist that maps each hex to its token. Logo drift then reads as "fill `#X` is not `--color-Y`".
- **Tokens.** `audit-design-tokens.mjs` gains three checks:
  - `--check` fails when two tokens of different classes resolve to the same value in a theme, unless one is written as `var(--other)` or declared `sameAs`.
  - It fails when a token in any family (colour, tag, radius, shadow, motion, text) has zero consumers.
  - It fails when docs/design.md's generated blocks are stale.

  Its consumer scan uses the AST class extraction plus a postcss `var()` walk instead of the current regex, which misses `outline-`, `caret-`, `placeholder-` and `shadow-` colour utilities.
- **Contrast and colour-vision matrix.** Move the pairs in `design-system-contrast.mjs` into data, then add:
  - the `ink-*` rungs except `ink-faint`
  - `*-text` on `*-bg` and on panel
  - `*-fg` on solid fills, `on-inverse` and `selection-fg`
  - tag triples
  - light charts at 3:1 on panel
  - `border-bold` at 3:1

  Add separation rules:
  - Adjacent outcome-scale marks differ by ΔL* ≥ 15, or by ΔE2000 ≥ 10 under deuteranopia and protanopia simulation.
  - Hover, selected and active step in lightness order from their surface.

  Resolve alpha tokens by compositing them onto the scope's panel.
- **Wiring.** Run `check-design-system.mjs` from the staged pre-commit task for CSS, TSX, Astro and SVG files. Quality fix mode runs `audit-design-tokens.mjs --write`.

**Acceptance:**
- Every rule has a fixture test in `scripts/frontend/` that asserts its parsed verdicts.
- The baseline records today's counts.
- A deliberate new 6px radius, a duplicate token value or a stale doc table each fails `check:policy`.

## Phase 2: brand and colour foundation

- **Logo (D1).**
  - Recolour `public/citeladder-logo.svg` and its docs copy (via `scripts/prepare-docs-assets.mjs`) to ink plus `--color-accent`.
  - In dark mode, swap to the ink/accent dark values instead of the `brightness(0) invert(1)` filter, so the lockup keeps its green like the glyph.
  - Delete `citeladder-logo-black.svg` and `-white.svg`.
  - Remove `--color-brand-forest`, or alias it to accent.
  - Check that the favicon's black silhouette still matches the ink.
- **Success (D2).**
  - Teal success mark, text and background in light and dark. The values come from the Phase 1 contrast matrix, with ΔL* from the forest action family.
  - `accent-hover` keeps the forest family. `success-bg` and `accent-soft` stop being two different pale greens for different meanings.
- **Outcome scale (D3).**
  - Define one scale: `outcome-bad`, `outcome-mixed`, `outcome-good`, `outcome-neutral` and `outcome-active`, each as mark, text and background. They sit on the danger, warning, success, neutral and info families.
  - Values are chosen for lightness separation. Bad is dark, mixed is light amber and good is mid teal, so red–green colour-vision loss still sees a blue–yellow split.
  - `run-*`, `score-*` and `sentiment-*` become `var()` aliases or are retired at their call sites.
  - Every status mark keeps a label or icon, because colour is never the only cue.
- **Charts.**
  - `chart-1..8` become an eight-step categorical ladder that never equals an action or outcome value. Each step meets 3:1 on panel in both themes.
  - `gsc-*` fold into it.
  - `citation-owned`, `citation-competitor` and `citation-third-party` become chart-ladder aliases with the same meaning in both themes. `citation-owned` stops borrowing Claude's brand rust.
- **Neutrals.**
  - Derive `hover`, `selected`, `active` and `disabled` by mixing a green-tinted ink, or switch to `color-mix(in oklch, …)` so the tint survives.
  - Retint `#6b6b72`, `#3a3a40`, `#f4f4f1`, `#222222`, `#faf9f5`, `#64748b` and the scrollbar colours onto the green-tinted ladder.
  - Drop the public `border` and `border-strong` near-duplicates in favour of the product values.
- **Pruning and aliasing.**
  - Delete the 11 zero-consumer colour tokens and the zero-use radius, shadow, text and leading tokens.
  - Make the true synonyms explicit `var()` aliases, or retire the extra name: `shell`/`sidebar`/`background`, `muted`/`ink-subtle`, `ink-chip`/`secondary`, `canvas-soft`/`background-alt`.
  - Collapse the duplicate shadow and ease recipes.
- **Comments.** Rewrite the stale palette comments in G and `website-type.css`.

**Acceptance:**
- The Phase 1 duplicate-value, contrast and colour-vision checks pass with no new baseline entries.
- The token count falls, and the generated table reflects it.
- Light and dark screenshots of Overview, Runs, Visibility, Site Health and the homepage header are reviewed by the owner before merge.

## Phase 3: geometry, type and motion

- **Radii (D4).**
  - Tokens: `--radius-xs` 4, `--radius-control` 8, `--radius-card` 12 (overlays share it), `--radius-lg` 16, `--radius-full`.
  - `--radius-lg` replaces `--radius-workspace` and the `marketing-*` radius tokens.
  - Convert all 63 literal radii. Preview radii map to 8 or 12, and 999px becomes `full`.
  - The app workspace sheet moves from 14 to 16, matching the flow sheet.
- **Spacing.**
  - Convert off-grid public spacing (6, 10, 14, 18, 5, 7, 3) to the nearest grid step, checking each optical result. Prefer the role tokens G already has.
  - The dot lattice (D8) becomes one `--lattice` recipe at 16px.
- **Type (D5).**
  - Collapse the public ladder into roles at least 2px apart at each breakpoint.
  - Merge small heading and feature heading.
  - Map the page-local heading sizes (`cp-prose-h2`/`h3`, `ed-h2`, `mk-dive-title`, docs h2/h3 and title) onto roles.
  - Replace literal `font-size` and `line-height` with roles or `--text-*`.
  - Align flow roles with the website ladder.
- **Previews (D6).**
  - `.pv-view` inherits the app ladder: 14px body, with the `.type-*` sizes for captions and badges in place of 13, 11 and 10px.
  - Previews use app radii and control heights. The `.product-fit` zoom keeps desktop layouts intact.
- **Controls (D7).** One height ladder (32 / 36 / 44) and 14px text for marketing CTA, public buttons, flow buttons and the docs CTA. The marketing `min-h-12` variant goes.
- **Shared public objects.**
  - Link cards, plan cards, the review card and docs pagination share one card recipe: radius, edge and raised shadow.
  - One callout treatment across docs and marketing.
  - Remove the `.cm-switch` bespoke focus ring.
- **Motion.**
  - Tokenise the public durations into named public motion roles: menu, hero, reveal and drift.
  - Add `--ease-out-expo` for `cubic-bezier(0.16, 1, 0.3, 1)`.
  - Replace `duration-*` utilities in marketing TSX.

**Acceptance:**
- The CSS-policy baseline for radius, type, spacing and motion reaches zero in public CSS, apart from documented intrinsic exceptions (2px tab underline and rail).
- The owner reviews these pages at 375px and 1440px: homepage, one platform page, pricing, a docs article, login and onboarding.

## Phase 4: missing product primitives

Each primitive lives in `components/ui/`, has one behavioural test at its contract, and replaces the local copies listed in the findings.

| Primitive | Replaces |
|---|---|
| `CardHeader` `actions` slot | 17 layout overrides; the hand-made `border-b` headers |
| `Delta` (tone, sign, not-comparable state) | Three change treatments |
| `StatGrid`, for a dense label/value fact grid or well stats beyond `MetricGroup`'s 3–5 headline figures | `EvidenceStat`, `SurfaceStat`, `RateTile`, `Stat`, `SignalCard`, `StateMetric`, `DeliveryMetrics`, `OrphanMetric` |
| `Meter` | Usage, progress and distribution bars |
| `SortableTableHead` | Four sort headers with two different glyphs |
| `splitPaneClasses('list-detail', { resizable })`, one separator and one sticky offset | The Commerce and Prompts resizable panes |
| `TextLink` (internal, external, back) | Five link recipes; "← Back to runs" |
| `PageShell` `back` slot | Ad-hoc breadcrumbs on detail routes |
| `FilterRow` composition: a `SearchField` width role plus a `FilterTrigger` with count | Seven filter-row recipes; `FilterButton`; the Prompts count pill |
| `ListRow` selected recipe (raised neutral, as the sidebar uses) | Four selected-row recipes |
| One pager | `CursorPager`, `CursorTableFooter`, `TablePagination`, `CatalogPager`, `TrafficPager` |
| `InlineEmpty` | About 30 mixed-role "No …" lines |
| `NoProjectState` | Twelve hand-written alerts |
| Chart height roles and a shared legend swatch | Arbitrary chart heights; local swatches |
| `Avatar` | Three initials discs |

Also in this phase:
- Fix the `ui/typography.tsx` comments.
- Retire `SectionTitle` and `AnalyticsToolbar` if the new compositions absorb them.

**Acceptance:**
- Phase 1 rules or architecture checks forbid the retired local shapes.
- Every primitive has an accessible-name and keyboard path where it is interactive.

## Phase 5: route migration

Migrate each route onto the canonical recipe. **One route recipe:**

- `PageShell` with header actions at `sm`.
- Section headers through `EditorialSectionHeader`, or `CardHeader` with actions; no raw headings.
- Metrics through `MetricGroup`/`StatGrid` with `Delta`.
- `PageLoading` that keeps the page's tabs and filters, `ReadError`, and `EmptyState`/`InlineEmpty`.
- `splitPaneClasses` only.
- One `FilterRow` and one pager.
- `TextLink`.
- Charts on `components/ui/chart.tsx`.
- Form pages on the workflow measure.

Order follows traffic and inconsistency density:

1. Overview
2. Visibility
3. Site Health (overview, issues, page detail)
4. Prompts and Runs
5. AI Traffic and Performance
6. Search Intelligence and Demand
7. Commerce
8. Agent and Actions
9. Settings and Billing

Also in this phase:
- Migrate `performance-chart.tsx`, the Overview div bars and the raw Recharts history onto the chart frame. `donut-chart.tsx` stays, as the contract allows.
- Fix the `Card` nested in a drawer.
- Fix the accent-as-status and accent-as-decoration uses.

**Acceptance:**
- The route × pattern matrix from the audit shows every cell canonical.
- The Phase 1 baselines for product TSX reach zero.
- Each migrated route is reviewed in light and dark at desktop and phone widths.

## Phase 6: contract

- Regenerate the token, radius, type-ladder, geometry and control tables in [Design](../design.md) from CSS (D9). Replace the prose values that drifted.
- Rewrite the sections whose rules changed: Colour, outcome scale, public geometry, previews, controls and Patterns.
- Record D1–D4 in [Decisions](../decisions.md) only if they are cross-feature by that document's rule. The design contract owns them otherwise.

## Delivery

Ship as few PRs as the churn allows (owner preference: split only past about 100 files). The first PR carries Phases 1–3 and 6, so later PRs run under the new checks. Phases 4–5 came to about 180 files, so they ship as two PRs: the primitives with the Site Health, Visibility and Overview routes, then the remaining routes with the retirement of the replaced shared components. Phases 2 and 3 change how every surface looks; the owner reviews screenshots before merge. Marketing copy, claims and scripted preview content are out of scope throughout. Only CSS, tokens and class recipes on marketing files change.

## Measures

Record each measure before Phase 1 and after each phase:

- token count by family
- duplicate-value groups
- zero-consumer tokens
- literal radius, font-size, line-height, off-grid spacing and duration counts per CSS file
- arbitrary Tailwind sizes
- local primitive copies
- route-matrix deviations

The plan is done when every count is zero or a documented exception, and the owner has reviewed the screens.

## Known remainder

Left non-canonical after Phase 5, each with an owner to change first:

- `TrendChart` and `chart-axes.tsx` remain hand-rolled SVG; moving them onto the chart frame needs the frame to hold version markers and per-point evidence links.
- Section-level skeletons inside drawers, rails and tables keep their own placeholders; `PageLoading` is screen-level.
- The compact app-shell drawer width (`w-[min(17rem,100vw)]`) and a few product-table column widths stay ratcheted until `Drawer` and `Table` grow width roles for them.
- Selected-option check marks use accent in `ui/dropdown.tsx`, `project-switcher` and `property-picker`; the dropdown owner decides first.
- The blog editorial illustrations carry their own palette (ratcheted `svg-color`).
