# CiteLadder Design System

> The repo's owner of the visual system: where the system lives, which files
> carry it, and the token contract the policy check enforces. The system
> itself is the artifact below; this file does not restate it.

The CiteLadder Design System artifact is the reference for every surface — the
website, docs, sign-in, onboarding and the app:
<https://claude.ai/artifact/G73m4PDH6bowXxNpPFMcLU> (private to the owner;
read it with the Artifact tool, `action: "read"`, `path` for one file). It
holds the brand book (`project/README.md`), every token in both themes
(`project/tokens.json`), and each component's CSS, React, contract and states
(`project/components/`). Where the repo and the artifact disagree, the
artifact is right; where a page needs something the artifact lacks, add it to
the system first (one component, both themes), then use it. The rollout onto
the system is [plans/design-system-rollout.md](plans/design-system-rollout.md).

Visual work never changes factual copy, data, feature claims, scripted preview
content, transactions or confirmation gates without approval. Tests verify
ownership, accessibility and product behaviour, not classes or pixels as a
second visual authority.

## The system in one paragraph

Monochrome with one accent. Ink (`#111111`, `#f4f4f4` in dark) carries every
primary action, heading and figure; Flare (`#e8501a`, `#ff6a33` in dark) is a
mark only: the logo's bars, the own-brand chart series, a 2px rung, a dot, a
link's ink as `accent-ink`. Cal Sans sets display type at its one weight, 400,
and never under 18px; Geist sets everything else; Geist Mono sets data and
code. Light and dark on every surface, defaulting to the system preference.

## Decisions

| | Decision (owner, 5 November 2026) |
| --- | --- |
| D1 | Cal Sans, Geist and Geist Mono replace the previous faces. They are self-hosted from the private `Cube-27/cube27-fonts` repo through `pnpm fonts:pull`, never committed and never fetched from the web. |
| D2 | One theme store for the app, website and docs (`frontend/lib/theme/theme.ts`): light, dark or system, persisted in the `citeladder_theme` cookie on the parent domain so one choice follows the reader across subdomains. System is the default. |
| D3 | The logo drawing (`packages/contracts/src/brand-logo.ts`) is unchanged; its accent is Flare everywhere: the inline mark, `public/citeladder-logo.svg`, the favicon, the social card and the billing PDFs. |
| D4 | PDFs keep Inter as their text face; only their colours follow the system. |

## Ownership

| Owner | Responsibility |
| --- | --- |
| `frontend/apps/app/src/globals.css` | Every token (the single `@theme`, `:root` and `:root[data-theme='dark']`), the type roles (`.type-*`), focus, motion and the shared component geometry derived from the tokens |
| `frontend/scripts/design-system-tokens.json` | The artifact's `tokens.json`, verbatim: the contract `globals.css` is checked against |
| `frontend/lib/config/brand-fonts.json` | The three faces by role (`display`, `sans`, `mono`), their files and revision in the font repo; `pnpm fonts:pull` writes the metric-matched fallbacks |
| `frontend/lib/fonts/brand-fonts.ts` | The `@font-face` rules and fallbacks each runtime (the app's Vite build, `PublicFonts.astro`) loads |
| `frontend/lib/theme/theme.ts`, `frontend/public/theme-preference.js` | The theme preference and the pre-paint bootstrap every surface runs |
| `frontend/components/ui/logo-mark.tsx`, `packages/contracts/src/brand-logo.ts` | The logo, drawn inline in ink (`currentColor`) and the accent |
| `frontend/components/ui/`, `frontend/components/layout/` | The app's components and shell, composed by feature folders that set no geometry of their own |
| `frontend/apps/marketing/src/site.css`, `frontend/components/marketing/chrome/`, `frontend/components/marketing/sections/` | The website's components: SiteNav, SiteFooter, CookieBanner, Breadcrumbs, AnnouncementPill and the page sections, the system's `cl-*` geometry on the tokens above |
| `frontend/apps/app/src/website-type.css` | The responsive `--text-site-*` sizes the website components read, and the `website-*` roles the docs and the marketing pages not yet recomposed still use |
| `frontend/services/api/src/billing/pdf-brand.ts` | The PDF palette, read from `globals.css` |

## Token contract

`pnpm check:policy` (`frontend/scripts/check-design-system.mjs`) holds
`globals.css` to the artifact:

- **Values.** Every system colour in both themes, every type style (size,
  line height, weight, tracking), radius, control height, layout size,
  spacing step and shadow equals `design-system-tokens.json`. A colour, type
  style or radius the system does not have fails; the only extra colours are
  the third-party `--color-brand-*` marks. `--spacing` is 4px, so `p-N` is the
  system's space-N.
- **Faces.** `brand-fonts.json` names Cal Sans, Geist and Geist Mono for the
  display, sans and mono roles.
- **Cal Sans** is weight 400 only and never under 18px, in class strings and in
  every stylesheet.
- **Flare is a mark.** No `bg-`, `from-`, `via-` or `to-accent` larger than a
  2px mark, no accent background on a box over 4px, no heading in accent.
  Primary actions are ink; a highlighted surface is `accent-soft`.
- **The website's H1 is the ceiling.** No website or docs type exceeds 44px.
- **Contrast.** Every ink on every ground holds 4.5:1 in both themes, each
  status on its own soft, the labels on ink and on Flare; marks, control
  borders, the focus ring and the chart series hold 3:1; positive against
  negative and the three named series stay apart under red–green colour-vision
  loss.
- **Usage.** Raw colours, `@theme` and font files live only where they are
  owned; radius is the `rounded-*` scale with no arbitrary value; shadows are
  `shadow-xs|card|pop|press`; spacing stays on the 4px grid; type sizes,
  leading, tracking and faces outside `components/ui/` come from a type role;
  no text ink becomes a background; the retired design's identifiers do not
  return. Debt older than a rule is ratcheted in
  `frontend/scripts/design-system-baseline.json` and only falls.
- **Documentation.** The tables below are generated from `globals.css` by
  `node frontend/scripts/audit-design-tokens.mjs --write`; a stale table, a
  duplicate value that is neither aliased nor recorded, and a non-system token
  without a consumer all fail.

### Colour

<!-- generated:tokens:start -->
| Token | Light | Dark |
| --- | --- | --- |
| `--color-accent` | `#e8501a` | `#ff6a33` |
| `--color-accent-ink` | `#b53a0c` | `#ff9466` |
| `--color-accent-soft` | `#ffe6da` | `#3b1a0c` |
| `--color-brand-claude` | `#d97757` | `#d97757` |
| `--color-brand-gemini` | `#3186ff` | `#3186ff` |
| `--color-brand-google-blue` | `#4285f4` | `#4285f4` |
| `--color-brand-google-green` | `#34a853` | `#34a853` |
| `--color-brand-google-red` | `#ea4335` | `#ea4335` |
| `--color-brand-google-yellow` | `#fbbc05` | `#fbbc05` |
| `--color-chart-grid` | `#ececec` | `#262626` |
| `--color-data-1` | `#e8501a` | `#ff6a33` |
| `--color-data-2` | `#111111` | `#f4f4f4` |
| `--color-data-3` | `#7a7a7a` | `#8c8c8c` |
| `--color-data-other` | `#c2c2c2` | `#4a4a4a` |
| `--color-focus` | `#111111` | `#f4f4f4` |
| `--color-info` | `#1f5fbf` | `#7fb0ff` |
| `--color-info-soft` | `#e3edfc` | `#14243d` |
| `--color-ink` | `#111111` | `#f4f4f4` |
| `--color-ink-hover` | `#2a2a2a` | `#d6d6d6` |
| `--color-ink-muted` | `#6b6b6b` | `#8c8c8c` |
| `--color-ink-secondary` | `#525252` | `#a6a6a6` |
| `--color-line` | `#e5e5e5` | `#2a2a2a` |
| `--color-line-control` | `#858585` | `#747474` |
| `--color-nav-glass` | `rgb(244 244 244 / 78%)` | `rgb(30 30 30 / 78%)` |
| `--color-negative` | `#c4122f` | `#ff7387` |
| `--color-negative-soft` | `#ffe2e6` | `#3d0e16` |
| `--color-on-accent` | `#111111` | `#111111` |
| `--color-on-ink` | `#ffffff` | `#111111` |
| `--color-paper` | `#f4f4f4` | `#0a0a0a` |
| `--color-positive` | `#0b6e69` | `#4fd1c5` |
| `--color-positive-soft` | `#d6f2ef` | `#0e2e2b` |
| `--color-scrim` | `rgb(17 17 17 / 32%)` | `rgb(0 0 0 / 64%)` |
| `--color-surface` | `#ffffff` | `#151515` |
| `--color-surface-sunken` | `#ececec` | `#1e1e1e` |
| `--color-warning` | `#8a5000` | `#f5b84a` |
| `--color-warning-soft` | `#fff0d1` | `#3a2a0a` |
<!-- generated:tokens:end -->

### Type

Product roles are the `.type-*` classes in `globals.css`, reached through
`textRole()` in `components/ui/typography.tsx`; the website roles are in
`website-type.css`.

<!-- generated:type:start -->
| Role | Surface | Size / line height | 768–1023px |
| --- | --- | --- | --- |
| `.type-badge` | product | `12px / 16px` | — |
| `.type-body` | product | `14px / 20px` | — |
| `.type-caption` | product | `12px / 16px` | — |
| `.type-code` | product | `13px / 22px` | — |
| `.type-control` | product | `14px / 20px` | — |
| `.type-delta` | product | `13px / 20px` | — |
| `.type-eyebrow` | product | `11px / 16px` | — |
| `.type-figure` | product | `36px / 40px` | — |
| `.type-figure-sm` | product | `16px / 24px` | — |
| `.type-item-title` | product | `16px / 24px` | — |
| `.type-label` | product | `14px / 20px` | — |
| `.type-page-title` | product | `28px / 34px` | — |
| `.type-section-title` | product | `22px / 28px` | — |
| `.website-article-title` | public | `44px / 48px` | `36px / 42px` |
| `.website-body` | public | `16px / 26px` | — |
| `.website-data-display` | public | `32px / 38px` | — |
| `.website-feature-heading` | public | `22px / 28px` | — |
| `.website-hero-display` | public | `44px / 48px` | `36px / 42px` |
| `.website-hero-lead` | public | `20px / 30px` | — |
| `.website-label` | public | `14px / 20px` | — |
| `.website-lead` | public | `20px / 30px` | — |
| `.website-nav` | public | `16px / 24px` | — |
| `.website-page-title` | public | `44px / 48px` | `36px / 42px` |
| `.website-section-heading` | public | `36px / 42px` | — |
<!-- generated:type:end -->

### Controls and layout

<!-- generated:controls:start -->
| Token | Value |
| --- | --- |
| `--container-site` | `1320px` |
| `--container-app` | `1440px` |
| `--container-prose` | `720px` |
| `--container-narrow` | `560px` |
| `--control-sm` | `28px` |
| `--control-md` | `36px` |
| `--control-lg` | `48px` |
| `--nav-height` | `64px` |
| `--sidebar-width` | `248px` |
| `--nav-item-height` | `36px` |
| `--menu-item-height` | `36px` |
| `--badge-height-sm` | `22px` |
| `--tab-height` | `36px` |
| `--table-row-height` | `44px` |
| `--table-header-height` | `36px` |
<!-- generated:controls:end -->

### Radius

<!-- generated:radii:start -->
| Token | Value |
| --- | --- |
| `--radius-2xs` | `2px` |
| `--radius-xs` | `6px` |
| `--radius-sm` | `8px` |
| `--radius-md` | `12px` |
| `--radius-lg` | `14px` |
| `--radius-xl` | `20px` |
| `--radius-full` | `9999px` |
<!-- generated:radii:end -->

## Behaviour every surface keeps

These hold whatever a component looks like:

- **Nothing moves on interaction.** Pagination, tabs, filters, sorting, loading
  and empty states keep their footprint; a select is as wide as its widest
  option; a pending button keeps its label's box.
- **The app has one component breakpoint**, `desktop:` (981px), and one shell
  breakpoint, `shell:` (1280px). Below 1280px the sidebar is the 61px icon
  rail, `AppGrid` halves and main-aside stack, quarters go 2 × 2 and the
  `FilterBar` puts its filters on a second row; a child spanning an AppGrid
  row spans at `shell:` too. Product components use no other breakpoint.
- **Atoms have one form.** Geometry lives in `components/ui` and
  `components/layout`; a feature folder composes them and sets no spacing,
  sized box, radius, `size=` or `padding=` (`layer-*` rules, unratcheted).
- **Charts** are `aria-hidden` with a written description; a null point is a
  gap, never a zero.
- **Accessibility.** WCAG 2.1 AA; visible keyboard focus (2px of
  `--color-focus`, offset 2px); meaning never by colour alone; all motion stops
  under `prefers-reduced-motion`; forced colours and print stay usable.
- **No heading ends in a full stop**, on any surface.

### Availability vocabulary

Use the state actually known; never punctuation alone or a fabricated zero.

| Label | Meaning |
| --- | --- |
| **Not measured** | No measurement exists |
| **Not run** | Workflow has not started |
| **Not set** | Missing user-configurable fact |
| **Unavailable** | Evidence/provider cannot supply a value |
| **Not applicable** | Field does not apply |
| **Unknown** | System cannot determine the state |

Observed zero remains `0`. Chart series keep unavailable-point gaps and explain
them accessibly. A state is written once where it is decided: a section whose
values share one state says so once, and its metric slots show the muted dash
(`MetricValue`) with the state as the accessible name. A metric cell in a table
uses `MissingValue` (a muted en dash, the state as assistive text, the reason on
hover and focus); it is never blank, because an empty cell and a measured zero
are opposite findings. State a shared reason once, on the column header or the
section. A table or chart with nothing to show uses one empty state that
distinguishes first use, no results, loading and error.

### Screen contracts

**Overview.** Useful before any audit. Project identity and warnings lead; the
widgets follow the project's saved layout (Project State with Track context;
Movement; one Next action; where you're missing; ranked actions and report
proof; Company facts) in a two-column grid, in the same DOM order at every
width. Editing lives in one Layout menu and per-widget controls overlay the
widget, so neither entering edit mode nor saving moves anything.

**AI Visibility.** Exactly three tabs: Trends (default), Sources, Query
fanouts. A backend token reaches a reader only through
`lib/visibility/vocabulary.ts`; an unmapped token renders as nothing. Run
bookkeeping stays out of the default view. One filter row, every control a
question a customer would ask. Trends shows Visibility, Share of voice and
Owned citation rate, one metric-selectable history chart and one competitor
table; a change column with nothing comparable is omitted. Prompt results
belong to the prompt row; Sources splits Domains and URLs on a segmented
control; Query fanouts is one table under a Group by control.

**Site Health.** The crawl control and URL inventory lead; Run new crawl before
and after a run, Stop crawl while one is active. Issues and Advisories are
separate (user-visible text never says "defect"); a rule's description states
the passing expectation and the rail leads with How to fix. "Stalled" needs
backend expired-lease evidence, never a browser timer. URL detail leads with
the page's issues, then scores; history opens in the right drawer.

**AEO Readiness.** Opens on a seven-dimension ledger, never a gauge;
not-applicable rows stay visible without failure styling.

**Website Changes.** An evidence ledger with four named classes and
before/after provenance; observed zero says "No changes were observed".

**Agent.** A full workspace in Agent mode. Queued, running, cancelled, failed
and stopped-at-limit are distinct states with Stop while active. Actions list by
deterministic priority (High, Medium, Low); neither chats nor Actions count
evidence sources. Context is one `ListScreen` whose subjects are its tabs.
