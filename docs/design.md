# Design System — Searchify

> The **written form** of the Searchify design system, and its authority: the Figma reference
> files this was ported from have been removed now that the port is complete. The product app
> runs on **`frontend/app/globals.css`** — the royal-blue light theme **verbatim** from Figma,
> plus the **authored warm-charcoal dark theme** (neither the Figma
> midnight dark nor the earlier slate-charcoal is used). The public surface — marketing routes
> **and** the logged-out auth screens — runs its own creative system, **Searchify Proof**, in
> `frontend/app/(marketing)/marketing-theme.css`. Proof is light-only and independent; it
> replaced the retired dark "Signal/Dusk" marketing identity, and the app's dark theme now
> owns its warm charcoals outright rather than sharing them.
> Machine guards keep this document, the token files, and WCAG AA in sync
> (`frontend/app/globals.test.ts`, `frontend/scripts/check-design-tokens.mjs`).
> Companion docs: [`../Agents.md`](../Agents.md), [`invariants.md`](invariants.md),
> [`backend-architecture.md`](backend-architecture.md), [`frontend-architecture.md`](frontend-architecture.md).

## 1. Overview

- **`frontend/app/globals.css` is the single source of truth** for app tokens. Components
  consume **bridged Tailwind semantic tokens only** — never raw hex (no-raw-hex guard). Raw
  hex lives only in the `:root` and `html[data-theme='dark']` blocks of `globals.css`
  (app) and in `app/(marketing)/marketing-theme.css` (marketing + auth).
- **Aesthetic**: dense, confident **B2B analytics** in the Figma visual language — a
  `#F7F8FA` cool-gray page, white panels **elevated by the `--shadow-1..4` stack** (no longer
  a flat/hairline-only language), one **royal-blue accent `#2756FF`** reserved for data,
  links, active states and focus rings, vivid semantic colors, **Inter** for UI text and
  **Geist Mono** tabular numerals for every metric, 4px grid, WCAG 2.1 AA.
- **Light is the default theme.** The dark theme is a full sibling: an **authored warm-charcoal**
  system — never near-black, with clearly lighter elevated surfaces and
  a violet accent (see §6). Every documented text/surface pair in **both** themes meets
  **AA ≥ 4.5:1**, computed programmatically in `globals.test.ts`.

## 2. Theme model

Two explicit surface hierarchies. `:root` = light (default),
`html[data-theme='dark']` = dark. A pre-hydration script sets `data-theme` before first
paint. **Light is the default**: the bootstrap resolves `stored choice → light`; the OS
preference is intentionally not consulted — only an explicit stored `dark` choice (from any
ThemeToggle) opts into dark.

**Light surface hierarchy (Figma):** `bg-base #F7F8FA` → panels/elevated `#FFFFFF`
(differentiated by shadow, not fill) → sunken wells `#EFF1F6`. Sidebar = panel `#FFFFFF`.

**Dark surface hierarchy (authored warm charcoal):** `bg-base #262522` →
`bg-panel #2C2B28` → `bg-elevated #353430` (strictly ascending luminance), sunken
`bg-well #1F1E1B`. Sidebar = panel `#2C2B28`. These values were originally shared with the
marketing surface; marketing has since moved to the light-only Proof system, so **the app
owns them outright** — `globals.test.ts` pins them so that migration cannot drag the app
along with it.

The accent is **hue-split by theme, on purpose**: royal blue `#2756FF` in light (the Figma
anchor) and violet `#6D5DE8` / `#7B6CF6` in dark. In both themes the accent is reserved for links, active
states, focus rings, and data visualization. Owned citations track the accent — Figma blue in
light, violet in dark (the former green identity is dropped — confirmed product decision).

## 3. Figma → Searchify token mapping

Rule: **same name, new Figma value** wherever a semantic equivalent exists; **new token**
only for new concepts; where our set is finer-grained than Figma's, alias to the nearest
Figma value and document it. The Figma source files were reference material for the port and
have been removed now that it is complete — this document is the authority for the resulting
token set, and `frontend/app/globals.css` for its values.

| Figma token | Searchify token(s) | Notes |
|---|---|---|
| `--blue-50..900`, `--neutral-0..900` | NEW primitive ramps, same names | globals.css-only layer; semantic tokens reference these; not theme-overridden |
| `--surface-page` | `--bg-base` | light `#F7F8FA` verbatim; dark authored (§6) |
| `--surface-panel` | `--bg-panel`, `--bg-sidebar` | light `#FFFFFF` verbatim (Figma sidebar = panel bg); dark authored |
| `--surface-elevated` | `--bg-elevated` | light `#FFFFFF` verbatim; dark authored — clearly lighter than base |
| `--surface-sunken` | `--bg-well` | light `#EFF1F6` verbatim; dark authored (may dip below base) |
| `--neutral-100` | `--bg-alt` | light verbatim; dark authored (between base and panel, same family) |
| `--text-primary` / `--text-secondary` | same names | light `#0D1228` / `#454E6E` verbatim; dark authored (AA-gated) |
| `--text-tertiary` | `--text-muted` | captions/decorative only — excluded from body-contrast pairs |
| `--text-disabled` | `--text-subtle` | decorative only |
| `--text-inverse` | NEW `--text-inverse` | `#FFFFFF` light; `#16181E` dark |
| `--text-link` | `--text-link`, alias of `--accent-text` | **no `--text-accent` token exists** |
| `--border-subtle` / `--border-default` / `--border-strong` | `--border-subtle` / `--border` / `--border-strong` | light Figma values verbatim; dark authored |
| `--accent` family | same names + NEW `--accent-active`; `--accent-foreground` → `--accent-fg` | light anchored `#2756FF` verbatim; dark accent brightened within the royal-blue family for AA; `--accent-soft` kept, derived from `--accent-subtle` via `color-mix(in srgb, var(--accent-subtle) 45%, transparent)` |
| status `--success/-warning/-danger/-info/-neutral-status` bg/border/text | same semantic names | light verbatim; dark authored (Figma's alpha-wash approach re-based on the authored surfaces); solid `--success` etc. take Figma mid hues (`#10B981` / `#F59E0B` / `#EF4444` / `#2756FF`); `--neutral-bg` ← neutral-status-bg |
| `--score-{low,mid,good,high}-bg/-border/-text/-ring` | `--score-*` (solid = ring), `--score-*-bg`, NEW `--score-*-text`, `--score-*-ring`, `--score-*-border` | **band thresholds stay 25/50/75 — `score-band.ts` unchanged**; Figma band colors map onto the existing bands |
| `--run-{state}-bg/-text` | `--run-{state}-bg`, `--run-{state}` (solid = Figma text) | all 8 states; light verbatim (one AA adjustment, §4); dark authored |
| `--citation-owned/-competitor/-third-*` | `--citation-owned/-competitor/-third-party-*` + NEW `*-border` | **owned becomes Figma blue** — the green identity is dropped (confirmed decision) |
| `--chart-1..8` | NEW `--chart-1..8`; `--series-1..5` alias to `--chart-1..5`, `--series-other` ← `--neutral-200` | keeps the "fold into Other" rule in `series-palette.ts`; chart hues identical in both themes |
| `--shadow-1..4` | NEW `--shadow-1..4`; existing `--shadow-xs/sm/card/elevated/lg/modal` alias (xs,sm→1; card→2; elevated→3; lg,modal→4) | component names unchanged; dark shadows authored soft for the lighter surfaces |
| `--r-xs..xl` (4/6/8/12/16) | `--radius-xs/sm/md/lg/xl` = 4/6/8/12/16; `--radius-2xl` = 16; `--radius-full` kept | **buttons are rounded-md (8px), not pills** (DesignSystemSheet.tsx Btn) |
| Inter, Geist Mono | `--font-primary-family` = Inter stack; `--font-mono-family` = Geist Mono stack; `--font-display-family` → Inter | next/font in `app/layout.tsx`: Inter replaces Geist; the variable name `--font-sans` is kept |

## 4. Token values — LIGHT (`:root`)

Figma values **verbatim**. The primitive ramps are a globals.css-only layer; semantic tokens
reference them. **Two deliberate AA adjustments**, each moving one swatch within its own
family rather than restating the palette:

1. **`--run-cancelled`** — Figma's text `#98A2BE` measures 2.4:1 on its `#F7F8FA` bg, so it
   moves one ramp step (neutral-400 → neutral-500 `#667092`) to clear AA 4.5:1.
2. **`--danger-solid`** (destructive button fill) — white on Figma's `--danger` `#EF4444`
   reaches only 3.76:1, so the FILL steps one deeper down the red ramp (red-500 → red-600
   `#DC2626`, 4.83:1) instead of the label going dark. `--danger` itself is unchanged — it is
   also the sentiment-negative solid and the score-low ring, neither of which should darken.

```css
:root {
  color-scheme: light;

  /* Primitive ramps (Figma verbatim — not theme-overridden) */
  --blue-50: #ebf0ff;
  --blue-100: #d5e2ff;
  --blue-200: #acc4ff;
  --blue-300: #7a9fff;
  --blue-400: #4972ff;
  --blue-500: #2756ff; /* accent anchor */
  --blue-600: #1a44eb;
  --blue-700: #1235cc;
  --blue-800: #0d28a0;
  --blue-900: #091e78;
  --neutral-0: #ffffff;
  --neutral-50: #f7f8fa;
  --neutral-100: #eff1f6;
  --neutral-200: #e2e5ee;
  --neutral-300: #c8cede;
  --neutral-400: #98a2be;
  --neutral-500: #667092;
  --neutral-600: #454e6e;
  --neutral-700: #2c3454;
  --neutral-800: #1a2040;
  --neutral-900: #0d1228;

  /* Fonts — Inter (sans) + Geist Mono; no separate display face */
  --font-primary-family: var(--font-sans), system-ui, sans-serif;
  --font-mono-family: var(--font-mono), ui-monospace, "Cascadia Code", "Fira Code", monospace;
  --font-display-family: var(--font-sans), system-ui, sans-serif;

  /* Surfaces */
  --bg-base: var(--neutral-50); /* #F7F8FA */
  --bg-alt: var(--neutral-100); /* #EFF1F6 */
  --bg-panel: var(--neutral-0); /* #FFFFFF */
  --bg-elevated: var(--neutral-0); /* #FFFFFF + shadow-3 */
  --bg-well: var(--neutral-100); /* sunken */
  --bg-sidebar: var(--neutral-0); /* Figma sidebar = panel bg */
  --surface-overlay: rgba(247, 248, 250, 0.88);

  /* Borders */
  --border-subtle: var(--neutral-100);
  --border: var(--neutral-200);
  --border-strong: var(--neutral-300);
  --border-focus: var(--accent);

  /* Text */
  --text-primary: var(--neutral-900); /* 17.4:1 on bg-base */
  --text-secondary: var(--neutral-600); /* 7.7:1 on bg-base */
  --text-muted: var(--neutral-400); /* captions/decorative only — not body-gated */
  --text-subtle: var(--neutral-300); /* decorative only */
  --text-inverse: var(--neutral-0);
  --text-link: var(--accent-text); /* alias — no --text-accent token */

  /* Accent — royal blue */
  --accent: var(--blue-500);
  --accent-hover: var(--blue-600);
  --accent-active: var(--blue-700);
  --accent-fg: #ffffff; /* Figma accent-foreground — 5.4:1 on accent */
  --accent-subtle: var(--blue-50);
  --accent-soft: color-mix(in srgb, var(--accent-subtle) 45%, transparent);
  --accent-border: var(--blue-200);
  --accent-text: var(--blue-600); /* 6.8:1 on bg-panel */

  /* Status — solids take Figma mid hues */
  --success: #10b981; --success-bg: #f0fdf4; --success-border: #bbf7d0; --success-text: #15803d;
  --warning: #f59e0b; --warning-bg: #fffbeb; --warning-border: #fde68a; --warning-text: #92400e;
  --danger: #ef4444; --danger-bg: #fff1f1; --danger-border: #fecaca; --danger-text: #b91c1c;
  /* Destructive BUTTON FILL — the red ramp one step deeper than --danger, so the
     label can be white (#EF4444 only reaches 3.76:1 against white) without
     darkening --danger, which is also sentiment-negative and the score-low ring. */
  --danger-solid: #dc2626; --danger-solid-hover: #b91c1c; --danger-fg: #ffffff;
  --info: #2756ff; --info-bg: #ebf0ff; --info-border: #adc4ff; --info-text: #1a44eb;
  --neutral-bg: #f7f8fa;

  /* Sentiment (positive / neutral / negative) */
  --sentiment-positive: var(--success);
  --sentiment-positive-bg: var(--success-bg);
  --sentiment-positive-text: var(--success-text);
  --sentiment-neutral: #667092;
  --sentiment-neutral-bg: #f7f8fa;
  --sentiment-neutral-text: #454e6e;
  --sentiment-negative: var(--danger);
  --sentiment-negative-bg: var(--danger-bg);
  --sentiment-negative-text: var(--danger-text);
  /* Sentiment is not computed yet — render the neutral "—" placeholder. */
  --value-placeholder: var(--text-subtle);

  /* Citations — owned is Figma blue (green identity dropped) */
  --citation-owned: #2756ff;
  --citation-owned-bg: #ebf0ff;
  --citation-owned-border: #adc4ff;
  --citation-owned-text: #1235cc;
  --citation-competitor: #f97316;
  --citation-competitor-bg: #fff7ed;
  --citation-competitor-border: #fed7aa;
  --citation-competitor-text: #9a3412;
  --citation-third-party: #8b5cf6;
  --citation-third-party-bg: #f5f3ff;
  --citation-third-party-border: #ddd6fe;
  --citation-third-party-text: #5b21b6;

  /* Run status — solid = Figma text hue */
  --run-draft: #667092; --run-draft-bg: #f7f8fa;
  --run-queued: #454e6e; --run-queued-bg: #f7f8fa;
  --run-running: #1a44eb; --run-running-bg: #ebf0ff;
  --run-analyzing: #5b21b6; --run-analyzing-bg: #f5f3ff;
  --run-completed: #15803d; --run-completed-bg: #f0fdf4;
  --run-partial: #92400e; --run-partial-bg: #fffbeb;
  --run-failed: #b91c1c; --run-failed-bg: #fff1f1;
  /* AA adjustment: Figma cancelled text #98A2BE → neutral-500 (same family). */
  --run-cancelled: #667092; --run-cancelled-bg: #f7f8fa;

  /* Score bands — thresholds stay 25/50/75; solid = ring hue */
  --score-low: #ef4444; --score-low-bg: #fff1f1; --score-low-border: #fecaca;
  --score-low-text: #b91c1c; --score-low-ring: #ef4444; /* 0–24% */
  --score-mid: #f59e0b; --score-mid-bg: #fffbeb; --score-mid-border: #fde68a;
  --score-mid-text: #92400e; --score-mid-ring: #f59e0b; /* 25–49% */
  --score-good: #10b981; --score-good-bg: #ecfdf5; --score-good-border: #a7f3d0;
  --score-good-text: #065f46; --score-good-ring: #10b981; /* 50–74% */
  --score-high: #22c55e; --score-high-bg: #f0fdf4; --score-high-border: #bbf7d0;
  --score-high-text: #14532d; --score-high-ring: #22c55e; /* 75–100% */

  /* Chart palette (Figma verbatim, identical in both themes) + series aliases */
  --chart-1: #2756ff; --chart-2: #10b981; --chart-3: #f59e0b; --chart-4: #ef4444;
  --chart-5: #8b5cf6; --chart-6: #06b6d4; --chart-7: #f97316; --chart-8: #ec4899;
  --series-1: var(--chart-1); /* brand — the user's own series */
  --series-2: var(--chart-2);
  --series-3: var(--chart-3);
  --series-4: var(--chart-4);
  --series-5: var(--chart-5);
  --series-other: var(--neutral-200); /* "Other" bucket — deliberately achromatic */
  --chart-tooltip-bg: var(--neutral-800); /* inverse chip, both themes */

  /* Elevation — Figma --shadow-1..4, ring dropped (see note below); semantic
     aliases keep the existing component names (xs,sm→1; card→2; elevated→3;
     lg,modal→4) */
  --shadow-1: 0 1px 2px rgba(13, 18, 40, 0.05);
  --shadow-2: 0 2px 6px rgba(13, 18, 40, 0.07);
  --shadow-3: 0 6px 20px rgba(13, 18, 40, 0.1), 0 1px 4px rgba(13, 18, 40, 0.05);
  --shadow-4: 0 16px 40px rgba(13, 18, 40, 0.14), 0 4px 10px rgba(13, 18, 40, 0.07);
  --shadow-xs-value: var(--shadow-1);
  --shadow-sm-value: var(--shadow-1);
  --shadow-card-value: var(--shadow-2);
  --shadow-elevated-value: var(--shadow-3);
  --shadow-lg-value: var(--shadow-4);
  --shadow-modal: var(--shadow-4);
  --focus-ring: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent);
  --overlay-scrim: rgba(0, 0, 0, 0.32);

  /* Skeleton */
  --skeleton-base: var(--neutral-100);
  --skeleton-highlight: var(--neutral-50);
}
```

### Elevation: one edge, not two

The Figma originals each ended in a `0 0 0 1px` ring. Every surface that takes one of these
also draws a real `border-border` hairline (`components/ui/card.tsx`), so the ring
**double-drew the edge** — two lines a fraction of a pixel apart, which is what made dense
screens read as slightly soft. The rings are dropped in light mode.

The **drop shadows stay**. Light-mode panel (`#FFFFFF`) and base (`#F7F8FA`) differ by so
little that the shadow is the only thing making surfaces read as layered rather than merely
drawn; removing it flattens the app. Depth = borders + one honest shadow.

**The dark theme deliberately keeps its ring**, and that asymmetry is not an oversight: there
the ring is a warm *light* hairline (`rgba(255, 250, 240, 0.03–0.06)`) acting as a catchlight
that separates a raised surface from the charcoal beneath it. Light mode's ring duplicated an
existing border; dark mode's has no equivalent and is doing real work. Do not "align" them.

## 5. Token values — DARK (`html[data-theme='dark']`)

**Authored warm charcoal — owned by the app.** These values were originally shared with the
marketing site's dark "Dusk" identity. **That identity is retired**: marketing and the
logged-out auth screens now run the independent, light-only **Searchify Proof** system
(`app/(marketing)/marketing-theme.css`, see §"Marketing creative system"), and the app keeps
this ramp outright. There is no longer a no-divergence requirement between the two, and dark
marketing tokens must not be reintroduced. This replaces both the Figma midnight dark and the
earlier cool slate-charcoal; neither is ported. `globals.test.ts` pins the values below.

The light theme stays Figma royal blue, so **the accent hue deliberately differs between
themes** — violet in dark, blue in light. That is the consequence of sharing marketing's dark
identity, not an oversight, and `globals.test.ts` guards the violet band so a later edit
cannot quietly drift it back to blue.

Only tokens that change are overridden; ramps, chart palette, type, spacing, radii, and
structural tokens are shared from `:root`. **Two documented AA adjustments against the deck**,
both following the same rule as light (§4): deepen only the swatch that has to carry white
text, leave the hue and every wash/border alone.

1. **Solid accent** `#7B6CF6` → `#6D5DE8` (white `accent-fg` 3.95 → 4.79:1). The deck violet
   survives verbatim as `--accent-hover` and inside every wash and border.
2. **`--danger-solid`** (destructive button fill) — the deck coral `#FF8F85` is only 2.21:1
   against white, so the fill deepens to `#B8463C` (5.28:1) while `--danger` keeps the coral
   for washes, sentiment-negative, and the score-low ring.

The deck's dim tones (`#7F7B70` 3.6:1) stay decorative-only, exactly as the marketing contract
already documents them.

```css
html[data-theme="dark"] {
  color-scheme: dark;

  /* Surfaces — warm charcoal (deck --bg-0/--bg/--bg-2/--bg-3) */
  --bg-base: #262522;
  --bg-alt: #2a2926; /* between base and panel (hover/inset) — same family */
  --bg-panel: #2c2b28;
  --bg-elevated: #353430;
  --bg-well: #1f1e1b; /* sunken — may go slightly darker than base */
  --bg-sidebar: #2c2b28; /* sidebar = panel bg */
  --surface-overlay: rgba(38, 37, 34, 0.92);

  /* Borders — solid warm hairlines (deck --line/--line-2/--line-3) */
  --border-subtle: #3b3a35;
  --border: #46453e;
  --border-strong: #5b584d;

  /* Text — body pairs verified ≥ 4.5:1 (globals.test.ts) */
  --text-primary: #f4f2eb; /* deck --ink — 13.7:1 on bg-base */
  --text-secondary: #b4b0a4; /* deck --ink-2 — 7.1:1 on bg-base, 6.5:1 on panel */
  --text-muted: #7f7b70; /* deck --ink-3 — captions/decorative only (not body-gated) */
  --text-subtle: #5b584d; /* decorative only */
  --text-inverse: #1f1e1b;
  --text-link: var(--accent-text); /* alias of --accent-text */

  /* Accent — the deck's violet. Its --acc #7B6CF6 measures only 3.95:1
     against white, so the SOLID is deepened one step within the same
     family (#7B6CF6 → #6D5DE8, 4.79:1) to clear AA; the deck violet
     survives verbatim as the hover step and inside every wash/border. */
  --accent: #6d5de8; /* white accent-fg on accent: 4.79:1 */
  --accent-hover: #7b6cf6; /* deck --acc */
  --accent-active: #8f81ff; /* deck --acc-hover */
  --accent-fg: #ffffff;
  --accent-subtle: rgba(123, 108, 246, 0.14); /* deck --acc-soft */
  --accent-border: rgba(123, 108, 246, 0.34); /* deck --acc-line */
  --accent-text: #9c92ff; /* deck --acc-text — 5.4:1 on bg-panel */

  /* Semantic status — deck hues (--ok/--warn/--bad) as translucent fills
     re-based on the dusk surfaces. */
  --success: #46d69c;
  --success-bg: rgba(70, 214, 156, 0.13);
  --success-border: rgba(70, 214, 156, 0.3);
  --success-text: #46d69c;
  --warning: #f2c14e;
  --warning-bg: rgba(242, 193, 78, 0.13);
  --warning-border: rgba(242, 193, 78, 0.28);
  --warning-text: #f2c14e;
  --danger: #ff8f85;
  /* Destructive button fill — the deck coral deepened until white clears AA. */
  --danger-solid: #b8463c;
  --danger-solid-hover: #a33c33;
  --danger-fg: #ffffff;
  --danger-bg: rgba(255, 143, 133, 0.13);
  --danger-border: rgba(255, 143, 133, 0.28);
  --danger-text: #ff8f85;
  --info: #9c92ff;
  --info-bg: rgba(123, 108, 246, 0.14);
  --info-border: rgba(123, 108, 246, 0.3);
  --info-text: #a79eff;
  --neutral-bg: rgba(255, 250, 240, 0.05); /* deck --glass-bg */

  /* Sentiment */
  --sentiment-positive: var(--success);
  --sentiment-positive-bg: var(--success-bg);
  --sentiment-positive-text: var(--success-text);
  --sentiment-neutral: #b4b0a4;
  --sentiment-neutral-bg: rgba(255, 250, 240, 0.05);
  --sentiment-neutral-text: #b4b0a4;
  --sentiment-negative: var(--danger);
  --sentiment-negative-bg: var(--danger-bg);
  --sentiment-negative-text: var(--danger-text);
  --value-placeholder: var(--text-subtle);

  /* Citation classification — owned follows the accent into violet;
     competitor/third-party are the deck's --comp/--third. */
  --citation-owned: #a79eff;
  --citation-owned-bg: rgba(123, 108, 246, 0.16);
  --citation-owned-border: rgba(123, 108, 246, 0.3);
  --citation-owned-text: #a79eff;
  --citation-competitor: #fca87a;
  --citation-competitor-bg: rgba(249, 115, 22, 0.12);
  --citation-competitor-border: rgba(249, 115, 22, 0.28);
  --citation-competitor-text: #fca87a;
  --citation-third-party: #c9b8fd;
  --citation-third-party-bg: rgba(139, 92, 246, 0.12);
  --citation-third-party-border: rgba(139, 92, 246, 0.26);
  --citation-third-party-text: #c9b8fd;

  /* Run status */
  --run-draft: #b4b0a4;
  --run-draft-bg: rgba(255, 250, 240, 0.05);
  --run-queued: #b4b0a4;
  --run-queued-bg: rgba(255, 250, 240, 0.05);
  --run-running: #a79eff;
  --run-running-bg: rgba(123, 108, 246, 0.16);
  --run-analyzing: #c9b8fd;
  --run-analyzing-bg: rgba(139, 92, 246, 0.13);
  --run-completed: #46d69c;
  --run-completed-bg: rgba(70, 214, 156, 0.13);
  --run-partial: #f2c14e;
  --run-partial-bg: rgba(242, 193, 78, 0.13);
  --run-failed: #ff8f85;
  --run-failed-bg: rgba(255, 143, 133, 0.13);
  --run-cancelled: #b4b0a4;
  --run-cancelled-bg: rgba(255, 250, 240, 0.05);

  /* Score bands — the deck's warm status hues; thresholds stay 25/50/75 */
  --score-low: #ff8f85;
  --score-low-bg: rgba(255, 143, 133, 0.13);
  --score-low-border: rgba(255, 143, 133, 0.28);
  --score-low-text: #ff8f85;
  --score-low-ring: #ff8f85;
  --score-mid: #f2c14e;
  --score-mid-bg: rgba(242, 193, 78, 0.13);
  --score-mid-border: rgba(242, 193, 78, 0.28);
  --score-mid-text: #f2c14e;
  --score-mid-ring: #f2c14e;
  --score-good: #46d69c;
  --score-good-bg: rgba(70, 214, 156, 0.13);
  --score-good-border: rgba(70, 214, 156, 0.3);
  --score-good-text: #46d69c;
  --score-good-ring: #46d69c;
  --score-high: #7be8be;
  --score-high-bg: rgba(123, 232, 190, 0.13);
  --score-high-border: rgba(123, 232, 190, 0.3);
  --score-high-text: #7be8be;
  --score-high-ring: #7be8be;

  /* Chart palette — --chart-1..8 and --series-1..5 are intentionally NOT
     overridden: a series keeps its hue across themes so identity survives
     a theme switch. Only the achromatic "Other" bucket adapts, warmed to
     sit on the dusk surfaces. */
  --series-other: #5b584d;

  /* Shadows — soft stack for the warm surfaces (low opacity, larger blur;
     no crushed near-black). */
  --shadow-1:
    0 1px 2px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 250, 240, 0.03);
  --shadow-2:
    0 2px 8px rgba(0, 0, 0, 0.34), 0 0 0 1px rgba(255, 250, 240, 0.04);
  --shadow-3:
    0 8px 24px rgba(0, 0, 0, 0.42), 0 0 0 1px rgba(255, 250, 240, 0.05);
  --shadow-4:
    0 16px 48px rgba(0, 0, 0, 0.52), 0 0 0 1px rgba(255, 250, 240, 0.06);
  --focus-ring: 0 0 0 3px color-mix(in srgb, var(--accent) 35%, transparent);
  --overlay-scrim: rgba(0, 0, 0, 0.55);

  /* Skeleton */
  --skeleton-base: #2c2b28;
  --skeleton-highlight: #353430;

  /* Segmented control */
  --segmented-bg: var(--bg-alt);
}
```

## 6. Authored dark-theme spec (hard constraints, machine-enforced)

The Figma midnight dark (`#09090F` / `#0D1228` near-black) is **not ported**, and neither is
the cool slate-charcoal that preceded this revision. The dark theme is an authored warm
charcoal, adjusted only where a documented AA pair fails. It was once shared with the
marketing site; that link is gone (see §5) and the app owns these values.
`globals.test.ts` enforces:

1. **Never near-black** — `--bg-base` relative luminance stays above a floor (0.007) that
   excludes near-black (the rejected schemes measure ≤ 0.005; dusk `#262522` measures
   ≈ 0.0185, comfortably clear).
2. **Clearly lighter elevation** — strict luminance ordering `--bg-base` (0.0185) `<`
   `--bg-panel` (0.0242) `≤` `--bg-elevated` (0.0343). `--bg-well` (0.0130) may go slightly
   darker than base for sunken wells.
3. **AA ≥ 4.5:1 for every documented pair** — the same programmatic pair list as light
   (body, accent, and every status/sentiment/citation/run/score `*-text` on its `*-bg`,
   translucent fills composited over `--bg-panel`).
4. **The dark accent stays in the dusk violet family (240–265°)** — guarding the band both
   ways, so a later edit can neither drift it back to the light theme's royal blue nor push
   it off into magenta. The surface ramp is pinned to the deck values by assertion for the
   same reason: app and marketing must not silently diverge.
5. **Soft shadows** — the dark stack casts low-opacity (≤ 0.6 alpha), larger-blur shadows
   from black with a faint warm keyline; no crushed near-black shadow stack.
6. **Decorative-only tones are never body text** — `--text-muted` / `--text-subtle` are
   asserted present but excluded from ratio gating (captions, icons, dividers, the `—`
   placeholder). The deck's dim tones live here.

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
> 4/6/8/12/16 ladder is doing real work across tables, chips, cards and modals.
- Line-height tokens: `--leading-none: 1`, `--leading-tight: 1.2`, `--leading-snug: 1.35`,
  `--leading-normal: 1.5`.

## 8. Spacing (4px grid), radii, controls

**Spacing steps** (`--space-N` = 4px × N):
`--space-1: 4px`, `--space-2: 8px`, `--space-3: 12px`, `--space-4: 16px`, `--space-5: 20px`,
`--space-6: 24px`, `--space-7: 28px`, `--space-8: 32px`, `--space-10: 40px`,
`--space-12: 48px`, `--space-14: 56px`, `--space-16: 64px`, `--space-20: 80px`.
`--card-padding: 14px`; `--content-gutter: 20px`.

**Radii (Figma `--r-*` mapped):** `--radius-xs: 4px` (badges, tags), `--radius-sm: 6px`
(inputs), `--radius-md: 8px` (**buttons**), `--radius-lg: 12px` (cards, panels),
`--radius-xl: 16px` (modals, large cards), `--radius-2xl: 16px` (aliases xl),
`--radius-full: 9999px` (**pill** — badges, chips, toggles, segmented control, avatar).

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
  --shadow-card: var(--shadow-card-value); /* + xs/sm/elevated/lg/modal (→ --shadow-1..4) */
  /* type sizes (incl. --text-hero/--text-data-lg), radii, tracking,
     line-heights bridged here too (§7–§8) */
}
```

**Implementation rules:** raw hex lives **only** in `:root`/`[data-theme='dark']`;
components use bridged tokens only (no-raw-hex guard); **both themes are always fully
defined**; `data-theme` is set pre-hydration. The Figma levels `--shadow-1..4` stay raw-only
(bridging them as `--shadow-1: var(--shadow-1)` would be circular) — components consume the
semantic aliases.

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
the same scrim and surface tokens, so the two stay consistent.

Filtering is a plain substring match over label + group. There is deliberately no fuzzy
matcher and no index: the corpus is ~12 nav items plus a handful of projects, where
subsequence matching mostly produces surprising ranking for no measurable gain. The cursor is
**clamped during render** rather than corrected in an effect, so a filter that shrinks the
list can never render a frame with nothing selected. `role="listbox"` +
`aria-activedescendant` keeps focus in the input while the selection moves.

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
instead of running ahead of it on a fixed delay. **Never introduce motion here that content
depends on to become visible.**


## 13. Motion + accessibility (app)

- **Motion**: `--transition-fast: 100ms`, `--transition-base: 180ms`,
  `--transition-slow: 280ms`, all `cubic-bezier(0.4, 0, 0.2, 1)`. Respect
  `prefers-reduced-motion` (non-essential transitions/shimmer disabled). Skeleton shimmer
  ~1.2s loop.
- **Accessibility**: every documented text/surface pair meets **AA ≥ 4.5:1** in both themes
  (programmatic suite; muted/subtle tokens are decorative-only and never body text). Focus
  is always visible: the Figma **2px `--accent` outline** (`:focus-visible`) plus the
  tokenized `--focus-ring` shadow on `.focus-ring` components. `score-ring`, `donut`, and
  charts carry ARIA labels with the numeric value. `forced-colors` mode falls back to system
  colors; badges keep a text label (never color-only meaning). Print rules drop backgrounds.
  Interactive targets ≥ 30px height.

## 14. Implementation checklist

1. Author `:root` (light, Figma verbatim) + `html[data-theme='dark']` (authored soft
   charcoal) with **all** tokens from §4–§5, including the primitive ramps, `--chart-1..8`,
   `--text-inverse`/`--text-link`, `--accent-active`, `--score-*-text/-ring/-border`,
   `--shadow-1..4` + aliases, and the new radii.
2. Add the `@theme inline` bridge (§9) — components use bridged tokens only.
3. **No raw hex outside the two theme blocks** (app) and `app/(marketing)/marketing-theme.css` (marketing + auth).
4. **Both themes always defined**; `data-theme` set pre-hydration; **light is the default**
   (stored choice → light; the OS preference is not consulted).
5. Mono font gets `font-variant-numeric: tabular-nums`; all metrics use mono.
6. Ship `prefers-reduced-motion`, `forced-colors`, `print`, and theme-swap suppression rules.
7. Load **Inter** (weights 400/500/600) + **Geist Mono** via next/font in `app/layout.tsx`
   (`--font-sans`, `--font-mono`). `--font-display-family` resolves to Inter → bridged
   `font-display` utility; **the app has no separate display face** — Manrope is loaded in
   the same file as `--font-manrope` but is consumed ONLY by the public Proof surface. Never
   name a next/font variable `--font-display`: that name is the bridged `@theme` token.
8. **Keep the two systems separate.** The app's dark theme is its own; do not reintroduce
   dark marketing tokens, and do not make the public surface follow `data-theme`. Marketing
   and the logged-out auth screens are light-only by design.
9. Keep the guard trio green: `app/globals.test.ts` (palette + name-set sync + WCAG suite +
   §6 dark assertions + the Proof contract), `scripts/check-design-tokens.mjs`
   (required vars across **both** `globals.css` and `marketing-theme.css`), and
   `scripts/check-frontend-architecture.mjs` (line budgets, including the 400-line ceiling on
   `marketing-theme.css`).
