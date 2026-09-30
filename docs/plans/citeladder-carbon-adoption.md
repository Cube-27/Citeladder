# Carbon-inspired design system refresh — CiteLadder product app

> Status: **planning handoff, decisions resolved by the owner on 30 September
> 2026.** Not registered in [docs/plans/ACTIVE.md](ACTIVE.md); the owner adds
> that entry before implementation starts. Produced from a read-only
> repository inspection plus official Carbon references
> (<https://carbondesignsystem.com/>, <https://github.com/carbon-design-system/carbon>).
> **Every Carbon value in this plan was extracted from Carbon's published
> sources at the versions cited in the Appendix** — the implementing agent
> does not need to consult Carbon's site or repo; this document is the
> specification. Read [AGENTS.md](../../AGENTS.md) first; its workflow,
> validation and replacement-gate rules apply to every PR.
>
> **This is not a Carbon migration.** No Carbon package is installed. The
> Tailwind 4 + Radix stack, fonts (Switzer/Sora), routing, API contracts and
> component ownership are unchanged. The existing design system adopts
> Carbon's design language: its neutral color ladder, its accent (blue-60),
> square corners, compact density, layer-over-shadow hierarchy, motion and
> focus specifications.

## 0. Owner decisions (resolved 2026-09-30)

| # | Decision | Resolution |
|---|---|---|
| D1 | Theme source families | **Recommended option adopted**: light theme values from Carbon **g10**, dark theme from **g100** |
| D2 | Shell chrome | **Recommended option adopted**: light-mode shell stays light — hierarchy via Carbon's surface-layer pattern (`layer` chrome over `background` content), no dark chrome in light mode |
| D3 | Focus indicator | **Recommended option adopted**: Carbon's focus spec replaces the glow (§3.7) |
| D4 | Density | **Carbon compact adopted**: 32px controls, 32px table rows, compact menu/badge metrics (§3.4) |
| D5 | Accent | **Carbon's accent adopted completely** for accent/interactive/action/link/focus, plus `support-*` alignment for the evidence families, so shell and component colors come from one coherent Carbon ladder. **Note:** Carbon's accent is **blue-60 `#0f62fe`** — a vivid blue, *not* indigo. This plan adopts blue-60 as the accent; if indigo specifically was wanted, this decision needs revisiting before PR 2 |
| D6 | Section bands | `indigo`/`teal` section bands keep their roles; after D5 they must be visually verified as distinct from the new blue accent (PR 2 visual check) — if the indigo band reads as a second accent, drop it in that PR |

## 1. Non-goals

- Installing any Carbon package (`@carbon/react`, `@carbon/styles`, …).
- Changing typefaces: Switzer (text) + Sora (headings) and the
  `fonts:pull`/`@font-face` pipeline stay; IBM Plex is not adopted.
- Restructuring `AppShell`, replacing components with Carbon components, or
  adopting Carbon `Grid`/`Stack`.
- Changing routing, API contracts, permissions, or product behavior.
- Abandoning the 4px spacing grid or the closed `.type-*` type-role ladder.
- Changing the availability vocabulary (`MissingValue` etc.) or ARIA
  contracts.

---

## 2. Current state (verified)

- **Single token owner**: `frontend/apps/app/src/globals.css` — the only file
  allowed to contain raw hex or a Tailwind `@theme` block (enforced by
  `frontend/scripts/check-design-system.mjs`). Contains the `@theme` palette
  (~120 semantic `--color-*` tokens), layout roles at `:root`
  (`--control-height: 36px`, `--table-row-height: 44px`, `--card-padding:
  20px`, `--page-section-gap: 24px`, `--workspace-gap: 16px`, radius ladder
  `--radius-control: 6px / --radius-card: 8px / --radius-overlay: 12px` plus
  `--radius-xs` / `--radius-full`, z-index ladder
  `--z-index-sticky/overlay/modal/toast`, shadow roles), the `.type-*`
  component classes, and the full `:root[data-theme='dark']` rebind block.
  Section bands `[data-citeladder-section="indigo"|"teal"]` and
  `[data-public-surface]` re-scope tokens.
- **Themes**: light default; dark via the `data-theme` attribute set by
  `frontend/lib/theme/theme.ts` + pre-paint `/theme-preference.js`.
- **Component owners** (unchanged): primitives in `frontend/components/ui/`
  (`button.tsx`, `dialog.tsx`, `drawer.tsx`, `dropdown.tsx`, `select.tsx`,
  `tabs.tsx`, `tooltip.tsx`, `checkbox.tsx`, `radio-group.tsx`, `toast.tsx`,
  `table.tsx`, `card.tsx`, `badge.tsx`, `empty-state.tsx`, `skeleton.tsx`,
  `read-error.tsx`, `unavailable-value.tsx`, `sort-indicator.ts`,
  `cursor-pager.tsx`/`cursor-table-footer.tsx`, `searchable-select.tsx`,
  `segmented-control.tsx`, `chart.tsx`/`series-chart.tsx`, `busy-bar.tsx`,
  …); domain trees under `frontend/components/<domain>/`; Radix imports
  confined to `components/ui/`.
- **Policy gates** (all PRs must keep them green): raw-hex ban outside
  `globals.css`; role-based radii only; no call-site shadows / font-weight /
  raw type utilities; 4px grid; jscpd zero-clone ratchet; eager bundle
  budgets (JS ≤ 281,643 B gzip, CSS ≤ 22,243 B gzip);
  `scripts/design-system-contrast.mjs` contrast checks; product Playwright
  specs assert ARIA roles/accessible names, not classes
  (`e2e/shell.spec.ts`, `e2e/visibility.spec.ts`, …).

---

## 3. Adopted specification (all values verified — the implementing agent needs nothing else)

### 3.1 Neutral surface ladder — light theme, from Carbon g10

Map onto the **existing CiteLadder token names** (names never change; only
values change — zero call-site churn):

| CiteLadder token | New value (g10 source) | Carbon token |
|---|---|---|
| `--color-background` | `#f4f4f4` | `background` |
| `--color-panel` | `#ffffff` | `layer-01` |
| `--color-well` | `#ffffff` | `field-01` |
| `--color-elevated` | `#f4f4f4` | `field-02` |
| hover surfaces | `#e8e8e8` | `layer-hover-01/02` |
| selected surfaces | `#e0e0e0` | `layer-selected-01/02` |
| active (pressed) surfaces | `#c6c6c6` | `layer-active-01` |
| secondary surface accent (tinted fills, e.g. secondary button) | `#e0e0e0` (hover `#d1d1d1`, active `#a8a8a8`) | `layer-accent-01` / `layer-accent-hover` / `layer-accent-active` |
| `--color-border-subtle` | `#e0e0e0` | `border-subtle-01/03` |
| `--color-border` (default) | `#c6c6c6` | `border-subtle-00/02`, `border-subtle-selected` |
| `--color-border-strong` | `#8d8d8d` | `border-strong-01/02/03` |
| `--color-border-bold` | `#161616` | `border-inverse` (use reserved for inverse/strong emphasis only) |
| tile outlines | `#a8a8a8` / `#c6c6c6` | `border-tile-01` / `border-tile-02` |
| `--color-foreground` | `#161616` | `text-primary` |
| `--color-secondary` | `#525252` | `text-secondary` |
| `--color-muted` | `#6f6f6f` | `text-helper` |
| placeholder text | `rgba(22, 22, 22, 0.4)` | `text-placeholder` |
| `--color-icon-strong` / `--color-icon-muted` (if present) | `#161616` / `#525252` | `icon-primary` / `icon-secondary` |
| disabled fill | `#c6c6c6` | `button-disabled` |

Carbon g10 structural note (why the mapping looks "flat"): in g10 the page
`background` is gray (`#f4f4f4`) and raised surfaces (`layer-01`, `field-01`)
are white — i.e. **content chrome is white on a gray ground**. This replaces
CiteLadder's current ground/panel relationship; expect a visible but
intentional change in PR 2.

### 3.2 Neutral surface ladder — dark theme, from Carbon g100

| CiteLadder token | New value (g100 source) | Carbon token |
|---|---|---|
| `--color-background` | `#161616` | `background` |
| `--color-panel` | `#262626` | `layer-01` |
| `--color-well` | `#262626` | `field-01` |
| `--color-elevated` | `#393939` | `layer-02` / `field-02` |
| hover surfaces | `#333333` (on layer-01) / `#474747` (on layer-02) | `layer-hover-01` / `layer-hover-02` |
| selected surfaces | `#393939` (layer-01) / `#525252` (layer-02) | `layer-selected-01/02` |
| active (pressed) surfaces | `#525252` | `layer-active-01` |
| `--color-border-subtle` | `#393939` | `border-subtle-00` |
| `--color-border` (default) | `#525252` | `border-subtle-01` |
| `--color-border-strong` | `#6f6f6f` | `border-strong-01`, `border-subtle-02` |
| `--color-border-bold` | `#f4f4f4` | `border-inverse` |
| tile outlines | `#525252` / `#6f6f6f` | `border-tile-01/02` |
| `--color-foreground` | `#f4f4f4` | `text-primary` |
| `--color-secondary` | `#c6c6c6` | `text-secondary` |
| `--color-muted` | `#a8a8a8` | `text-helper` |
| placeholder text | `rgba(244, 244, 244, 0.4)` | `text-placeholder` |
| `--color-icon-strong` / `--color-icon-muted` | `#f4f4f4` / `#c6c6c6` | `icon-primary` / `icon-secondary` |
| disabled fill | `rgba(141, 141, 141, 0.3)` | `button-disabled` |
| inverse surfaces (tooltips, inverse banners) | `#f4f4f4` bg (hover `#e8e8e8`) with `#161616` text | `background-inverse(-hover)` + `text-inverse` |
| selection-tint fills | `rgba(141, 141, 141, 0.24)` (hover `0.32`, active `0.4`) | `background-selected(-hover/-active)` |

### 3.3 Accent + evidence swap (D5) — Carbon blue-60 ladder

The emerald `--color-accent`/action family is **replaced** by Carbon's
interactive ladder. Both themes shown; the dark-theme values are Carbon's own
per-theme values (not naive reuse of light values):

| Role | Light (g10) | Dark (g100) |
|---|---|---|
| accent / action (primary button fill, selected controls) | `#0f62fe` | `#0f62fe` |
| accent hover | `#0050e6` | `#0050e6` |
| accent active | `#002d9c` | `#002d9c` |
| secondary action fill | `#393939` (hover `#474747`, active `#6f6f6f`) | `#6f6f6f` (hover `#5e5e5e`, active `#393939`) |
| tertiary/outline action stroke | `#0f62fe` (hover `#0050e6`, active `#002d9c`) | `#ffffff` (hover `#f4f4f4`, active `#c6c6c6`) |
| links | `#0f62fe` (hover `#0043ce`) | `#78a9ff` (hover `#a6c8ff`) |
| `--color-focus` | `#0f62fe` (inset ring `#ffffff`) | `#ffffff` (inset ring `#161616`) |
| danger / destructive | `#da1e28` (hover `#b81921`, active `#750e13`) | `#fa4d56` text/border form (hover/active per light values for filled buttons) |
| success | `#24a148` | `#42be65` |
| warning | `#f1c21b` | `#f1c21b` |
| info | `#0043ce` | `#4589ff` |
| error text on surfaces | `#da1e28` | `#ff8389` |
| `interactive` used for icon/selection tints (e.g. checkbox fill) | `#0f62fe` | `#4589ff` |
| highlight tint (blue selection wash) | `#d0e2ff` | (use selection-tint fills from §3.2 in dark) |

Mapping: CiteLadder's `--color-accent` (+ hover/active variants) → the
blue-60 rows; `--color-success/warning/danger/info` → the support rows
(hues change; **semantics do not** — support colors are status-only, never
decoration). Unchanged: chart series ladder (`--color-chart-1..8`,
`--color-series-*`) and answer-engine brand colors — except the optional
alignment of `--color-chart-1` to `#0f62fe` if review wants the primary
series to read as "ours" (PR 3 decision at review).

### 3.4 Compact geometry (D4)

| Role / surface | Old | New (Carbon compact) | Carbon source |
|---|---|---|---|
| `--control-height` | 36px | **32px** | Carbon `sm` component size context |
| `--table-row-height` | 44px | **32px** | verified: `data-table--sm` rows `min-block-size: 32px` (xs rows 24px, md 40px, xl 64px) |
| badges/tags | current | **24px** (dense inline variant **18px**) | verified tag sizes: sm 18px, md 24px |
| `--card-padding` | 20px | **16px** | Carbon `spacing-05` |
| `--page-section-gap` | 24px | 24px (unchanged) | Carbon `spacing-06` |
| `--workspace-gap` | 16px | 16px (unchanged) | Carbon `spacing-05` |
| menu/list item min-height (menus, selects, combobox lists) | current | **32px** | aligns with compact control context |
| spacing step ladder for any new spacing roles | — | Carbon scale: `spacing-01` 2px, `02` 4px, `03` 8px, `04` 12px, `05` 16px, `06` 24px, `07` 32px, `08` 40px, `09` 48px, `10` 64px, `11` 80px, `12` 96px, `13` 160px | verified from compiled Carbon CSS custom properties |

Exception rule: any control that must stay larger than 32px needs an explicit
entry on an exception list reviewed in PR 4 (expect none or near-none).

### 3.5 Square corners

`--radius-control: 6px → 0`, `--radius-card: 8px → 0`,
`--radius-overlay: 12px → 0`. Keep `--radius-full` (avatars, progress tracks,
dots) and `--radius-xs` (only if any sub-element needs 1–2px rounding).
Carbon's language is zero-radius on buttons, fields, cards, menus, modals,
tags, tables; circles only for avatars/indicators.

### 3.6 Motion tokens

Define roles in `globals.css` and consume them everywhere motion is
hand-written (`ui-motion.css`, skeleton shimmer, `BusyBar`, tooltip/dropdown
transitions):

| Token | Value | Use |
|---|---|---|
| `--motion-duration-fast-01` | `70ms` | button/toggle micro-interactions |
| `--motion-duration-fast-02` | `110ms` | fades |
| `--motion-duration-moderate-01` | `150ms` | small expansions, short moves |
| `--motion-duration-moderate-02` | `240ms` | expansion, toast |
| `--motion-duration-slow-01` | `400ms` | large expansion, important notifications |
| `--motion-duration-slow-02` | `700ms` | background dimming |
| `--motion-easing-standard` | `cubic-bezier(0.2, 0, 0.38, 0.9)` | default (productive) |
| `--motion-easing-entrance` | `cubic-bezier(0, 0, 0.38, 0.9)` | elements entering |
| `--motion-easing-exit` | `cubic-bezier(0.2, 0, 1, 0.9)` | elements leaving |

Reduced-motion neutralization already in `globals.css` keeps winning over all
of these.

### 3.7 Focus indicator (D3)

Replace the `.focus-ring` accent-border + glow with Carbon's verified spec,
driven by `--color-focus` (§3.3):

- Default (component edges): `outline: 1px solid var(--color-focus)`.
- Filled/selected controls (on-color focus): `outline: 2px solid
  var(--color-focus); outline-offset: -2px`.
- Emphasis variant (if ever needed): `box-shadow: 0 0 0 3px
  var(--color-focus)`.
- All variants switch to `outline-style: dotted` under `@media
  (prefers-contrast: more)` (Carbon uses `prefers-contrast` generally).
- Applied only through the existing `.focus-ring` / `.focus-input` /
  `.focus-frame` classes — no call-site changes. The glow rule and the
  attached-glow tokens retire in the same PR (replacement gate: inventory
  `.focus-ring` consumers first).

### 3.8 Hierarchy rule (layer-first, shadow-last)

Carbon's hierarchy is contrast between surface layers and 1px
`border-subtle` hairlines; one shadow role exists for overlays. CiteLadder
already has "no resting shadow on cards" — extend it: overlays
(modal/drawer/dropdown) keep exactly one shadow role (`--shadow-modal-value`
family), panels/menus rely on layer contrast + hairlines. No new shadows
anywhere.

---

## 4. Component-by-component adoption comparison (full `ui/` inventory)

Legend — **Restyle**: adopt Carbon values/patterns in CiteLadder's own
component; **Keep**: already equal or domain-true, only inherited token
changes apply; **Decide**: small open choice at review.

| Component (`frontend/components/ui/`) | Verdict | What Carbon changes / reference |
|---|---|---|
| `button.tsx` | **Restyle** | Square; compact 32px; primary → blue-60 ladder (§3.3); secondary → **solid gray fill** `#393939` (no border) instead of bordered style, hover `#474747`; ghost → transparent, hover `layer-hover`; danger → `#da1e28` ladder; focus 1px `--color-focus`. Keep tone names/props and `data-button-*` attributes |
| `input.tsx`, `textarea.tsx`, `search-field.tsx`, `date-field.tsx` | **Restyle** | Square; 32px; field surface `field-01` (`#ffffff`/`#262626`); 1px `border-subtle` box with `border-strong` bottom edge; placeholder `rgba(22,22,22,.4)`/`rgba(244,244,244,.4)`; helper text `text-helper`; invalid = `support-error` border + error text (keep `aria-invalid` contract) |
| `select.tsx`, `searchable-select.tsx`, `market-select.tsx`, `dropdown.tsx` | **Restyle** | Square; 32px triggers; menu surface on `layer` (`#ffffff`/`#262626`) + 1px hairline; item hover `layer-hover` `#e8e8e8`/`#333333`, selected `layer-selected` `#e0e0e0`/`#393939`; 32px item min-height; typeahead/check-slot patterns per Carbon listbox (behavior already adequate — style-only) |
| `checkbox.tsx`, `radio-group.tsx` | **Restyle** | Square boxes (no radius); 1px `border-strong` box; checked fill = `interactive` (`#0f62fe`/`#4589ff`) with white check/dot; invalid state `support-error` |
| `switch.tsx` | **Restyle** | Off track `#8d8d8d`, on track `interactive`; square-ish track (keep thumb circular per Carbon) |
| `tabs.tsx` | **Restyle** | Text tabs; selected tab gets a bottom accent underline (width matched to visual review against Carbon's rendered tabs) + `text-primary`; unselected `text-secondary`; hover `layer-hover` strip |
| `table.tsx`, `sort-indicator.ts`, `cursor-table-footer.tsx` | **Restyle** | 32px compact rows; header hairline + hover-revealed persistent sort arrow (keep `aria-sort`); row hover `layer-hover`; optional zebra via selection-tint fills; numeric cells keep tabular figures |
| `dialog.tsx`, `drawer.tsx` | **Restyle** | Square; overlay shadow is the single shadow; header hairline `border-subtle`; content on `background`, footer band on `layer`; 110–240ms enter/exit per §3.6 |
| `tooltip.tsx`, `info-hint.tsx` | **Restyle (visible change)** | Carbon tooltips are **inverse (dark in light mode)**: bg `background-inverse` `#393939` (dark theme `#f4f4f4`), text `text-inverse`, square, small radius-none. Adopt; keep single-open behavior |
| `alert.tsx`, `mutation-notice.tsx`, `read-error.tsx` | **Restyle** | Inline notification pattern: `layer` background, left edge in the support color, status-colored text where used; support hues from §3.3. `ReadError` retry contract unchanged |
| `badge.tsx` (+ `badge-variants.ts`) | **Restyle** | Square, 1px border, 24px (dense 18px); status tones follow support hues; keep all variant names |
| `toast.tsx` (`ToastProvider`) | **Restyle** | Colors/geometry only (support hues, square, 240ms). Provider mechanics keep |
| `skeleton.tsx`, `busy-bar.tsx`, `spinner.tsx`, `layout/page-loading.tsx` | **Keep** | Motion normalized via §3.6; Carbon has no stronger pattern here |
| `empty-state.tsx` + 4 domain wrappers | **Keep** | CiteLadder's availability vocabulary and empty-state pattern exceed Carbon's guidance; inherits new surfaces only |
| `unavailable-value.tsx`, `metric-value.tsx` | **Keep** | Availability vocabulary is a documented contract (zero ≠ absence) |
| `card.tsx`, `panel.tsx`, `workspace.tsx` | **Restyle (token-only)** | Square (via roles); surface = `panel` on `background`; hairline borders; **no new shadows**; tone system (`cardClasses`, `CardTone`) stays |
| `filter-chip.tsx`, `icon-chip.tsx`, `eyebrow.tsx`, `segmented-control.tsx` | **Restyle (token-only)** | Square corners, selected = `layer-selected`/accent rules; SegmentedControl keeps track metaphor with new values |
| `score-bar.tsx`, `score-ring.tsx`, `donut-chart.tsx`, `metric` visuals | **Keep** | Score-band token system is domain-true; only accent-adjacent colors shift via tokens |
| `chart.tsx`, `series-chart.tsx`, `trend-chart.tsx`, `chart-axes.tsx` | **Keep** | Recharts stays; series ladder unchanged (optional `--color-chart-1` → blue-60, review call); `aria-hidden` + text-description contract untouched |
| `typography.tsx` (`.type-*` ladder) | **Keep** | No Carbon type adoption (Sora/Switzer stay; scale unchanged) |
| `command-palette.tsx`, `copy-button.tsx`, `csv-import.tsx`, `display-time.tsx`, `pressable.tsx`, `field.tsx`, `cursor-pager.tsx`, `external-http-link.tsx`, `on-page-entities.tsx`, `passage.tsx`, `brand-logo.tsx`, `logo-mark.tsx`, `activity-progress.tsx` | **Keep** | No honest Carbon win; inherit token changes. `Pressable` keeps its "not a button" contract |
| `layout/app-shell.tsx`, `sidebar-nav.tsx`, `page-shell.tsx`, `nav-*` | **Restyle (PR 5)** | Shell chrome on `panel`/`well` layer distinct from `background` content; active nav = `layer-selected` fill + `text-primary`; 1px hairline section boundaries; no structural/JSX redesign |

No component changes ownership, exports, props, or ARIA behavior anywhere in
this plan. Tests asserting roles/names (`e2e/*.spec.ts`, colocated vitest
suites) must pass untouched.

---

## 5. PR plan

Each PR is independently releasable and reversible; most are single-file
token changes. Run `./scripts/check.ps1 -CheckOnly` once per completed diff;
during iteration run the smallest relevant suites. Product e2e specs must
pass **unchanged** in every PR.

### PR 1 — Square corners

- **Objective**: zero-radius language (§3.5).
- **Files**: `frontend/apps/app/src/globals.css` (three role values). Repair
  sweep only for primitives whose drawn borders/hairlines assumed rounding
  (`workspace.tsx`, `card-variants.ts`, `menu-variants.ts`,
  `segmented-variants.ts`, `filter-chip-variants.ts`) — edit only what
  visibly breaks.
- **Risks**: SVG arcs (score rings/donuts) unaffected — verify; overlay
  corners change perceived weight (intended).
- **Tests**: none new (token-value change; policy script guarantees
  call-site coverage). `pnpm check:policy`.
- **Visual checks**: card page, dialog, drawer, open dropdown, segmented
  control, chips/badges, buttons all variants, inputs — light + dark.
- **Acceptance**: no `rounded-` call-site diffs; `--radius-*` roles are
  0/xs/full only; budgets unchanged.
- **Rollback**: revert three token lines.

### PR 2 — Neutral ladder rebase (D1, D2 inputs; values §3.1/§3.2)

- **Objective**: g10/g100 neutral values on existing token names.
- **Files**: `frontend/apps/app/src/globals.css` only (light block, dark
  rebind block, and the `indigo`/`teal`/`public-surface` scoping bands).
  Chart ladder untouched.
- **Risks**: g10's white-panels-on-gray-ground flips the current ground/panel
  relationship — intended but review-heavy; `--color-brand-*` engine colors
  and evidence-family contrast on new surfaces; D6 check (indigo band vs
  future accent).
- **Tests**: `scripts/design-system-contrast.mjs` green with unchanged
  thresholds (adjust recorded expectations only, never thresholds, with a PR
  note).
- **Visual checks**: one page per domain in light+dark; charts; tables;
  `MissingValue` cells; both section bands; `[data-public-surface]` pages.
- **Acceptance**: zero token-name changes (grep proves call sites untouched);
  budgets unchanged.
- **Rollback**: revert `globals.css`.

### PR 3 — Accent + evidence swap to Carbon blue-60 (D5; values §3.3)

- **Objective**: one coherent Carbon color story: accent, links, secondary/
  tertiary actions, focus token, evidence families.
- **Files**: `globals.css` (accent/action family, `--color-focus` role,
  `--color-success/warning/danger/info` + `text-error`, link colors,
  secondary-button tone values in `button-variants.ts` **values only** if
  tones live there — inventory first). Optional: `--color-chart-1`.
- **Dependencies**: PR 2 (contrast judged on final neutrals).
- **Risks**: emerald is also used for "positive/success-adjacent" accents in
  some surfaces — audit for semantic drift (accent must mean *action*, never
  *success*); dark-theme link/interactive split (`#78a9ff` vs `#4589ff`) must
  land per role, not one value.
- **Tests**: contrast gate; tone-mapping unit expectations if
  `badge-variants.ts`/`button-variants.ts` encode hex (they must move to
  token references, not literals — policy anyway).
- **Visual checks**: every button tone × state, links, focus, selected
  controls, badges/status ladder, alerts, empty states — light+dark; charts
  against blue accent.
- **Acceptance**: no emerald values remain in `globals.css` (grep; keep only
  if a documented brand exception exists — default none); semantics distinct
  (action ≠ success).
- **Rollback**: revert token block.

### PR 4 — Compact geometry (D4; values §3.4)

- **Objective**: 32px controls and rows, 24px badges, 16px card padding,
  compact menu items.
- **Files**: `globals.css` role values; CSS-level adjustments in
  `frontend/components/ui/` only where a component hard-codes height/padding
  (inventory via grep for `36px`/`44px`/`20px` in `ui/`); exception list in
  the PR description for any control intentionally >32px.
- **Risks**: densest change visually; touch target a11y (32px is Carbon's
  compact standard — acceptable per design.md's AA posture, but verify with
  keyboard/touch review); labelled-record responsive rows in tables.
- **Tests**: existing suites; `e2e/surface-layout.spec.ts`.
- **Visual checks**: full forms, toolbars, all tables, badges in tables and
  headers, menus, dialogs — light+dark, narrow viewport.
- **Acceptance**: `--control-height`/`--table-row-height` = 32px; no
  hard-coded old values remain in `ui/` (grep); budgets unchanged.
- **Rollback**: revert role values + component CSS diffs (per-component
  reverts possible).

### PR 5 — Shell and navigation pattern (D2; §3.8)

- **Objective**: chrome-on-layer vs content-on-background hierarchy;
  `layer-selected` nav states; hairline boundaries.
- **Files**: `globals.css` (`--color-shell/sidebar/track/selected` and shell
  hairline rules); class-level tweaks confined to
  `frontend/components/layout/` (`sidebar-nav.tsx`, `app-shell.tsx`,
  `nav-link.tsx`, `page-shell.tsx`) — no structure changes.
- **Dependencies**: PRs 2–4. **Risks**: compact topbar (<981px), mobile
  Drawer, agent nav mode, command palette — separate review each.
- **Tests**: `e2e/shell.spec.ts` untouched and green.
- **Visual checks**: sidebar+topbar, compact topbar, Drawer, command palette,
  project switcher, agent panel trigger — light+dark, all nav states.
- **Acceptance**: shell visually layered per §3.8; no JSX structure diffs in
  `layout/`.
- **Rollback**: revert token + class diff.

### PR 6 — Motion tokens (§3.6)

- **Objective**: all hand-written motion via the verified duration/easing
  roles.
- **Files**: `globals.css` (new roles), `frontend/apps/app/src/ui-motion.css`,
  skeleton/`BusyBar` CSS in `globals.css`, `frontend/components/tour/` theming
  if it hard-codes timings (inventory first).
- **Risks**: dialogs/dropdowns feel snappier (intended); reduced-motion must
  keep overriding (asserted in existing tests).
- **Visual checks**: dialog/drawer/dropdown/toast/tooltip/skeleton/`BusyBar`
  in/out, reduced-motion on/off.
- **Acceptance**: no hard-coded `ms`/`cubic-bezier` outside `globals.css`
  (excluding vendored `driver.js` internals if unavoidable — list any).
- **Rollback**: revert.

### PR 7 — Focus indicator (D3; §3.7)

- **Objective**: Carbon focus spec, glow removed.
- **Files**: `globals.css` (`.focus-ring`, `.focus-input`, `.focus-frame`,
  `[aria-invalid]` interplay, glow-token retirement).
- **Dependencies**: PR 3 (`--color-focus` value). **Risks**: dark-surface and
  in-overlay focus legibility; forced-contrast dotted variant.
- **Visual checks**: keyboard tab-through shell → toolbar → form → table row
  actions; light, dark, forced-contrast.
- **Acceptance**: no glow remains on focus classes; dotted variant present.
- **Rollback**: revert single file.

### PR 8 — Component polish batches (§4 "Restyle" rows)

Three sub-PRs, each with the PR 1 template (visual matrix light+dark,
acceptance: no ARIA/role/prop changes, budgets green):

- **8a Inputs & buttons**: field surface/border treatment, placeholder and
  helper values, invalid states (§4 rows for `input`/`button` families).
- **8b Menus, selects, tabs, chips**: menu surfaces, item hover/selected
  values, 32px items, tab underline pattern.
- **8c Tables, badges, alerts/tooltips**: compact-row styling, sort
  affordance, inverse tooltips, notification left-edge pattern, 24px badges.
- **Rollback**: per-family revert.

### PR 9 — Ledger

- **Objective**: documentation matches shipped reality.
- **Files**: `docs/design.md` (new color ladder provenance: Carbon g10/g100
  values as the neutral/reference ladder, blue-60 accent, square language,
  compact density, motion tokens, focus spec, layer-first hierarchy — and
  "Carbon is a design reference, not a dependency"); minor wording updates in
  `frontend/scripts/design-system-source-checks.mjs` only if rule wording
  references changed role names (never thresholds).
- **Acceptance**: check.ps1 green; docs spot-checked against `globals.css`.

**Sequencing**: `1 → 2 → 3 → 4 → {5,6,7} → {8a,8b,8c} → 9`. Expected total
diff: small, concentrated in `globals.css` + `ui-motion.css` + a handful of
class-level files in `components/ui/` and `components/layout/`.

---

## 6. Appendix — Validation

```
pnpm --dir frontend check:policy      # design-system + architecture gates (incl. contrast)
pnpm --dir frontend check:duplicates  # jscpd ratchet (zero clones)
pnpm --dir frontend check:bundle      # eager budgets (must not move)
pnpm --dir frontend check             # types + lint
pnpm --dir frontend test              # vitest
pnpm --dir frontend test:e2e -- --project=app e2e/shell.spec.ts
./scripts/check.ps1 -CheckOnly        # once per completed executable diff
```

## 7. Appendix — Value sources (all extracted 2026-09-30)

- **g10 / g100 token values**: `@carbon/themes@11.82.0`,
  `js/generated/themes/g10.js` and `g100.js` (unpkg) — every hex in §3.1–§3.3.
- **Button action ladder incl. hover/active/disabled per theme**:
  `@carbon/themes@11.82.0`, `scss/generated/_button-tokens.scss`.
- **Compact row heights**: `packages/styles/scss/components/data-table/
  _data-table.scss` (Carbon `main`): `--sm` rows `min-block-size: 32px`,
  `--xs` 24px, `--xl` 64px; menu cells 24/32/40px.
- **Button default height 48px / size contexts xs–2xl**:
  `packages/styles/scss/components/button/_button.scss` (Carbon `main`).
- **Tag heights**: `packages/styles/scss/components/tag/_tag.scss`: sm 18px,
  md 24px.
- **Spacing scale**: compiled `@carbon/styles` CSS custom properties
  (`--cds-spacing-01` … `-13` = 2/4/8/12/16/24/32/40/48/64/80/96/160px).
- **Motion durations/easings**: carbondesignsystem.com
  /elements/motion/overview/.
- **Focus spec**: `packages/styles/scss/utilities/_focus-outline.scss`
  (Carbon `main`).
- **Zero-radius language**: Carbon component sources/compiled CSS (no
  `border-radius` on buttons/fields/tables/tiles).
