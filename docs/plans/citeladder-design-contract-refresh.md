# Design-system contract refresh — CiteLadder product app

> Status: **implemented locally on 1 October 2026** in committed slices on
> `codex/design-contract-refresh`. On 2 October 2026 the owner authorized
> rebasing onto main, review, simplification and PR creation, then stopping.
> Registered in [docs/plans/ACTIVE.md](ACTIVE.md). CI and merge remain pending.
> The design owner is [docs/design.md](../design.md).
> Originally produced from a read-only repository
> inspection; Carbon Design System (<https://carbondesignsystem.com/>) is used
> **as inspiration for contracts only** — no Carbon values, packages, or
> visual language are adopted. Every implementation value in this document is
> either CiteLadder's current verified value or an explicitly proposed
> CiteLadder value; the implementing agent needs nothing else. Read
> [AGENTS.md](../../AGENTS.md) first — its workflow, validation and
> replacement-gate rules apply to every PR.
>
> **This is not a retheme and not a Carbon migration.** No Carbon package is
> installed; the palette values, radii, fonts (Switzer/Sora), primary accent,
> routing, API contracts and component ownership are unchanged. What changes:
> the system around those values — token roles and relationships, density
> roles, motion roles, one focus treatment, action-vs-status color
> separation, radius/shadow usage rules, and a coherent state matrix per
> component family.

## 0. Owner decisions (resolved 2026-09-30, supersedes all earlier drafts)

| # | Decision | Resolution |
|---|---|---|
| D1 | Surface palette | **Keep current colors.** No g10/g100 rebase. Instead: audit the ~120 semantic tokens so each has one intentional role and the surface ladder (`background → panel → well → elevated` + state tints) has predictable relationships (§3.1) |
| D2 | Density | **CiteLadder compactness with named roles** — not Carbon's numbers. Roles, not one forced height (§3.2) |
| D3 | Motion | **Implement the centralized motion-role system** (§3.3); values are CiteLadder's (defaulted to the verified curves, CiteLadder-chosen durations) |
| D4 | Focus | **One focus system**: 2px ring on the existing accent, consistent offset, inverse-safe, `:focus-visible` only, forced-colors support, glow removed (§3.4) |
| D5 | Color semantics | **Separate action color from status colors** while keeping the current primary accent (§3.5) |
| D6 | Radii | **Keep the 6/8/12 + xs/full ladder.** Enforce role-to-component mapping; no invented radii (§3.6) |
| D7 | Shadows | **Keep no-resting-shadow; consolidate to `none` / `overlay` / `modal`** roles; no arbitrary box-shadows (§3.7) |
| D8 | Component states | **Normalize the full state matrix** (default → hover → active → selected → focus → disabled → invalid) across all control families (§3.8) |

### Execution clarifications (owner, 1 October 2026)

- Common tokens and shared controls apply across their consumers; separately scoped marketing roles stay scoped.
- Retire redundant tokens immediately after migrating consumers; retain no compatibility aliases.
- Apply 28/32/36px controls on every viewport, retiring the former 44px phone/coarse-pointer override.
- Emerald remains the product action accent; dark mode minimizes decorative colour. The existing product dark accent is already emerald; separate marketing indigo bands retain their scope.
- Update only affected E2E visual assertions to the border/outline contract, preserving accessibility coverage.
- Treat the proposed PRs as committed slices; create no PR yet. Run the repository completion check once for the completed executable branch.

## 1. Scope and non-goals

**In scope** (product app and common token/control consumers: `frontend/apps/app`, `frontend/components/**`
product trees, `frontend/lib`): token-role audit and contract; density/motion/
focus/shadow role systems; radius and shadow enforcement; color-semantics
audit; component state normalization; policy-script and documentation
updates.

**Non-goals**:

- Installing any third-party UI package (incl. `@carbon/react`).
- Changing palette values, accent hue, typefaces, the `.type-*` ladder, or
  the 4px spacing grid.
- Zero-radius (Carbon) styling — the 6/8/12 ladder stays.
- Restructuring `AppShell` or any component ownership/export/props/ARIA
  changes. Playwright role/accessible-name contracts remain unchanged; the owner authorized affected visual assertions to migrate to border/outline.

---

## 2. Baseline at planning (historical; the refresh replaces these contracts)

- **Single token owner**: `frontend/apps/app/src/globals.css` (~1,900 lines) —
  the only file allowed to contain raw hex or the single Tailwind `@theme`
  block (enforced by `frontend/scripts/check-design-system.mjs`). Contents:
  ~120 semantic `--color-*` tokens (surfaces `background/panel/well/elevated`,
  border ladder, ink ladder, emerald accent/action family, evidence families
  `success/warning/danger/info`, chart ladder `--color-chart-1..8`,
  `--color-series-*`, run-status/score-band/sentiment colors, engine brand
  colors); layout roles (`--control-height: 36px`, `--table-row-height:
  44px`, `--card-padding: 20px`, `--page-section-gap: 24px`,
  `--workspace-gap: 16px`); radius ladder (`--radius-control: 6px`,
  `--radius-card: 8px`, `--radius-overlay: 12px`, plus `--radius-xs`,
  `--radius-full`; Tailwind's default scale is cleared); z-index ladder;
  shadow roles (`smudge`, `raised`, `selected`, `elevated`, `modal-value`);
  the `.type-*` classes; and the full `:root[data-theme='dark']` rebind
  block. Section bands `[data-citeladder-section="indigo"|"teal"]` and
  `[data-public-surface]` re-scope tokens.
- **Themes**: light default; dark via `data-theme` attribute
  (`frontend/lib/theme/theme.ts`, pre-paint `/theme-preference.js`).
- **Known inconsistencies this plan fixes** (verified during inspection):
  mixed densities (36px controls, 44px rows, 20px card padding, ad-hoc menu
  metrics); four overlapping "choose from a list" controls with divergent
  metrics (`select.tsx`, `searchable-select.tsx`, `market-select.tsx`,
  `dropdown.tsx`); hand-written transition values in `ui-motion.css` and
  component CSS keyed on Radix `data-state`; a `.focus-ring` accent+glow
  treatment plus `.focus-input`/`.focus-frame` variants; five shadow roles
  (`smudge/raised/selected/elevated/modal-value`) with call-site usage drift;
  hand-rolled SVG chart debt (`trend-chart.tsx`, `chart-axes.tsx`,
  `performance-chart.tsx`) — explicitly **out of scope** here.
- **Policy gates** (keep green in every PR): raw-hex ban outside
  `globals.css`; role-based radii only; no call-site shadows, font-weight, or
  raw type utilities; 4px grid; jscpd zero-clone ratchet; eager bundle
  budgets (JS ≤ 281,643 B gzip, CSS ≤ 22,243 B gzip);
  `scripts/design-system-contrast.mjs`; tests may not assert presentation
  classes.

---

## 3. The contract being implemented

### 3.1 Surface-role contract (D1) — audit, don't repalette

**Relationships to make intentional** (the ladder every surface token must
fit):

```
background   page ground; nothing sits "on" itself
  └ panel    cards/panels/chrome resting on background
      └ well recessed/input surfaces (sinks *into* panel)
elevated     floating surfaces: menus, popovers, drawers, dialogs (own layer, not a "slightly different panel")
hover / selected / active   state tints derived FROM the surface they modify — never standalone surfaces
```

**Audit deliverable** (PR 5): enumerate every `--color-*` token in
`globals.css` into exactly one class — `surface` / `state-tint` / `ink` /
`border` / `semantic-status` / `brand` / `data-viz` — and record the table in
`docs/design.md` (§ "Token contract"). For each token: one purpose, its
position in the ladder, and its dark-theme counterpart. Then fix drift:

- `elevated` gets the single purpose "floating overlay surface". Any
  component using `elevated` as a decorative second card tone moves to
  `panel` or a `state-tint`.
- Every surface consumes its state tints from the same derivation rule
  (hover = closest step toward ink or a fixed tint ratio; selected =
  distinct-from-hover; active = distinct-from-selected) — verified
  visually in both themes.
- Redundant/ambiguous tokens found by the audit are **retired immediately** after consumer migration under the replacement
  gate — inventory consumers first. No new tokens unless the audit proves a
  gap; the ~120 count should shrink, not grow.

### 3.2 Density roles (D2) — CiteLadder compact, with a size scale

Replace the single `--control-height` with a role scale; components consume
roles, never raw px:

| Role | Accepted value | Used by |
|---|---|---|
| `--control-height-sm` | `28px` | dense contexts: table toolbars, in-table row actions, compact topbar |
| `--control-height-md` | `32px` | **default** control height: inputs, selects, buttons, menu rows |
| `--control-height-lg` | `36px` | primary/hero actions and page-level CTAs only (today's 36px becomes the exception tier, not the default) |
| `--table-row-height` | `36px` | standard rows |
| `--table-row-height-dense` | `32px` | opt-in dense tables (sources/URL tables, executions) |
| `--card-padding` | `16px` (from 20px) | all cards/panels |
| `--menu-item-height` | `32px` | menus, select/combobox/dropdown items |
| `--badge-height-sm` / `--badge-height-md` | `20px` / `24px` | badges, tags, filter chips |
| `--page-section-gap`, `--workspace-gap` | 24px / 16px (unchanged) | page rhythm |

Rules: menu rows track `--menu-item-height`; every "choose one" control
(the four select-family owners) renders triggers at the same role as buttons
in the same context; the scale is the only source of control heights (grep
audit removes hard-coded 36/44/20px in `components/ui/`). Exceptions need a
listed entry in the PR description (expect near-none). Values are proposals
within the owner's stated 32–36 / 28–32 / 36 / 16 / 32–36 / 20–24 ranges —
accepted by the owner for every viewport; do not choose values per component.

### 3.3 Motion roles (D3)

New roles in `globals.css`; all hand-written motion migrates to them
(`ui-motion.css` dialog/drawer/dropdown transitions keyed on Radix
`data-state`, skeleton shimmer, `BusyBar`, tooltip/toast timing, tour theming
where it sets timings):

| Token | Value | Use |
|---|---|---|
| `--motion-fast` | `110ms` | fades, hover tints, micro-feedback |
| `--motion-normal` | `150ms` | small expansions, menus, tooltips |
| `--motion-slow` | `240ms` | dialogs, drawers, toasts, large surfaces |
| `--ease-standard` | `cubic-bezier(0.2, 0, 0.38, 0.9)` | default |
| `--ease-enter` | `cubic-bezier(0, 0, 0.38, 0.9)` | entering elements |
| `--ease-exit` | `cubic-bezier(0.2, 0, 1, 0.9)` | leaving elements |

(The curves are the ones verified from Carbon's motion spec — kept because
they are good defaults, not because Carbon is being adopted. Durations are
CiteLadder's three-tier choice within Carbon's verified 70–240ms productive
band.) Existing `prefers-reduced-motion` neutralization keeps winning over
every consumer. A policy check (PR 1) bans hard-coded `ms` durations and
`cubic-bezier`/`ease*` values outside `globals.css` (vendored `driver.js`
internals exempt if unavoidable — list any).

### 3.4 One focus system (D4)

Keep the `.focus-ring` / `.focus-input` / `.focus-frame` architecture; redefine
the treatment once, in `globals.css`:

- **Ring**: `2px` solid `--color-accent` (the existing emerald — focus is an
  *action* color per §3.5), applied via `outline` with a **consistent offset**
  (1px outside for surface controls; `-2px` inside for filled/selected
  controls where the outline would clip, e.g. selected nav items, checked
  rows).
- **`outline: none` only together with a ring replacement**; everything keys
  on `:focus-visible`, never generic `:focus` (mouse clicks must not show
  rings — verify no regression against current `:focus-visible` behavior).
- **Inverse treatment**: on dark/selected/inverse backgrounds the ring uses
  the theme's high-contrast ink instead of accent so it stays visible
  (light: accent on panel; dark: accent if ≥3:1 against the surface else
  `--color-foreground`). Define once as a rule, not per-component hacks.
- **Forced colors**: `@media (forced-colors: active)` fallback (system
  highlight) for all three classes; dotted style under `prefers-contrast:
  more`.
- **Glow removed**: the attached-glow rule and its tokens retire
  (replacement gate: inventory `.focus-ring` consumers first). No control
  may define its own focus style — the three classes are the only focus
  treatments (audit sweep in PR 2).

### 3.5 Action vs status color separation (D5)

Contract (values unchanged; **usage** changes where drifted):

| Family | May mean | Must never mean |
|---|---|---|
| `--color-accent` / action family | actions (primary/CTA), selection, links, focus | success, positive metrics, "healthy" status |
| `--color-success` | success status only | primary CTA, "selected", positive metric deltas (metrics use data-viz/neutral delta treatments, not success) |
| `--color-danger` | destructive intent + error status | generic emphasis |
| `--color-warning` | warning status only | decoration |
| `--color-info` | informational status (distinct role, never a second accent) | selection or action |

**Audit deliverable** (PR 4): grep-driven sweep of every accent/success/
danger/info consumption in product trees; fix violations (e.g., a green
"selected" state, a success-colored CTA, info used decoratively). Borderline
call sites are listed in the PR for review rather than silently changed.
`scripts/design-system-contrast.mjs` re-run after any usage change.

### 3.6 Radius usage rules (D6)

Values unchanged (`control` 6 / `card` 8 / `overlay` 12 / `xs` / `full`).
Enforce the mapping:

- Buttons, inputs, selects, menus triggers → `--radius-control`.
- Cards, panels, well surfaces → `--radius-card`.
- Dialogs, drawers, dropdown/popover surfaces → `--radius-overlay`.
- Avatars, status dots, pills, chips that are genuinely pill-shaped →
  `--radius-full`.
- Everything else: `--radius-xs` only if a sub-element truly needs 1–2px;
  **no new radius values anywhere** (policy script already bans non-role
  radii — extend it in PR 3 to also flag a component family consuming a
  radius role inconsistent with the table above, as a reviewed advisory
  list, not a hard gate, if false-positives are likely).

### 3.7 Shadow roles (D7)

Collapse the five shadow roles to three; components consume a role or no
shadow at all:

| Role | Definition | Consumers |
|---|---|---|
| *(none)* | resting state: cards, panels, tables, nav — hierarchy by boundary + surface, never shadow | all static surfaces (unchanged policy) |
| `--shadow-overlay` | one elevation step for detached floating surfaces: dropdown menus, popovers, tooltips, combobox lists, command palette | overlay-ish surfaces only |
| `--shadow-modal` | the strongest elevation: dialog, drawer (and toast if it floats above overlays) | top-layer surfaces only |

Migration: map `smudge/raised/selected/elevated/modal-value` consumers onto
the three roles (most `smudge`/`raised` consumers should become *no shadow*
with a hairline border; `elevated`/`selected` shadows fold into
`--shadow-overlay`); retire the old role names after the consumer inventory
is empty (replacement gate). Policy script extension: call-site
`box-shadow` must reference one of the three roles or be absent (raw
box-shadows at call sites are already banned — verify and tighten the
existing check rather than duplicating it).

### 3.8 Component state matrix (D8)

Every family below must implement the full chain
**default → hover → active (pressed) → selected → focus-visible → disabled →
invalid** (where meaningful) using the state-tint roles from §3.1 and the
focus system from §3.4. Selected and hover must be visually distinct in both
themes; disabled never shows focus; invalid is always paired with
`aria-invalid` and a text equivalent (availability vocabulary rules apply —
no color-only meaning).

| Family | States to verify/implement | Notes |
|---|---|---|
| Buttons (all tones incl. ghost/danger) | hover, active, selected (toggle buttons), focus, disabled, loading | secondary/ghost hovers use state tints on their own surface; disabled = muted ink + disabled fill, no ring |
| Inputs / textarea / search / date fields | hover (border-strong), focus (`.focus-input`), disabled, invalid | helper text uses `text-helper`; invalid pairs border + text + icon |
| Selects, dropdowns, searchable/market selects | trigger states + **menu item** hover/active/selected/disabled/focus | all four owners render items at `--menu-item-height` with identical hover/selected tints |
| Tabs | hover, selected (accent underline + `text-primary`), focus, disabled | selected ≠ hover distinct |
| Checkboxes, radios, switches | unchecked/checked/indeterminate (checkbox), hover, focus, disabled, invalid | checked fill = accent (action) — **not** success green |
| Tables | row hover, row selected, active (pressed), sorted-header states, dense variant | `aria-sort` contract unchanged; selected row distinct from hover in dark |
| Chips / badges | chips: default/hover/selected/disabled; badges: static (no interactive states) | badge sizes per §3.2 |
| Navigation (sidebar, agent nav, compact topbar, command palette) | hover, current (selected), focus, entitlement-disabled | current uses selected tint + `text-primary`, not accent wash |
| Toasts / alerts / read errors | info/success/warning/danger tones, hover only where actionable | tones per §3.5 semantics |

Verification deliverable: a state-matrix checklist per family executed
visually (light + dark + reduced-motion + forced-contrast) and recorded in
the PR description; behavior asserted by existing role-based suites stays the
regression gate.

---

## 4. PR plan

Each PR is independently releasable and reversible. Foundations first
(no-visual-change or single-concern), then normalization passes. Run
`./scripts/check.ps1 -CheckOnly` once for the completed executable branch; iterate with the smallest relevant suites. Role/ARIA behavior stays intact; only the authorized visual assertions change.

### PR 1 — Motion roles (§3.3)

- **Objective**: centralized duration/easing roles; zero visual-identity
  change beyond timing normalization.
- **Files**: `frontend/apps/app/src/globals.css` (new roles),
  `frontend/apps/app/src/ui-motion.css`, skeleton/`BusyBar` CSS,
  `frontend/components/tour/` theming if it hard-codes timings (inventory
  first). New policy check in `frontend/scripts/design-system-source-checks.mjs`:
  hard-coded `ms`/`cubic-bezier` outside `globals.css` fails.
- **Risks**: menus/dialogs feel snappier (intended); reduced-motion override
  ordering.
- **Tests**: existing reduced-motion assertions; the new policy check's own
  fixture.
- **Visual checks**: dialog/drawer/dropdown/toast/tooltip/skeleton/`BusyBar`
  in/out — light+dark, reduced-motion on/off.
- **Acceptance**: grep proves no hard-coded motion values outside
  `globals.css` (exemptions listed); budgets unchanged.
- **Rollback**: revert.

### PR 2 — One focus system (§3.4)

- **Objective**: single 2px accent ring, consistent offset, inverse-safe,
  `:focus-visible`-only, forced-colors; glow retired.
- **Files**: `globals.css` (`.focus-ring`, `.focus-input`, `.focus-frame`,
  `[aria-invalid]` interplay, glow-token retirement); sweep any component
  defining bespoke focus styles into the three classes (inventory first —
  `frontend/components/ui/`, `components/layout/`).
- **Dependencies**: none (accent value unchanged). **Risks**: visibility on
  dark/selected surfaces; keyboard specs (`e2e/visibility.spec.ts` keyboard
  sections, `e2e/shell.spec.ts`).
- **Visual checks**: tab-through shell → toolbar → form → table actions →
  dialog; light, dark, selected backgrounds, forced-contrast, forced-colors.
- **Acceptance**: no glow rules remain; no bespoke focus styles outside the
  three classes (grep + policy check); keyboard e2e green.
- **Rollback**: revert single file.

### PR 3 — Radius & shadow role enforcement (§3.6, §3.7)

- **Objective**: mapping rules enforced; shadow roles collapsed to
  none/overlay/modal.
- **Files**: `globals.css` (shadow role definitions; old shadow roles deleted after consumer migration); shadow consumer migration across `frontend/components/`
  (inventory `smudge|raised|selected|elevated|modal-value` usages first);
  `design-system-source-checks.mjs` extensions (radius-role mapping advisory;
  box-shadow must use a role — tighten existing rule).
- **Risks**: removing `raised`/`smudge` shadows flattens some surfaces —
  pair each removal with the hairline/boundary it relies on per §3.8 review;
  z-index ladder untouched.
- **Visual checks**: cards/panels/menus/tooltips/dialogs before/after in
  both themes; `surface-layout.spec.ts`.
- **Acceptance**: only the three shadow roles exist (grep); policy checks
  green; no visual regression in hierarchy.
- **Rollback**: revert the coherent slice.

### PR 4 — Action vs status color separation (§3.5)

- **Objective**: semantic-color usage audit; fix violations; keep all values.
- **Files**: `globals.css` only if a token is re-purposed/retired; call-site
  class/token changes in `frontend/components/**` where green/red/yellow
  currently mean action/selection/emphasis; audit table appended to the PR
  description.
- **Dependencies**: PR 2 (focus uses accent — proves the action role).
  **Risks**: perceived regression where green CTAs were intentional product
  choices — those are review decisions, listed explicitly, not silently
  changed; contrast re-check per change.
- **Tests**: contrast script; affected colocated suites.
- **Visual checks**: every status badge/alert/evidence surface; every CTA and
  selected state; score/metric visuals (confirm metrics don't use success
  green).
- **Acceptance**: no family-violation findings left open (each either fixed
  or owner-signed exception recorded in design.md).
- **Rollback**: revert call-site changes (token values untouched).

### PR 5 — Surface-role audit and contract (§3.1)

- **Objective**: the token contract table in `docs/design.md`; ambiguity and
  redundancy fixes.
- **Files**: audit script/output over `globals.css` tokens; consumer fixes
  for misused tokens (esp. `elevated`); immediate retirement of redundant tokens; `docs/design.md` "Token contract" section.
- **Dependencies**: PRs 3–4 (surface/shadow/semantics settled first).
  **Risks**: largest review surface; token retirement requires a complete consumer inventory and cutover; dark-theme
  counterpart verification per token.
- **Tests**: contrast script; jscpd (migrations must not introduce clone patterns); budgets.
- **Visual checks**: one page per domain light+dark after any consumer fix;
  both section bands and `[data-public-surface]`.
- **Acceptance**: every `--color-*` token appears in the contract table
  exactly once with one purpose; no orphan/ambiguous uses (grep-backed);
  budgets unchanged.
- **Rollback**: revert the coherent slice.

### PR 6 — Density roles (§3.2)

- **Objective**: the named size scale replaces mixed 36/44/20px metrics.
- **Files**: `globals.css` (role definitions; legacy height aliases deleted after consumer migration);
  height/padding consumer updates in `frontend/components/ui/` (grep
  inventory of hard-coded 36/44/20px first); domain call sites only where
  they hard-code metrics (should be near-none).
- **Risks**: default control height 36→32 is the most visible change in the
  plan — run the full visual matrix; touch-target review at 28px in dense
  contexts (sm is opt-in for toolbars/table actions only); the four
  select-family owners must land in the same PR or metrics drift mid-release.
- **Tests**: existing suites; `e2e/surface-layout.spec.ts`.
- **Visual checks**: all forms/toolbars, all tables (standard + dense),
  badges in tables/headers, all menus/selects, cards — light+dark, narrow
  viewport.
- **Acceptance**: no hard-coded 36/44/20px in `components/ui/` (grep); all
  controls consume a `--control-height-*` role; exception list in PR
  description.
- **Rollback**: revert role values (consumers reference roles, so a value
  revert re-flows everything).

### PR 7 — Component state normalization (§3.8)

Three sub-PRs, each with the standard template (objective/files/risks/
visual checks per family in light+dark+reduced-motion+forced-contrast;
acceptance: no ARIA/role/prop changes, budgets green, retained E2E behavior;
rollback per family):

- **7a Buttons + inputs + selects/dropdowns** (the four list-control owners
  get identical item metrics/hover/selected in this PR).
- **7b Tabs + tables + navigation** (selected-vs-hover distinctness in dark
  is the acceptance focus).
- **7c Checkboxes/radios/switches + chips/badges + toasts/alerts** (checked =
  accent not green — closes the §3.5 loop in controls).

State-matrix checklists (§3.8) recorded per family in each PR description.

### PR 8 — Ledger

- **Objective**: documentation matches shipped contracts.
- **Files**: `docs/design.md` (surface-role ladder, density scale, motion
  roles, focus system, action-vs-status rule, radius/shadow mapping, state
  matrix); `docs/frontend-architecture.md` only if ownership wording is
  affected; policy-script wording updates only.
- **Dependencies**: PRs 1–7. **Acceptance**: check.ps1 green; docs
  spot-checked against `globals.css` by review.

**Sequencing**: `1 → 2 → 3 → {4, 5} → 6 → {7a, 7b, 7c} → 8`. Expected diff:
concentrated in `globals.css`, `ui-motion.css`, a policy script, and
class-level sweeps across `components/ui/` — no structural or behavioral
rewrites.

---

## 5. Appendix — Validation

```
pnpm --dir frontend check:policy      # design-system + architecture gates (incl. contrast)
pnpm --dir frontend check:duplicates  # jscpd ratchet (zero clones)
pnpm --dir frontend check:bundle      # eager budgets (must not move)
pnpm --dir frontend check             # types + lint
pnpm --dir frontend test              # vitest
pnpm --dir frontend test:e2e -- --project=app e2e/shell.spec.ts
./scripts/check.ps1 -CheckOnly        # once per completed executable diff
```

## 6. Appendix — External references used (inspiration only; no values adopted from them except the three easing curves noted in §3.3)

- Carbon Design System — motion specification (duration tiers, productive
  easing curves), focus-outline utility structure
  (`packages/styles/scss/utilities/_focus-outline.scss`), inline-notification
  and listbox state patterns, layer-vs-shadow hierarchy.
- Carbon's token *grouping* (background / layer / field / border / text /
  support / interactive) informed the §3.1 audit classes — the values remain
  CiteLadder's.
