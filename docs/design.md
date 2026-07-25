# Design System — Searchify

> The **written form** of the Searchify design system. The product app runs on the **Figma
> design system ported into `frontend/app/globals.css`** — the royal-blue light theme
> **verbatim**, plus a newly **authored soft slate-charcoal dark theme** (the Figma midnight
> dark is deliberately not ported). Marketing is a **fully independent creative system**
> living in `frontend/app/(marketing)/marketing.css`. Machine guards keep this document, the
> token files, and WCAG AA in sync (`frontend/app/globals.test.ts`,
> `frontend/scripts/check-design-tokens.mjs`).
> Companion docs: [`../Agents.md`](../Agents.md), [`invariants.md`](invariants.md),
> [`backend-architecture.md`](backend-architecture.md), [`frontend-architecture.md`](frontend-architecture.md).

## 1. Overview

- **`frontend/app/globals.css` is the single source of truth** for app tokens. Components
  consume **bridged Tailwind semantic tokens only** — never raw hex (no-raw-hex guard). Raw
  hex lives only in the `:root` and `html[data-theme='dark']` blocks of `globals.css`
  (app) and in `app/(marketing)/marketing.css` (marketing).
- **Aesthetic**: dense, confident **B2B analytics** in the Figma visual language — a
  `#F7F8FA` cool-gray page, white panels **elevated by the `--shadow-1..4` stack** (no longer
  a flat/hairline-only language), one **royal-blue accent `#2756FF`** reserved for data,
  links, active states and focus rings, vivid semantic colors, **Inter** for UI text and
  **Geist Mono** tabular numerals for every metric, 4px grid, WCAG 2.1 AA.
- **Light is the default theme.** The dark theme is a full sibling: an **authored soft
  slate-charcoal** in the Perplexity/Claude family — never near-black, with clearly lighter
  elevated surfaces (see §6). Every documented text/surface pair in **both** themes meets
  **AA ≥ 4.5:1**, computed programmatically in `globals.test.ts`.

## 2. Theme model

Two explicit surface hierarchies. `:root` = light (default),
`html[data-theme='dark']` = dark. A pre-hydration script sets `data-theme` before first
paint. **Light is the default**: the bootstrap resolves `stored choice → light`; the OS
preference is intentionally not consulted — only an explicit stored `dark` choice (from any
ThemeToggle) opts into dark.

**Light surface hierarchy (Figma):** `bg-base #F7F8FA` → panels/elevated `#FFFFFF`
(differentiated by shadow, not fill) → sunken wells `#EFF1F6`. Sidebar = panel `#FFFFFF`.

**Dark surface hierarchy (authored):** `bg-base #16181E` → `bg-panel #1F222B` →
`bg-elevated #272B36` (strictly ascending luminance), sunken `bg-well #12141A`. Sidebar =
panel `#1F222B`.

The accent is **royal blue** — `#2756FF` light (Figma anchor), a brightened royal-blue
sibling in dark — reserved for links, active states, focus rings, and data visualization.
Owned citations are **Figma blue** in both themes (the former green identity is dropped —
confirmed product decision).

## 3. Figma → Searchify token mapping

Rule: **same name, new Figma value** wherever a semantic equivalent exists; **new token**
only for new concepts; where our set is finer-grained than Figma's, alias to the nearest
Figma value and document it. Figma source: `/code/.uploaded_artifacts/1192.css` (tokens) and
`1198.tsx` (type scale, buttons, badges, elevation).

| Figma (`1192.css`) | Searchify token(s) | Notes |
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
| `--r-xs..xl` (4/6/8/12/16) | `--radius-xs/sm/md/lg/xl` = 4/6/8/12/16; `--radius-2xl` = 16; `--radius-full` kept | **buttons are rounded-md (8px), not pills** (1198 Btn) |
| Inter, Geist Mono | `--font-primary-family` = Inter stack; `--font-mono-family` = Geist Mono stack; `--font-display-family` → Inter | next/font in `app/layout.tsx`: Inter replaces Geist; the variable name `--font-sans` is kept |

## 4. Token values — LIGHT (`:root`)

Figma values **verbatim**. The primitive ramps are a globals.css-only layer; semantic tokens
reference them. One deliberate AA adjustment: Figma's `--run-cancelled` text `#98A2BE`
measures 2.4:1 on its `#F7F8FA` bg, so it moves one ramp step within the same family
(neutral-400 → neutral-500 `#667092`) to clear AA 4.5:1.

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

  /* Elevation — Figma --shadow-1..4 verbatim; semantic aliases keep the
     existing component names (xs,sm→1; card→2; elevated→3; lg,modal→4) */
  --shadow-1: 0 1px 2px rgba(13, 18, 40, 0.05), 0 0 0 1px rgba(13, 18, 40, 0.05);
  --shadow-2: 0 2px 6px rgba(13, 18, 40, 0.07), 0 0 0 1px rgba(13, 18, 40, 0.06);
  --shadow-3:
    0 6px 20px rgba(13, 18, 40, 0.1), 0 1px 4px rgba(13, 18, 40, 0.05),
    0 0 0 1px rgba(13, 18, 40, 0.07);
  --shadow-4:
    0 16px 40px rgba(13, 18, 40, 0.14), 0 4px 10px rgba(13, 18, 40, 0.07),
    0 0 0 1px rgba(13, 18, 40, 0.09);
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

## 5. Token values — DARK (`html[data-theme='dark']`)

**Authored** soft slate-charcoal (per the approved app mockups) — replaces the Figma
midnight dark. Only tokens that change are overridden; ramps, chart palette, type, spacing,
radii, and structural tokens are shared from `:root`. Two documented AA adjustments against
the mockup values: the solid accent `#3F6AFF` → `#3D64FA` (white accent-fg 4.45 → 4.78:1)
and the cancelled run text `#71788C` → `#8F96A9` (3.1 → 4.65:1) — both minimal moves within
the same family.

```css
html[data-theme="dark"] {
  color-scheme: dark;

  /* Surfaces — cool slate-charcoal, strict ascending luminance */
  --bg-base: #16181e;
  --bg-alt: #1b1e26; /* between base and panel — hover/inset */
  --bg-panel: #1f222b;
  --bg-elevated: #272b36;
  --bg-well: #12141a; /* sunken — may dip below base */
  --bg-sidebar: #1f222b;
  --surface-overlay: rgba(22, 24, 30, 0.92);

  /* Borders */
  --border-subtle: #262a35;
  --border: #303544;
  --border-strong: #3f4557;

  /* Text */
  --text-primary: #ecedf2; /* 15.2:1 on bg-base */
  --text-secondary: #a6acbe; /* 7.8:1 on bg-base, 7.0:1 on bg-panel */
  --text-muted: #71788c; /* captions/decorative only */
  --text-subtle: #4a4f60; /* decorative only */
  --text-inverse: #16181e;
  --text-link: var(--accent-text);

  /* Accent — brightened royal blue (family hue ≈ 228°) */
  --accent: #3d64fa; /* white accent-fg on accent: 4.78:1 */
  --accent-hover: #6b90ff;
  --accent-active: #7da0ff;
  --accent-fg: #ffffff;
  --accent-subtle: rgba(63, 106, 255, 0.14);
  --accent-border: rgba(63, 106, 255, 0.34);
  --accent-text: #7da0ff; /* 6.3:1 on bg-panel */

  /* Status — translucent fills re-based on the authored surfaces */
  --success: #34d399; --success-bg: rgba(16, 185, 129, 0.12);
  --success-border: rgba(16, 185, 129, 0.26); --success-text: #6ee7b7;
  --warning: #fbbf24; --warning-bg: rgba(245, 158, 11, 0.12);
  --warning-border: rgba(245, 158, 11, 0.26); --warning-text: #fcd34d;
  --danger: #f87171; --danger-bg: rgba(239, 68, 68, 0.12);
  --danger-border: rgba(239, 68, 68, 0.26); --danger-text: #fc8181;
  --info: #7da0ff; --info-bg: rgba(39, 86, 255, 0.14);
  --info-border: rgba(39, 86, 255, 0.3); --info-text: #7da0ff;
  --neutral-bg: rgba(255, 255, 255, 0.05);

  /* Sentiment */
  --sentiment-positive: var(--success);
  --sentiment-positive-bg: var(--success-bg);
  --sentiment-positive-text: var(--success-text);
  --sentiment-neutral: #a6acbe;
  --sentiment-neutral-bg: rgba(255, 255, 255, 0.05);
  --sentiment-neutral-text: #a6acbe;
  --sentiment-negative: var(--danger);
  --sentiment-negative-bg: var(--danger-bg);
  --sentiment-negative-text: var(--danger-text);
  --value-placeholder: var(--text-subtle);

  /* Citations */
  --citation-owned: #7da0ff; --citation-owned-bg: rgba(39, 86, 255, 0.16);
  --citation-owned-border: rgba(39, 86, 255, 0.3); --citation-owned-text: #7da0ff;
  --citation-competitor: #fca87a; --citation-competitor-bg: rgba(249, 115, 22, 0.12);
  --citation-competitor-border: rgba(249, 115, 22, 0.24); --citation-competitor-text: #fca87a;
  --citation-third-party: #c4b5fd; --citation-third-party-bg: rgba(139, 92, 246, 0.12);
  --citation-third-party-border: rgba(139, 92, 246, 0.24);
  --citation-third-party-text: #c4b5fd;

  /* Run status */
  --run-draft: #a6acbe; --run-draft-bg: rgba(255, 255, 255, 0.05);
  --run-queued: #a6acbe; --run-queued-bg: rgba(255, 255, 255, 0.05);
  --run-running: #7da0ff; --run-running-bg: rgba(39, 86, 255, 0.16);
  --run-analyzing: #c4b5fd; --run-analyzing-bg: rgba(139, 92, 246, 0.13);
  --run-completed: #6ee7b7; --run-completed-bg: rgba(16, 185, 129, 0.12);
  --run-partial: #fcd34d; --run-partial-bg: rgba(245, 158, 11, 0.12);
  --run-failed: #fc8181; --run-failed-bg: rgba(239, 68, 68, 0.12);
  /* AA adjustment: mockup cancelled text #71788C → #8F96A9 (same slate family). */
  --run-cancelled: #8f96a9; --run-cancelled-bg: rgba(255, 255, 255, 0.05);

  /* Score bands — ring hues identical to light; fills translucent */
  --score-low: #ef4444; --score-low-bg: rgba(239, 68, 68, 0.13);
  --score-low-border: rgba(239, 68, 68, 0.26); --score-low-text: #fc8181;
  --score-low-ring: #ef4444;
  --score-mid: #f59e0b; --score-mid-bg: rgba(245, 158, 11, 0.13);
  --score-mid-border: rgba(245, 158, 11, 0.26); --score-mid-text: #fcd34d;
  --score-mid-ring: #f59e0b;
  --score-good: #10b981; --score-good-bg: rgba(16, 185, 129, 0.13);
  --score-good-border: rgba(16, 185, 129, 0.26); --score-good-text: #6ee7b7;
  --score-good-ring: #10b981;
  --score-high: #22c55e; --score-high-bg: rgba(34, 197, 94, 0.13);
  --score-high-border: rgba(34, 197, 94, 0.26); --score-high-text: #86efac;
  --score-high-ring: #22c55e;

  /* Chart palette NOT overridden (identity survives the theme switch);
     only the achromatic "Other" bucket adapts. */
  --series-other: #3f4557;

  /* Shadows — authored soft stack (low opacity, larger blur) */
  --shadow-1: 0 1px 2px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.03);
  --shadow-2: 0 2px 8px rgba(0, 0, 0, 0.34), 0 0 0 1px rgba(255, 255, 255, 0.04);
  --shadow-3: 0 8px 24px rgba(0, 0, 0, 0.42), 0 0 0 1px rgba(255, 255, 255, 0.05);
  --shadow-4: 0 16px 48px rgba(0, 0, 0, 0.52), 0 0 0 1px rgba(255, 255, 255, 0.06);
  --focus-ring: 0 0 0 3px color-mix(in srgb, var(--accent) 35%, transparent);
  --overlay-scrim: rgba(0, 0, 0, 0.55);

  /* Skeleton */
  --skeleton-base: #1f222b;
  --skeleton-highlight: #272b36;
}
```

## 6. Authored dark-theme spec (hard constraints, machine-enforced)

The Figma midnight dark (`#09090F` / `#0D1228` near-black) is **not ported** — the dark
theme is authored fresh in the Perplexity/Claude family of lighter, softer darks. Values
come from the approved app mockups, adjusted only where a documented AA pair fails.
`globals.test.ts` enforces:

1. **Never near-black** — `--bg-base` relative luminance stays above a floor (0.007) that
   excludes near-black (the rejected schemes measure ≤ 0.005; the authored `#16181E`
   measures ≈ 0.0092).
2. **Clearly lighter elevation** — strict luminance ordering `--bg-base` (0.0092) `<`
   `--bg-panel` (0.0162) `≤` `--bg-elevated` (0.0258). `--bg-well` may go slightly darker
   than base for sunken wells.
3. **AA ≥ 4.5:1 for every documented pair** — the same programmatic pair list as light
   (body, accent, and every status/sentiment/citation/run/score `*-text` on its `*-bg`,
   translucent fills composited over `--bg-panel`). Accent and status hues are brightened
   variants of the light values — never the Figma dark set; the dark accent hue stays in the
   royal-blue family (215–240°).
4. **Soft shadows** — the dark stack casts low-opacity (≤ 0.6 alpha), larger-blur shadows
   from black with a faint white keyline; no crushed near-black shadow stack.
5. **Decorative-only tones are never body text** — `--text-muted` / `--text-subtle` are
   asserted present but excluded from ratio gating (captions, icons, dividers, the `—`
   placeholder).

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
(`1198.tsx` buttons/badges/elevation, `1194.tsx` score ring, `1195.tsx` sparkline).

| Primitive | Notes |
|---|---|
| `button` | **rounded-md (8px) — pill variants retired.** Primary = accent fill + `--accent-fg` (white) text + accent-tinted shadow, 13.5px/500; hover/active walk `--accent-hover`/`--accent-active`. Secondary = panel bg + `--border` hairline; ghost = transparent + accent-subtle hover; destructive = danger tokens. Sizes sm/md/lg/icon; `asChild`; icon slot. |
| `badge` | pill (`--radius-full`) 11.5px/500 with token bg/border/text. Variants map to tokens: `status` (success/warning/danger/info), `sentiment`, `classification` (**owned = Figma blue**, competitor, third-party), `run-status` (all 8), `score-band` (low/mid/good/high). |
| `card` | `bg-panel` + `--shadow-2` + `--radius-lg`; elevated = `bg-elevated` + `--shadow-3`; header/title/description/content slots + optional mono eyebrow panel label. |
| `table` (dense) | 30px sticky header (`--text-2xs` uppercase micro label, muted), 42px rows, 14px cells, mono tabular numerals for numeric columns, neutral-50 row hover, sortable carets; shared `table-pagination` footer (mono indicator + ghost Prev/Next, clamp-only reconciliation). |
| `score-ring` | Figma geometry: rounded linecap, 0.8s sweep transition, ring color from `--score-*-ring`, track from the theme; center numeral (`md` = `--text-lg`, `lg` = `--text-hero` hero numeral); ARIA label with %. **Band thresholds stay 25/50/75 — `score-band.ts` unchanged.** |
| `sparkline` | trend-colored 1.5px polyline + end dot (1195). |
| `donut` | segmented ring for per-engine / citation share; hover-thicken + mono center value; legend; ARIA. |
| `tabs` / `segmented` | underline tabs (2px accent indicator, per 1199) + a pill segmented control (`--segmented-bg`, active = accent-fg on accent). |
| `input` / `field` | 14px text, `--border` hairline, `--radius-sm`, focus = accent border + `--focus-ring`; `field` wraps label + help + error. |
| `dialog` | Radix modal; `--overlay-scrim`, `bg-elevated`, `--shadow-4`, `--radius-xl`. |
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

### 11.1 App shell (`(app)/layout.tsx`) — Figma shell geometry (1196), grouped nav kept

**Sidebar (220px, `bg-sidebar`)**: logo row (LogoCube + wordmark), project switcher
(brand avatar + name, dropdown), then the grouped nav — the existing **Analyze / Improve**
groups stay (the Figma flat nav is not adopted) with mono-uppercase eyebrow group labels.
Nav rows are 36px, 13.5px, `--text-secondary`; the **active item** is `--accent-subtle` bg +
`--accent-text` + a **3px left accent bar** with the icon at full opacity; hover = bg-alt.
Bottom = user card (avatar + name/email). **Topbar (52px, `bg-panel`)**: left = the current
page's title (15px/600, the single h1) + header slot (filters/actions); right = export hook,
theme toggle, user affordances. Content scrolls independently. A first-run gate redirects
zero-project users to `/onboarding` (and waits for the projects query to settle before
redirecting — no flash).

### 11.2 Auth (`/login`, `/register`)

Split-screen `(auth)` layout restyled in the Figma language: brand panel (token-driven,
per the approved mockups) + form panel with an elevated form card (`--shadow-2`,
`--radius-lg`), larger type, three OAuth buttons above an email divider (coming-soon →
accessible 503 inline notice), inline `ApiError` danger alert, login/register toggle link,
theme toggle top-right. The pages own the single h1.

### 11.3 Onboarding (`/onboarding`) — Figma-styled, AI auto-discovery (1200)

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

### 11.4 Visibility workspace (`/visibility`) — Figma dashboard (1199)

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

**Site Health** (`/site-health`) — crawl/page detail per `1197.tsx`: score presentation
(score-band tokens), issue grouping layout, page table. **Issues**, **Content**,
**Knowledge Base** (description/positioning/products/audience editor + consent-gated "Draft
with AI" review flow), **Products**, **Analytics**, **Traffic**, **Settings** (providers /
integrations) — the same Figma-language reskin: tokens + new primitives, hierarchy and
spacing per this document, shared empty-state; no contract or data-flow changes.
**Setup** (`/setup`) keeps its wizard flow restyled; `/setup/new` stays for additional
projects.

## Marketing creative system (the `.mkt` contract)

Marketing pages are a **fully independent creative system** — "marketing pages have no
relation to the app". Its home is the **existing** `frontend/app/(marketing)/marketing.css`:
styles scope under the `.mkt` wrapper, the `--mkt-*` token block owns palette/type/motion,
and plain CSS classes (`hero`, `btn`, `grad-text`, `container`, `eyebrow`) are the
consumption surface — **no Tailwind bridging**, and hex stays inside the CSS file (CSS files
are exempt from the no-raw-hex guard; marketing components must stay hex-free). The system
carries its own branded **dusk** canvas independent of the app's `data-theme`; the Figma app
scale above does **not** constrain marketing's display type.

**Dusk palette** (per the approved marketing style guide) — warm charcoal, cream ink, one
electric signal gradient (violet `#7B6CF6` → orchid `#B34FE0` → ember `#F0566B`):

| Role | Value | Token (task 7 finalizes the `--mkt-*` block) |
|---|---|---|
| page canvas | `#262522` | `--mkt-bg` |
| recessed well / contrast canvas | `#1F1E1B` | `--mkt-bg-0` |
| panel | `#2C2B28` | `--mkt-surface` |
| elevated | `#353430` | `--mkt-raised` |
| primary ink | `#F4F2EB` | `--mkt-text` |
| secondary ink | `#B4B0A4` | `--mkt-text-2` |
| accent (violet) | `#7B6CF6` | `--mkt-accent` |
| accent as text | `#9C92FF` | `--mkt-accent-text` |
| success | `#46D69C` | `--mkt-up` |
| competitor | `#FCA87A` | `--mkt-comp` |
| third-party | `#C9B8FD` | `--mkt-third` |

**Type**: Söhne/Inter-class sans for display and body, Georgia-italic serif accents for the
human moments, JetBrains Mono for every number; an oversized tight-tracked display scale
independent of the Figma app scale.

**Motion**: cinematic and product-demonstrating (answers stream, scores sweep, cards
parallax/float) — `motion/react` primitives, transform/opacity only, below-fold scenes
lazy-mounted, **everything gated on `prefers-reduced-motion`** with static fallbacks;
decorative scenes are `aria-hidden`.

**AA roles** — computed on the `#1F1E1B` dusk canvas (the system's darkest surface) and
machine-checked in `globals.test.ts`:

- **Body text (≥ 4.5:1 required)**: `#F4F2EB` (14.9:1), `#B4B0A4` (7.7:1), `#9C92FF`
  (6.3:1), `#46D69C` (9.0:1), `#FCA87A` (8.0:1), `#C9B8FD` (8.5:1).
- **Display / decorative-only carve-outs (≥ 3:1 large-text bar; never body text)**:
  `#7B6CF6` (4.22:1 — display type, gradient stops, glows), `#B34FE0` (4.06:1 — gradient
  stops only), `#7F7B70` (3.94:1 — decorative captions / mono meta). These three tones are
  display/decorative roles **only**; using any of them for body copy is a design-system
  violation.

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
3. **No raw hex outside the two theme blocks** (app) and `marketing.css` (marketing).
4. **Both themes always defined**; `data-theme` set pre-hydration; **light is the default**
   (stored choice → light; the OS preference is not consulted).
5. Mono font gets `font-variant-numeric: tabular-nums`; all metrics use mono.
6. Ship `prefers-reduced-motion`, `forced-colors`, `print`, and theme-swap suppression rules.
7. Load **Inter** (weights 400/500/600) + **Geist Mono** via next/font in `app/layout.tsx`
   (`--font-sans`, `--font-mono`). `--font-display-family` resolves to Inter → bridged
   `font-display` utility; there is no separate display face. Never name a next/font
   variable `--font-display` — that name is the bridged `@theme` token.
8. Keep the guard trio green: `app/globals.test.ts` (palette + name-set sync + WCAG suite +
   §6 dark assertions + marketing dusk contract), `scripts/check-design-tokens.mjs`
   (required vars across **both** `globals.css` and `marketing.css`), and
   `scripts/check-frontend-architecture.mjs` (line budgets).
