# Design System — Searchify

> The **written form** of the Searchify design system, and its authority. The app runs on the
> **Atlassian Design System**, flat 2.0: **`frontend/app/ds-tokens.css`** holds the ADS
> primitives (`--ds-*`, ported verbatim from `@atlaskit/tokens`, light + dark) and
> **`frontend/app/globals.css`** holds the semantic layer that maps onto them. The previous
> Figma port — royal blue `#2756FF` and the authored warm-charcoal "dusk" dark deck — is fully
> replaced. The public surface (marketing routes **and** the logged-out auth screens) still
> runs its own creative system, **Searchify Proof**, in
> `frontend/app/(marketing)/marketing-theme.css`; folding it onto the ADS layer is Phase 2.
> Machine guards keep this document, the token files, elevation, and WCAG AA in sync
> (`frontend/app/globals.test.ts`, `frontend/scripts/check-design-tokens.mjs`,
> `frontend/scripts/check-flat-elevation.mjs`).
> Companion docs: [`../Agents.md`](../Agents.md), [`invariants.md`](invariants.md),
> [`backend-architecture.md`](backend-architecture.md), [`frontend-architecture.md`](frontend-architecture.md).

## 1. Overview

- **Two files, one direction of flow.** `ds-tokens.css` owns ADS *values*; `globals.css` owns
  *meanings* and the Tailwind bridge. Components consume **bridged Tailwind semantic tokens
  only** — never raw hex (no-raw-hex guard), and never a bare `--ds-*` name.

  ```
  ds-tokens.css  →  globals.css  →  @theme inline  →  components
  (ADS values)      (semantics)     (utilities)       (classes)
  ```

- **Aesthetic**: dense, confident **B2B analytics** in the Atlassian visual language — a
  `#F7F8F9` sunken canvas, white panels separated by **a tint step and a 1px alpha hairline**,
  one **ADS blue accent `#0C66E4`** reserved for data, links, active states and focus rings,
  the ADS accent ramp for every semantic hue, **Inter** for UI text and **Geist Mono** tabular
  numerals for every metric, 4px grid, WCAG 2.1 AA.
- **Flat 2.0 is a hard rule, not a preference** — see §4a. Shadow means "this floats above the
  page" and appears only on overlays. Every previous pass drifted back to soft-shadow cards
  because nothing enforced it; `check-flat-elevation.mjs` now does.
- **Light is the default theme.** Dark is a full sibling and costs almost nothing to maintain:
  every semantic token resolves through a `var(--ds-*)` that already flips, so the dark block
  in `globals.css` is a single `color-scheme: dark` line. Every documented text/surface pair in
  **both** themes meets **AA ≥ 4.5:1**, computed programmatically in `globals.test.ts`.

## 2. Theme model

Two explicit surface hierarchies. `:root` = light (default), `html[data-theme='dark']` = dark —
the selector under which **both** files declare their values. A pre-hydration script sets
`data-theme` before first paint. **Light is the default**: the bootstrap resolves
`stored choice → light`; the OS preference is intentionally not consulted — only an explicit
stored `dark` choice (from any ThemeToggle) opts into dark.

**Light surface ladder:** canvas `--bg-base #F7F8F9` (ADS `surface-sunken`) → panels
`--bg-panel #FFFFFF` (`surface`) → `--bg-elevated #FFFFFF` (`surface-raised`) → overlays
`#FFFFFF`. Sidebar = panel `#FFFFFF`.

**Dark surface ladder:** canvas `#101214` → panel `#161A1D` → elevated `#1D2125` → overlay
`#22272B` (strictly ascending luminance). Sidebar = panel.

Note the inversion: **the canvas is recessed and cards sit on it.** That tint step is what
carries hierarchy now that nothing casts a shadow. `--bg-alt` (6%) and `--bg-well` (14%) are the
ADS **alpha** neutral at two depths, and `--bg-active` (31%) is the pressed step — because they
are alpha, a quiet button or a well looks correct on a white card, on the sunken canvas, and
inside a tinted panel. An opaque grey only ever matched one of the three.

**The accent no longer changes hue between themes.** Under the dusk system light royal blue +
dark violet was a deliberate split; ADS uses one blue family throughout
(`#0C66E4` → `#579DFF`), so the two themes now agree. In both, the accent is reserved for
links, active states, focus rings and data visualization. Owned citations track the accent
(blue); the former green owned-citation identity remains dropped.

## 3. Atlassian → Searchify token mapping

Rule: **the semantic name stays, the value comes from ADS.** This is what made the port
tractable — because all 218 components already consumed bridged semantic names only, and the
repo held zero raw hex, zero palette-direct utilities and zero `dark:` variants, repointing the
value layer restyled the whole app without touching component code.

| ADS primitive | Searchify token(s) | Notes |
|---|---|---|
| `elevation.surface.sunken` | `--bg-base` | the app canvas is **recessed** — `#F7F8F9` / `#101214` |
| `elevation.surface` | `--bg-panel`, `--bg-sidebar` | cards, tables, and the sidebar+topbar chrome frame |
| `elevation.surface.raised` | `--bg-elevated` | dropdowns, drawers, tooltips; in light it equals `surface` (ADS separates them with the raised shadow, which flat 2.0 bans) |
| `elevation.surface.overlay` | `--surface-overlay` | modal/palette surface |
| `color.background.neutral` / `-hovered` / `-pressed` | `--bg-alt` / `--bg-well` / `--bg-active` | **alpha**, at 6% / 14% / 31%; the quiet-control interaction ladder |
| `color.background.input` | `--bg-input` | field fill; replaced the old `bg-well` resting state so hover has somewhere to go |
| `color.text` / `.subtle` / `.subtlest` / `.disabled` | `--text-primary` / `--text-secondary` / `--text-muted` / `--text-subtle` | `subtlest` is captions (4.6:1, gated); `disabled` is decorative only |
| `color.text.inverse` | `--text-inverse` | on accent/bold fills |
| `color.link` | `--accent-text`, and `--text-link` as its alias | **no `--text-accent` token exists** |
| `color.border` / `.bold` / `.focused` | `--border-subtle` + `--border` / `--border-strong` / `--border-focus` | **alpha hairlines** (`#091E4224` / `#A6C5E229`) so an edge composes over any tint. `--border-subtle` and `--border` resolve to the same value: at 14% on white there is no room for two tiers |
| `color.background.brand.bold` + `-hovered` / `-pressed` | `--accent` / `--accent-hover` / `--accent-active` | `#0C66E4`; `--accent-soft` kept, derived via `color-mix(in srgb, var(--accent-subtle) 45%, transparent)` |
| `color.background.accent.<hue>.{subtlest,subtler,bolder}` + `color.text.accent.<hue>` | every status, sentiment, citation, run-status and score-band family | the whole point of the ramp: `subtlest` fill + matching `text` ink is the AA-safe pairing, so ~110 domain tokens are composed rather than hand-picked |
| `color.background.danger.bold` + `-hovered` | `--danger-solid` / `--danger-solid-hover` | ADS states this pair for exactly this case and both already clear AA against white (5.2:1 / 6.7:1), so unlike the Figma port **no hand-deepening is needed** |
| `color.background.accent.<hue>.bolder` | `--chart-1..8`; `--series-1..5` alias `--chart-1..5` | one hue per slot: blue, green, orange, red, purple, teal, yellow, magenta. Keeps the "fold into Other" rule in `series-palette.ts` |
| `color.background.neutral.bold` | `--chart-tooltip-bg`, with NEW `--chart-tooltip-fg` | the tooltip foreground used to be a literal `text-white` — the one genuine token gap in the old system |
| `elevation.shadow.overlay` | `--shadow-4`, `--shadow-lg-value`, `--shadow-modal` | **the only live shadow rung.** `--shadow-1..3` and `--shadow-xs/sm/card/elevated` are `none` |
| `radius.{xsmall,small,medium,large,xlarge}` (2/4/8/12/16) | `--radius-xs/sm/md/lg/xl`; `--radius-2xl` = 16; `--radius-full` kept | **buttons are rounded-md (8px), not pills**; badges are `rounded-sm` (4px) |
| `space.025…1000` | existing `--space-1..20` 4px grid, **unchanged** | the two scales already agree; renaming would churn ~40 contract entries for no visual gain |
| Inter, Geist Mono | `--font-primary-family` = Inter stack; `--font-mono-family` = Geist Mono stack; `--font-display-family` → Inter | next/font in `app/layout.tsx`; the variable name `--font-sans` is kept |

## 4. Token values

**`ds-tokens.css`** declares ~150 ADS primitives under `:root` and `html[data-theme='dark']`,
values verbatim from `@atlaskit/tokens` (`css/atlassian-light.css`, `css/atlassian-dark.css`).
The package is deliberately **not** a dependency: it ships ~1600 variables we do not use, and
its theming runtime applies its own `data-color-mode` / `data-theme` attributes, which would
collide with the hand-rolled bootstrap in `lib/theme.ts`. Read the file for the values; the
nine-hue accent ramp is uniform by design (`subtlest`, `subtler`, `subtle`, `bolder`, `text`
× blue, green, red, orange, yellow, teal, purple, magenta, gray).

**`globals.css`** declares the semantic layer. No literal colour is authored there — every
value is a `var(--ds-*)`, which is why the dark theme needs no restatement. Read the file for
the mapping; §3 above is its summary and `check-design-tokens.mjs` is its contract.

Two domain decisions worth recording, because they changed meaning rather than value:

1. **Citation competitor moved orange → magenta.** Warning is now orange, and a competitor
   citation sitting in the same hue as a warning read as an error state.
2. **Score bands became a true four-step ramp** — red → orange → yellow → green. The old set
   spent two rungs on green (`good` `#10B981`, `high` `#22C55E`), which made 50–74% and
   75–100% nearly indistinguishable at badge size.

### 4a. Flat 2.0 — the five rules

Machine-enforced by `scripts/check-flat-elevation.mjs`, wired into `pnpm check:policy`.

1. **No shadow on anything in normal document flow.** Cards, panels, tables, sidebars, page
   headers, stat tiles, inputs, tabs, badges.
2. **Shadow only on true overlays** — modal, dropdown, popover, tooltip, toast, command
   palette — through the single `shadow-modal-value` rung. The guard holds an explicit
   allowlist of the files permitted to apply it; adding one is a design decision.
3. **Depth is a 3-step tint ladder, not light.** Sunken canvas → surface panel → raised hover.
4. **Every surface boundary is a 1px alpha hairline.** Alpha, not opaque, so it composes over
   any tint.
5. **No gradients on UI chrome, no glass/blur, no inner catchlight rings.** Gradients are
   display art only (`components/marketing/`), never a control or container.

The guard also asserts the token half of the policy: `--shadow-xs-value`, `--shadow-sm-value`,
`--shadow-card-value` and `--shadow-elevated-value` must literally resolve to `none`. A
component scan alone cannot see that — if those values come back, every card silently lifts
again.

**What this replaced.** The previous revision argued that light-mode panel `#FFFFFF` and base
`#F7F8FA` "differ by so little that the shadow is the only thing making surfaces read as
layered". That was true of *those* values. It is not true now: the canvas is
`surface-sunken` and the card is `surface`, so the tint step does the work the shadow was
faking. The dark theme's `0 0 0 1px` warm catchlight ring is gone with it — ADS dark separates
its four surface steps by fill alone, and the ring was compensating for a ladder that did not.

Consequences already applied: `Card` lost its `elevation` prop outright rather than keeping a
no-op API; the segmented control's active pill lost `shadow-xs` (white on a tinted track
already separates them); the tooltip moved from `bg-well` to `bg-elevated` (a portaled surface
cannot use an alpha fill); and `.logo-mark` lost its violet → orchid → ember gradient for a
flat `--accent` fill — a three-stop gradient on the one mark present on every screen was the
loudest possible exception to rule 5.

## 5. Dark theme

There is no separate dark value table, and that is the design. `globals.css` contains exactly:

```css
html[data-theme='dark'] {
  color-scheme: dark;
}
```

Every semantic token resolves through a `var(--ds-*)` indirection, and `ds-tokens.css` already
flips all ~150 primitives under the same selector. `--bg-panel` is `var(--ds-surface)` in both
themes and simply resolves to `#FFFFFF` or `#161A1D`. The old dark block restated 120
hand-authored values and could drift out of step with light; this one cannot. **If a token
appears to need a dark override here, that is a signal the primitive layer is missing one** —
add it to `ds-tokens.css` instead. The architecture guard's 900-line budget on `globals.css`
exists partly to keep restated dark values from creeping back.

## 6. Dark-theme spec (hard constraints, machine-enforced)

`globals.test.ts` enforces:

1. **Surface ladder ordering** — strict luminance ordering `--bg-base` `<` `--bg-panel` `≤`
   `--bg-elevated`, in both themes. This is the invariant flat design actually depends on: it
   is the only thing distinguishing the surfaces.
2. **AA ≥ 4.5:1 for every documented pair** — the same programmatic pair list as light (body,
   accent, and every status/sentiment/citation/run/score `*-text` on its `*-bg`), with
   translucent fills composited over `--bg-panel`.
3. **The accent stays in one blue family across both themes** (200–230°), guarded both ways so
   a later edit can neither drift it to violet nor off into cyan.
4. **Chart hue stability** — `--chart-1..8` change lightness between themes but not hue (ADS
   ramps are hue-stable to within a degree), so a series keeps its identity across a theme
   switch while staying legible on both canvases. The old palette held one value for both
   themes and paid for it in dark.
5. **Flat elevation** — the four in-flow shadow rungs resolve to `none`; only the overlay rung
   casts.
6. **Decorative-only tones are never body text** — `--text-subtle` (ADS `text.disabled`) is
   asserted present but excluded from ratio gating (dividers, the `—` placeholder).

**Two constraints from the dusk system are deliberately gone**, and are recorded as reversals
in `globals.test.ts` rather than silently deleted:

- **The "never near-black" luminance floor.** It was an aesthetic rule for the warm-charcoal
  deck (base `#262522` ≈ 0.0185). ADS dark genuinely is near-black (`surface-sunken #101214`
  ≈ 0.0054) and we follow it.
- **The soft-shadow-stack assertion.** There is no dark shadow stack left to be soft.

## 7. Type scale — Figma verbatim

Sans = **Inter** 400/500/600 (`--font-sans` → `--font-primary-family`); mono = **Geist Mono**
(`--font-mono` → `--font-mono-family`) with **tabular numerals**
(`font-variant-numeric: tabular-nums`) — mono is reserved for **metric values, percentages,
counts, positions, timestamps, code and keyboard hints** so columns align; it is never used
for labels. There is **no separate display face**: `--font-display-family` resolves to Inter,
so headings differ from body by size and tracking only.

| Token | Size | Line-height | Weight | Use |
|---|---|---|---|---|
| `--text-2xs` | 11px (0.6875rem) | 1.25 | 500 | micro uppercase labels, table headers |
| `--text-xs` | 12px (0.75rem) | 1.35 | 400 | captions, timestamps |
| `--text-sm` | 13px (0.8125rem) | 1.45 | 400 | secondary body, table cells |
| `--text-base` | 14px (0.875rem) | 1.5 | 400/500 | primary body |
| `--text-lg` | 15px (0.9375rem) | 1.35 | 600 | card titles |
| `--text-xl` | 17px (1.0625rem) | 1.3 | 600 | section titles |
| `--text-2xl` | 26px (1.625rem) | 1.2 | 600 | page titles |
| `--text-hero` | 48px (3rem) | 1.1 | 600 | NEW — hero metric numeral |
| `--text-data-lg` | 22px (1.375rem) | 1.25 | 600 | NEW — large mono data |

- The Figma mono scale (48 hero numeric / 22 large data / 13 data cell / 11 micro mono) rides
  on the same size tokens; `--text-data-lg` is the 22px large-data step.
- Weights: `--weight-normal: 400`, `--weight-medium: 500`, `--weight-semibold: 600`,
  `--weight-bold: 600` — the Figma scale tops out at semibold, so `bold` resolves to 600
  app-wide.
- Tracking tokens: `--tracking-tight: -0.02em`, `--tracking-normal: 0em`,
  `--tracking-wide: 0.025em`, `--tracking-wider: 0.06em`.

> **The app scale is deliberately not the marketing scale.** The marketing surface runs a
> 30–64px display ladder with off-axis 460/540 weights; this one runs 11–26px at 400/500/600
> and is tuned for data density. They are different products — a dashboard and a landing page
> — and importing the marketing steps into `(app)` routes would be a straight downgrade. The
> same holds for the two-radius binary the marketing reference favours: the app's
> 2/4/8/12/16 ladder is doing real work across tables, chips, cards and modals.
- Line-height tokens: `--leading-none: 1`, `--leading-tight: 1.2`, `--leading-snug: 1.35`,
  `--leading-normal: 1.5`.

## 8. Spacing (4px grid), radii, controls

**Spacing steps** (`--space-N` = 4px × N):
`--space-1: 4px`, `--space-2: 8px`, `--space-3: 12px`, `--space-4: 16px`, `--space-5: 20px`,
`--space-6: 24px`, `--space-7: 28px`, `--space-8: 32px`, `--space-10: 40px`,
`--space-12: 48px`, `--space-14: 56px`, `--space-16: 64px`, `--space-20: 80px`.
`--card-padding: 14px`; `--content-gutter: 20px`.

**Radii (the ADS `radius.*` scale):** `--radius-xs: 2px` (`radius.xsmall` — tags, the smallest
chips), `--radius-sm: 4px` (`radius.small` — badges, skeletons, the logo mark),
`--radius-md: 8px` (`radius.medium` — **buttons**, inputs), `--radius-lg: 12px`
(`radius.large` — cards, panels), `--radius-xl: 16px` (modals, large cards),
`--radius-2xl: 16px` (aliases xl), `--radius-full: 9999px` (**pill** — chips, toggles,
segmented control, avatar). The xs/sm rungs tightened from 4/6 with the ADS port.

**Controls:** `--control-height-sm: 30px`, `--control-height: 32px`,
`--control-height-lg: 38px`, `--interactive-border-width: 1px`. Table:
`--table-row-height: 42px`, `--table-header-height: 30px`,
`--table-font-size: var(--text-sm)`, `--table-header-font-size: var(--text-xs)`.

## 9. Tailwind v4 bridge (`@theme inline`)

Bridge the raw variables to semantic Tailwind utilities so components reference **only** the
bridged names (`bg-background`, `text-foreground`, `border-border`, `bg-accent`,
`text-accent-text`, `text-link`, `bg-citation-owned`, `text-run-completed`, `bg-score-high`,
`text-score-good-text`, `stroke-series-1`, `bg-chart-2`, `shadow-card`, `rounded-md`,
`font-mono`, `text-hero`, …). Shape:

```css
@theme inline {
  --font-sans: var(--font-primary-family);
  --font-mono: var(--font-mono-family);
  --font-display: var(--font-display-family); /* Inter — no display face */
  --color-background: var(--bg-base);
  --color-panel: var(--bg-panel);
  --color-foreground: var(--text-primary);
  --color-secondary: var(--text-secondary);
  --color-muted: var(--text-muted);
  --color-inverse: var(--text-inverse);
  --color-link: var(--text-link);
  --color-border: var(--border);
  --color-accent: var(--accent);
  --color-accent-active: var(--accent-active);
  --color-success: var(--success); /* + warning/danger/info + *-bg/*-border/*-text */
  --color-sentiment-positive: var(--sentiment-positive); /* + neutral/negative */
  --color-citation-owned: var(--citation-owned); /* + competitor/third-party + *-bg/*-border/*-text */
  --color-run-completed: var(--run-completed); /* + every run-status */
  --color-score-high: var(--score-high); /* + low/mid/good + *-bg/*-border/*-text/*-ring */
  --color-chart-1: var(--chart-1); /* + chart-2..8 + series-1..5/series-other aliases */
  --shadow-card: var(--shadow-card-value); /* + xs/sm/elevated — all `none` (flat 2.0, §4a) */
  --shadow-modal-value: var(--shadow-modal); /* the only live rung — overlays only */
  /* type sizes (incl. --text-hero/--text-data-lg), radii, tracking,
     line-heights bridged here too (§7–§8) */
}
```

**Implementation rules:** raw hex lives **only** in `ds-tokens.css` (and, for marketing,
`marketing-theme.css`) — `globals.css` now authors none at all; components use bridged tokens
only (no-raw-hex guard) and never a bare `--ds-*` name; **both themes are always fully
defined**; `data-theme` is set pre-hydration. `--shadow-1..4` stay raw-only (bridging them as
`--shadow-1: var(--shadow-1)` would be circular) — components consume the semantic aliases,
of which only `shadow-modal-value` is non-empty.

## 10. Component-primitive inventory

All CVA-driven, token-only, Radix where relevant, lucide icons. Ported to the Figma specs
(buttons/badges/elevation, score ring, sparkline) — see the component source in
`frontend/components/ui/`, which is now the authority.

| Primitive | Notes |
|---|---|
| `button` | **rounded-md (8px) — pill variants retired.** Primary = accent fill + `--accent-fg` (white) text + accent-tinted shadow, 13.5px/500; hover/active walk `--accent-hover`/`--accent-active`. Secondary = panel bg + `--border` hairline; ghost = transparent + accent-subtle hover; destructive = danger tokens. Sizes sm/md/lg/icon; `asChild`; icon slot. |
| `badge` | pill (`--radius-full`) 11.5px/500 with token bg/border/text. Variants map to tokens: `status` (success/warning/danger/info), `sentiment`, `classification` (**owned = Figma blue**, competitor, third-party), `run-status` (all 8), `score-band` (low/mid/good/high). |
| `card` | `bg-panel` + `--shadow-2` + `--radius-lg`; elevated = `bg-elevated` + `--shadow-3`; header/title/description/content slots + optional mono eyebrow panel label. |
| `table` (dense) | 30px sticky header (`--text-2xs` uppercase micro label, muted), 42px rows, 14px cells, mono tabular numerals for numeric columns, neutral-50 row hover, sortable carets; shared `table-pagination` footer (mono indicator + ghost Prev/Next, clamp-only reconciliation). |
| `score-ring` | Figma geometry: rounded linecap, 0.8s sweep transition, ring color from `--score-*-ring`, track from the theme; center numeral (`md` = `--text-lg`, `lg` = `--text-hero` hero numeral); ARIA label with %. **Band thresholds stay 25/50/75 — `score-band.ts` unchanged.** |
| `sparkline` | trend-colored 1.5px polyline + end dot (Sparkline.tsx). |
| `donut` | segmented ring for per-engine / citation share; hover-thicken + mono center value; legend; ARIA. |
| `tabs` / `segmented` | underline tabs (2px accent indicator, per VisibilityDashboard.tsx) + a pill segmented control (`--segmented-bg`, active = accent-fg on accent). |
| `input` / `field` | 14px text, `--border` hairline, `--radius-sm`, focus = accent border + `--focus-ring`; `field` wraps label + help + error. |
| `dialog` | Radix modal; `--overlay-scrim`, `bg-elevated`, `--shadow-4`, `--radius-xl`. |
| `command-palette` | ⌘K/Ctrl+K navigation over nav destinations + workspace projects, plus the sidebar command row that opens it. Radix dialog primitive directly (not `dialog` — a palette's header is its input); same scrim/surface tokens. Substring filter, clamped cursor, `role="listbox"` + `aria-activedescendant`. |
| `dropdown` | Radix menu; `bg-elevated`, `border`, `--shadow-3`. |
| `tooltip` | Radix; inverse chip (`--chart-tooltip-bg`), `--text-xs`. |
| `skeleton` | `--skeleton-base` → `--skeleton-highlight` shimmer (~1.2s). |
| `empty-state` | shared icon chip + heading + body + CTA slots. |
| `typography` | scale classes for every §7 token incl. `text-hero` / `text-data-lg`. |
| `series-palette` | values resolve from the `--chart-*` aliases; class strings (`stroke-series-N`) unchanged. |
| `history-drawer` | right-side Radix drawer for run history / execution list. |

## 11. Per-screen prose

The app shell is a fixed **220px left sidebar** + **52px topbar** + scrolling content region
(4px grid, `--content-gutter` padding). Auth and onboarding screens are exceptions (no
shell).

### 11.1 App shell (`(app)/layout.tsx`) — Figma shell geometry (AppShell.tsx), grouped nav kept

**Sidebar (220px, `bg-sidebar`)**: logo row (LogoCube + wordmark), project switcher
(brand avatar + name, dropdown), the **command row**, then the grouped nav — the existing
**Analyze / Improve** groups stay (the Figma flat nav is not adopted) with mono-uppercase
eyebrow group labels.
Nav rows are 36px, 13.5px, `--text-secondary`; the **active item** is `--accent-subtle` bg +
`--accent-text` + a **3px left accent bar** with the icon at full opacity; hover = bg-alt.
Bottom = user card (avatar + name/email). **Topbar (52px, `bg-panel`)**: left = the current
page's title (15px/600, the single h1) + header slot (filters/actions); right = export hook,
theme toggle, user affordances. Content scrolls independently. A first-run gate redirects
zero-project users to `/onboarding` (and waits for the projects query to settle before
redirecting — no flash).

**Command palette (⌘K / Ctrl+K).** `components/ui/command-palette.tsx` owns both the global
key binding and the sidebar command row that triggers it, so the two can never disagree. It
indexes every `NAV_GROUPS` destination plus every project in the workspace; choosing a
project calls `setActiveProjectId` (which re-scopes the API client's workspace header) rather
than navigating, and the active one is marked `Current`.

Built on the Radix dialog primitive directly, **not** `components/ui/dialog.tsx` — that
wrapper owns a title/description/close header, and a palette's header is its input. It reuses
the same scrim and surface tokens, so the two stay consistent. The accessible name comes from
an `sr-only` `Dialog.Title`, with `aria-describedby={undefined}` opting out of the description
Radix otherwise expects.

**Focus is handed back explicitly.** Radix returns focus to its own `Trigger`, but the ⌘K path
has no trigger — without the explicit hand-back, closing drops focus to `<body>` and the caller
loses their place in the page. The palette records `document.activeElement` when the shortcut
fires (and the sidebar button records itself), then restores it on close, guarding with
`isConnected` because switching project re-renders the shell and can unmount the original
element. Regression-tested in `command-palette.test.tsx`.

Filtering is a plain substring match over label + group. There is deliberately no fuzzy
matcher and no index: the corpus is ~12 nav items plus a handful of projects, where
subsequence matching mostly produces surprising ranking for no measurable gain. The cursor is
**clamped during render** rather than corrected in an effect, so a filter that shrinks the
list can never render a frame with nothing selected. `role="listbox"` +
`aria-activedescendant` keeps focus in the input while the selection moves.

**Layout.** Rows are grouped under Analyze / Improve / Switch project headings rather than
carrying a right-aligned group label, and each row leads with its canonical nav glyph (projects
render `ProjectSwitcher`'s initials avatar instead). Results keep ONE flat order for the
keyboard cursor and are re-sectioned from that list at render time — grouping first and
flattening for keys would let the highlighted row and the Enter target drift apart. A footer
states the keyboard controls, since this is a keyboard surface first.

The search input suppresses the global `:focus-visible` outline
(`focus-visible:outline-none!`). It is the only focusable element and is focused for as long
as the palette is open, so the ring would be a permanent blue rectangle carrying no
information. The `!` is required: that global rule is unlayered and would otherwise win over
a utility regardless of specificity.

### 11.2 Auth (`/login`, `/register`)

Split-screen `(auth)` layout restyled in the Figma language: brand panel (token-driven,
per the approved mockups) + form panel with an elevated form card (`--shadow-2`,
`--radius-lg`), larger type, three OAuth buttons above an email divider (coming-soon →
accessible 503 inline notice), inline `ApiError` danger alert, login/register toggle link,
theme toggle top-right. The pages own the single h1.

### 11.3 Onboarding (`/onboarding`) — Figma-styled, AI auto-discovery (OnboardingScreen.tsx)

First-run route group **without** the app shell (SessionGuard + ProjectProvider; the layout
redirects to `/visibility` when projects exist). **Full-screen split**: left panel = logo
header + sign-out, a top progress stepper, the step form, and a footer pager (Back/Continue
+ "Step N of M"); right panel = a **live preview** that summarizes the brand, then populates
discovered competitors/domains/prompts as they arrive, then mirrors the review selection.
Flow: **Brand** (name + website URL + derived-domain preview + explicit AI consent
checkbox) → **Discovery** (competitor + owned-domain + prompt suggestions fire in parallel;
animated staged progress; per-section status + retry) → **Review** (pre-filled **editable**
competitor rows, domain chips, prompt rows with theme/intent; market defaults US/en with
inline change) → **Confirm** (create project + prompt set + prompts, refetch the projects
query, then land on `/visibility`). When the agent is unconfigured (503) the flow degrades
to a manual-entry fallback with an inline notice — onboarding never requires the agent.

### 11.4 Visibility workspace (`/visibility`) — Figma dashboard (VisibilityDashboard.tsx)

One workspace: filter bar (run selector defaulting to the latest completed run, engine pill
filters) above the accessible four-tab underline tablist — **Overview** (default), Trends,
Mentions & Citations, Query Fanout; the active tab mirrors in `?tab=`. Overview leads with
the **hero metric card**: ScoreRing 140 + the run's Visibility Score as a 48px hero numeral
(`--text-hero`), supporting-metric delta chips (SOV, Mentions, Citations, Avg Rank — chips
render only where the API provides the series; Avg Position and Sentiment stay `—`), and
run info. Below: the competitors **rankings table** with per-row sparklines (where trends
exist), the **Share of Voice donut** (hover-thicken, mono center value), and the per-engine
by-model card. Empty state (no completed runs): shared `empty-state` linking to `/runs`.

### 11.5 Prompts (`/prompts`, `/prompt-research`)

**Your Prompts** — read-only, score-annotated: summary banner, search, dense table grouped
by topic with expandable group rows; Visibility Score as a score-band badge (derived from
persisted audit evidence), Avg Position and Sentiment `—`. **Prompt Research** — the
management workspace: topics rail (pill items + mono counts, accent-subtle active), toolbar
(filter, search, CSV bulk upload, Add prompt, consent-gated Generate), Active / Proposed /
Archived underline tabs with mono counts, dense table (Prompt, Theme badge, Intent, Branded
badge, Enabled toggle, row actions), shared pagination, CSV preview dialog, shared
empty-state.

### 11.6 Runs (`/runs`, `/runs/[runId]`, executions)

Pill status filter chips (mono counts) above the audits table (run-status badge, mono
counts, timestamp) + Launch dialog (prompt-set + engine chips + repetitions). Run detail:
progress panel (counts + badge + pulsing live dot while active + Cancel), export links,
executions table. Execution detail: evidence card — answer text, `search_used` badge,
citations with owned/competitor/third-party badges (owned = Figma blue), mention chips,
mono score dict; Sentiment `—`.

### 11.7 Measurement + action surfaces

**Site Health** (`/site-health`) — crawl/page detail: score presentation
(score-band tokens), issue grouping layout, page table. **Issues**, **Content**,
**Knowledge Base** (description/positioning/products/audience editor + consent-gated "Draft
with AI" review flow), **Products**, **Analytics**, **Traffic**, **Settings** (providers /
integrations) — the same Figma-language reskin: tokens + new primitives, hierarchy and
spacing per this document, shared empty-state; no contract or data-flow changes.
**Setup** (`/setup`) keeps its wizard flow restyled; `/setup/new` stays for additional
projects.
## Marketing creative system (the `.mkt` contract)

The public surface — every `(marketing)` route **and** the logged-out auth screens
(`/login`, `/register`) — runs **Searchify Proof**, a fully independent creative system.
"Marketing pages have no relation to the app" still holds; Proof simply replaces the retired
dark **Signal/Dusk** identity. Source of truth for the direction:
[`searchify-brand-deck.html`](searchify-brand-deck.html).

**Architecture.** Tokens live in `frontend/app/(marketing)/marketing-theme.css` as a Tailwind
v4 `@theme` block in the `mkt-` namespace, imported by `globals.css` (Tailwind builds
utilities from a single `@import 'tailwindcss'` graph — a second import would duplicate
preflight and the whole utility layer). Sections are built from **utilities plus the
primitives in `components/marketing/primitives/`**; the theme file additionally holds only
the scene rules a utility cannot express (the wallpaper, SVG stroke geometry, and the
`revert-layer` reset that lets utilities beat `globals.css`'s unlayered element base). Every
keyframe and scroll timeline lives in the sibling `marketing-motion.css`. Hex lives ONLY in
those two files; marketing components stay hex-free.

**A 400-line budget on `marketing-theme.css` is machine-enforced**
(`scripts/check-frontend-architecture.mjs`), with a companion 260-line budget on
`marketing-motion.css`. The previous marketing stylesheet reached **6,846 lines** of global
`.mkt` cascade because nothing stopped it growing. If a new section needs CSS in the theme
file, it needs a **primitive** instead — that is the rule the budget exists to force. When a
genuinely new *concern* arrives (as motion did), give it an owner; do not raise the ceiling.

**Palette.** Warm paper and exact ink carry the page; colour is rationed to states, provider
identity and evidence marks — never to headlines.

| Role | Value | Token |
|---|---|---|
| page canvas | `#F5F5F0` | `--color-mkt-paper` |
| raised / inset fields | `#FBFBF8` | `--color-mkt-paper-raised` |
| panels | `#FFFFFF` | `--color-mkt-surface` |
| primary ink | `#151715` (16.5:1) | `--color-mkt-ink` |
| body copy | `#454A46` (8.3:1) | `--color-mkt-ink-soft` |
| meta / captions | `#656B65` (5.0:1) | `--color-mkt-ink-muted` |
| hairline | `#D8D9D2` | `--color-mkt-line` |
| wallpaper base | `#CBDAF1` | `--color-mkt-sky` |
| scene ink on glass | `#425269` | `--color-mkt-slate` |
| display accent | `#275F9F` | `--color-mkt-accent-display` |

**Mark vs text — the rule that governs every state hue.** A hue that works as a *fill* is not
automatically legible as *text*. Each state therefore ships in two forms: the **mark**
(≥ 3:1, dots/bars/tiles only) and the **`-text` variant** (≥ 4.5:1, safe for copy). The
deck's own values all failed as text, which is why the split exists.

| State | Mark (≥ 3:1) | Text (≥ 4.5:1) |
|---|---|---|
| proof / active + linked | `#1668E8` | `#1257C4` (6.0:1) |
| evidence / verified | `#0A8F6A` | `#087354` (5.4:1) |
| signal / decline + refusal | `#E95D39` | `#B23A1A` (5.5:1) |
| review / needs attention | `#BE7D12` | `#8A5D0F` (5.3:1) |

Ratios are computed against `#F5F5F0` — the lightest surface the system paints text on, so
passing there passes on white too. Machine-enforced in `frontend/app/globals.test.ts`
("the Proof contract"), which also asserts the system is light-only and that every state hue
has a `-text` sibling. Amber's mark is darkened from the deck's `#C98616` (2.78:1), which sat
below the 3:1 floor even for a dot.

**Type.** Two faces, one voice: **Manrope** for display (loaded as `--font-manrope` in the
root layout, consumed only via `--font-mkt-display`), **Inter** for UI and data. There is no
mono face — the deck's `--mono: Inter` was a smell. "Meta" is a **style**, not a family:
uppercase, `0.09em` tracking, tabular numerals. Eight fixed steps
(`text-mkt-d1 … text-mkt-meta`); tracking tightens as size grows.

**Display ladder.** `d1`/`d2`/`d3` resolve to **36 → 64px**, **30 → 48px** and **24 → 28px**,
landing on a 36/48/64 ladder at the standard breakpoints. The earlier scale capped at 72px and
floored at **44px**, which wrapped an 18ch headline into four or five stubby lines on a phone,
and tracked roughly **2× tighter** than the size warranted (`-0.055em` ≈ −3.96px at 72px) — so
headlines read as oversized and cramped at once. `--text-mkt-d1--line-height: 0.96` is
unchanged: that compression is the signature.

**Off-axis weights.** Manrope is loaded as the **variable** face (no `weight` array), which
unlocks the stops the display scale uses: **540** for display (`.mkt-display-w`) and **460**
for marketing body (`.mkt-body-w`). These sit deliberately between Regular and Medium —
heavier than expected without ever reading as bold. They are *not* folded into
`.font-mkt-display`: that name is Tailwind's generated font-**family** utility, and
redefining it would both collide with the generated rule and lose to the `font-medium` that
call sites carry. Against a static fallback the browser rounds to the nearest cut, so the
page degrades to the previous look rather than breaking. **The variable payload is
unverified** — see the note in `app/layout.tsx`; if it proves materially heavier than the
four static cuts it replaced, revert both the font and the 460/540 stops together.

**Shape and rhythm.** Six radii (`6 / 10 / 14 / 20 / 28 / pill`) — the deck used fifteen.
Three elevation levels plus one atmospheric scene drop. One container (1240px) and one gutter
(`clamp(20px, 4vw, 56px)`). Vertical rhythm belongs to the `<Section>` primitive — sections
never set their own padding, which is what keeps every page breathing identically.

**Scenes.** One recurring wallpaper (`public/brand/wallpaper.svg` — sky/coral/mint) sits
behind every product moment, with white glass windows inset on it so the atmosphere shows on
all four sides. Glass alpha is pinned at 0.92+ so the slate ink inside keeps its measured
contrast. Illustrative figures live inside `aria-hidden` scenes and always carry a visible
"Example data" mark; page copy contains no invented numbers.

**Motion** is 5/10: one easing pair, 140–220ms interaction feedback plus longer explanatory
beats, transform and opacity only, scroll reveals that settle rather than bounce, and everything gated on
`prefers-reduced-motion` — where scenes hold their finished state rather than freezing
mid-animation.

Motion lives in its own owner, **`marketing-motion.css`** (budget 260 lines), split out of the
theme file when the scroll-reveal work pushed it past 400. Same principle as the theme budget:
keyframes and scroll timelines are a separate concern from tokens, so they get an owner rather
than a raised ceiling. The `--animate-mkt-*` bindings stay in the `@theme` block; their
keyframes live in the motion file.

**Scroll reveals are CSS-only**, driven by `animation-timeline: view()` inside an `@supports`
guard. This is a hard constraint, not a preference: an earlier JS implementation swapped the
server-rendered node for an opacity-zero motion node after hydration and **made every route
visibly flash**, which is why `Reveal` was previously reduced to a pass-through div. The
current design cannot regress that way — elements server-render in their **finished** state
and animate only where view timelines exist, so there is no hydration boundary to flash
across, and an unsupported browser or a disabled-JS client simply gets the static page.
Anything above the fold is already past its entry range at load, so the hero never animates.

`Reveal` marks a single block (`[data-mkt-reveal]`); `StaggerGroup` marks a container whose
direct children each key off their **own** scroll position, so the cascade tracks the scroll
instead of running ahead of it on a fixed delay. The generic selector excludes the stagger
container (`:not([data-mkt-reveal='stagger'])`) — animating both group and children fades
every item twice. **Never introduce motion here that content depends on to become visible.**

**Hero marquee.** Two counter-moving strips fill the bottom of the first screen: the provider
roster travelling right, buyer questions travelling left. Opposite directions are the point —
engines and questions are the two axes the product crosses, so one shared direction would read
as a single list. `Marquee` renders the item list N times (`copies`, default 4) and the CSS
translates by the width of exactly **one** copy, so copy 2 lands where copy 1 began and the
loop is seamless. Translating a fixed `-50%` would tear as soon as the copy count changed;
`--mkt-marquee-copy` is `1/N`, so the distance follows the content. `copies` must be high
enough that one copy overflows the viewport — a short list that fits on screen visibly empties
before looping, which is the usual cause of a marquee that stutters at the seam. Every copy
after the first is `aria-hidden`, so the list is announced once. Motion pauses on hover, and
under reduced motion the track stops at its start and becomes a plain horizontal scroll region.

Both strips sit **directly on the paper** — no cards, borders or fills. Provider marks are the
official brand geometry from `engine-logo.tsx` in each provider's own colour, and the questions
are quoted and italic so they read as things buyers ask rather than as claims we are making.


## 13. Motion + accessibility (app)

- **Motion**: `--transition-fast: 100ms`, `--transition-base: 180ms`,
  `--transition-slow: 280ms`, all `cubic-bezier(0.4, 0, 0.2, 1)`. Respect
  `prefers-reduced-motion` (non-essential transitions/shimmer disabled). Skeleton shimmer
  ~1.2s loop.
- **Accessibility**: every documented text/surface pair meets **AA ≥ 4.5:1** in both themes
  (programmatic suite; muted/subtle tokens are decorative-only and never body text). Focus
  is always visible: the ADS **2px `--border-focus` outline** (`:focus-visible`) plus the
  tokenized `--focus-ring` shadow on `.focus-ring` components — `border-focused` is a lighter
  blue than `--accent` on purpose, so the ring stays visible against an accent-filled button.
  `score-ring`, `donut`, and
  charts carry ARIA labels with the numeric value. `forced-colors` mode falls back to system
  colors; badges keep a text label (never color-only meaning). Print rules drop backgrounds.
  Interactive targets ≥ 30px height.

## 14. Implementation checklist

1. Author `app/ds-tokens.css` — the ADS primitives, `:root` + `html[data-theme='dark']`,
   values verbatim from `@atlaskit/tokens`. Only the tokens actually consumed.
2. Author the semantic layer in `globals.css` on top of it (§3–§4). Every value is a
   `var(--ds-*)`; the dark block is `color-scheme: dark` and nothing else (§5).
3. Add the `@theme inline` bridge (§9) — components use bridged tokens only.
4. **No raw hex outside `ds-tokens.css`** (app) and `app/(marketing)/marketing-theme.css`
   (marketing + auth). `globals.css` authors none.
5. **Keep elevation flat (§4a)** — the four in-flow shadow rungs resolve to `none`; only
   overlays carry `shadow-modal-value`, from an explicit allowlist.
6. **Both themes always defined**; `data-theme` set pre-hydration; **light is the default**
   (stored choice → light; the OS preference is not consulted).
7. Mono font gets `font-variant-numeric: tabular-nums`; all metrics use mono.
8. Ship `prefers-reduced-motion`, `forced-colors`, `print`, and theme-swap suppression rules.
9. Load **Inter** (weights 400/500/600) + **Geist Mono** via next/font in `app/layout.tsx`
   (`--font-sans`, `--font-mono`). `--font-display-family` resolves to Inter → bridged
   `font-display` utility; **the app has no separate display face** — Manrope is loaded in
   the same file as `--font-manrope` but is consumed ONLY by the public Proof surface. Never
   name a next/font variable `--font-display`: that name is the bridged `@theme` token.
10. **Marketing is still a separate system, for now.** Folding `--mkt-*` onto the ADS layer is
    Phase 2 of the ADS adoption; until then marketing and the logged-out auth screens stay
    light-only, and `check-flat-elevation.mjs` carries a documented, self-expiring exemption
    for the `--shadow-mkt-*` family.
11. Keep all four guards green: `app/globals.test.ts` (palette + name-set sync + WCAG suite +
    §6 dark assertions + the Proof contract), `scripts/check-design-tokens.mjs` (required vars
    across `ds-tokens.css`, `globals.css` and `marketing-theme.css`),
    `scripts/check-flat-elevation.mjs` (§4a), and
    `scripts/check-frontend-architecture.mjs` (line budgets, including the 400-line ceiling on
    `marketing-theme.css` and 900 on `globals.css`).
