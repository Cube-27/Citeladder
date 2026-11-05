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
and never under 18px: on the website only the H1 and one heading per section
(D28), in the docs its headings, and in the app only the page title. Geist sets everything else, never above 500; Geist Mono sets data
and code. Fields, composers and cards wear a soft edge, never a dark hairline.
Light and dark on every surface, defaulting to the system preference.

## Decisions

| | Decision (owner, 5 November 2026) |
| --- | --- |
| D1 | Cal Sans, Geist and Geist Mono replace the previous faces. They are self-hosted from the private `Cube-27/cube27-fonts` repo through `pnpm fonts:pull`, never committed and never fetched from the web. |
| D2 | One theme store for the app, website and docs (`frontend/lib/theme/theme.ts`): light, dark or system, persisted in the `citeladder_theme` cookie on the parent domain so one choice follows the reader across subdomains. System is the default. |
| D3 | The logo drawing (`packages/contracts/src/brand-logo.ts`) is unchanged; its accent is Flare everywhere: the inline mark, `public/citeladder-logo.svg`, the favicon, the social card and the billing PDFs. |
| D4 | PDFs keep Inter as their text face; only their colours follow the system. |
| D5 | Borders are soft grey, never a dark hairline. Fields (Input, SearchField, Select, Textarea, ChipInput, the Agent composer, the docs search trigger) and checkbox and radio boxes wear a 1px `line` edge with the faint `shadow-edge` smudge under it (`FIELD_EDGE` in `components/ui/input.tsx`); hover steps the edge to `line-strong`, focus turns it `focus` with a 3px `line` halo, and an invalid field turns it `negative`. Reserved slots (the dashed create tile, Turnstile) take a dashed `line-strong` edge, and linked website cards step to `line-strong` on hover. `line-control` survives only for marks that are not borders: the switch's off track, the ink link underline, the pending step ring, chart rules, crosshairs and event markers, the neutral data swatch and a not-cited engine mark. |
| D6 | Geist is never set above 500 on any surface, the website included: the `heading` token, the title, item-title, figure and heading roles, Markdown `strong`, the docs' and the website's own styles are all 500, and the Geist and Geist Mono faces load only 400–500 (`lib/config/brand-fonts.json`). |
| D7 | In the app Cal Sans is the PageHeader title's (`type-page-title`) alone. Stat and score figures are `stat` (Geist 500 28/36 since D15), ScoreRing and donut centres Geist 500 32/38 (`type-figure-ring`), dialog and drawer titles `heading-lg` (Geist 500 22/28), and card titles and the sign-in shell's title Geist 500. The docs keep their display use; the website's is D28. |
| D8 | A score card shows its number in `stat` with a bare 48px `ScoreRing` (auto tone, no centre number) centred on its right; the 96px ring with its number is for a page's headline score. A table cell shows the number only. `ScoreBar` (the segmented score bar) is deleted from `components/ui` with its tests and exports, and `check:policy` rejects its name. |
| D9 | Metric cards sit in one row from the `desktop:` breakpoint: `AppGrid` quarters are 4 across at 982px, fifths 5, a pair 2; never 2 × 2 and never 2 + 1. |
| D10 | Corners are only slightly rounded on every surface: `radius-2xs` and `radius-xs` 2, `radius-sm` 4, `radius-md` 6, `radius-lg` and `radius-xl` 8. `radius-full` is for avatars, status dots, switch tracks and count pills only; a chip, citation pill, meter or progress track is a small radius. No corner anywhere is rounder than 8px. |
| D11 | The app is compact and technical (GitHub, Claude Code), not airy. Controls are `control-md` 32 on every surface (28 compact). The app's document (the one without `data-public-surface`) rebinds its spacing: table and fact rows `row-app` (40), card and dialog padding 16, header → controls 16, card gaps 12, gutter 24 (16 in the rail). The PageHeader title is `display-sm` (24/32) with its actions centred on its row (its band is D12's top bar). The sidebar has no logo; it shares the page's lines: the mode switch and palette field are level with the tabs and filter rows (`page-band-gap`, 8, apart). The docs and website keep their spacing. |
| D12 | The app's top bar is sticky and has no blank gap: the sidebar's project switcher cell and the PageHeader are one 56px bar (`page-header-band`: the `row-app` title row with 8 above and below) at the top of the window, ruled underneath with a 1px `line` that runs from the sidebar to the main column's far edge. Content scrolls under it; `sticky-header-offset` is its height, so sticky panes and in-page anchors land below it. The geometry census holds both halves of the bar on one bottom line. |
| D13 | A `TextLink` set at a type role stands in a list, table, row or card and is underlined only on hover and keyboard focus; one inside a sentence (`text="inherit"`) keeps its resting underline. A link in a list or table cell therefore takes its text's role, never `inherit`. |
| D14 | A ranked action row (`ReorderList`) is its position, its title and severity badge, and its move controls; it has no score figure, since the badge carries the priority. The title truncates (its full text in a tooltip) so the badge stays on its line. |
| D15 | A metric's number (`stat`) is 28/36, Geist 500; metric cards stay in one row (D9). `check:policy` holds the size. |
| D16 | A tab, segment or filter chip shows its count after the label in Geist at the control's size, `ink-muted`, in brackets (`ControlCount`): "All signals (107)". Never mono. |
| D17 | A card that is itself a control (the Agent's workflow cards) keeps the plain card's one fill; hover underlines its title instead of tinting it. Card titles in a grid of cards (workflows, skills) are `heading` (16/24, 500), under a `sectionTitle` section heading. |
| D26 | Website type: the marketing H1 (`--text-site-title`, every hero and article title) is 48/52 from 768px up, the owner's 982px desktop included, and 32/38 on phones, replacing D23's 42. Running text, blog and article prose included, is `body` 16/26; a lead or subheading under a heading is `body-lg` 18/30, never the 20px `lead`. Cal Sans is never tracked on the website or docs: display headings set no `letter-spacing`; Geist Mono eyebrows keep theirs. The app's tokens are unchanged. |
| D27 | No inverted cards or bands on the website: every tile, PageHighlight included, is the flat card (surface fill, 1px `line` edge, ink text) in both themes; only ink-filled buttons stay ink. Nav popups for multi-column menus (Platform, Resources) start at the navbar's left edge; one-column Solutions still hangs from the trigger row (owner, 5 November 2026; supersedes D22's anchor for those two). |
| D28 | Cal Sans is for headings only on the website: the H1 and one section heading per section; card titles, figures and every other text are Geist (owner, 5 November 2026). Card, step, form and tool titles and article h3 are `heading-lg` (Geist 500 22/28); FAQ questions, plan names and the author's name keep `title-sm`'s size in Geist 500; stacked split titles, large tiles and the PageHighlight title keep `display-md`'s size in Geist 500; figures and prices are Geist 500; article quotes are Geist. A feature split that is its section's only heading keeps Cal Sans. `check:policy` rejects `--font-display` in a website stylesheet outside the heading selectors. |

D5–D17 come from the owner's reviews of the shipped app and docs on 5 November
2026; `frontend/scripts/design-system-review-checks.mjs` keeps them in
`pnpm check:policy`. D18–D25 are the website review rounds in the
[rollout plan](plans/design-system-rollout.md); D26 is the owner's website
type rule of the same day.

## Ownership

| Owner | Responsibility |
| --- | --- |
| `frontend/apps/app/src/globals.css` | Every token (the single `@theme`, `:root` and `:root[data-theme='dark']`), the marketing site's responsive `--text-site-*` display sizes, the type roles (`.type-*`), focus, motion and the shared component geometry derived from the tokens |
| `frontend/scripts/design-system-tokens.json` | The artifact's `tokens.json`, verbatim: the contract `globals.css` is checked against |
| `frontend/lib/config/brand-fonts.json` | The three faces by role (`display`, `sans`, `mono`), their files and revision in the font repo; `pnpm fonts:pull` writes the metric-matched fallbacks |
| `frontend/lib/fonts/brand-fonts.ts` | The `@font-face` rules and fallbacks each runtime (the app's Vite build, `PublicFonts.astro`) loads |
| `frontend/lib/theme/theme.ts`, `frontend/public/theme-preference.js` | The theme preference and the pre-paint bootstrap every surface runs |
| `frontend/components/ui/logo-mark.tsx`, `packages/contracts/src/brand-logo.ts` | The logo, drawn inline in ink (`currentColor`) and the accent |
| `frontend/components/ui/`, `frontend/components/layout/` | The app's components and shell, composed by feature folders that set no geometry of their own |
| `frontend/apps/marketing/src/site.css`, `frontend/components/marketing/chrome/`, `frontend/components/marketing/sections/` | The website's components: SiteNav, SiteFooter, CookieBanner, Breadcrumbs, AnnouncementPill and the page sections, the system's `cl-*` geometry on the tokens above, and the website's type roles (the `cl-*` titles, lead, body and note) |
| `frontend/apps/marketing/src/screens.css`, `frontend/components/marketing/screens/` | The website's product images: ProductFrame and the `Screen*` components, app views at a fixed natural size (the list is under "Website product images" in Screen contracts) composed from `components/ui` and scaled whole to fit their frame (never cropped), with their demo data in one typed module; the home page's first view (`ScreenAppVisibility`, D25) is the whole app at 1440 × 820, its chrome drawn at the app's density |
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
  every stylesheet; in the app no class or role but `type-page-title` sets it
  (D7), and on the website only the hero, article, section, CTA, index-group
  and lone-split headings and the prose h2 set it (D28).
- **Geist is never above 500** on any surface: no `font-semibold` or
  `font-bold`, no 600 or 700 (D6).
- **Soft edges.** `line-control` appears only in the non-border mark owners
  listed under D5; no field, box, card or slot edge wears it.
- **One-row metrics.** No grid adds columns between `desktop:` and `shell:`,
  so a row of figures never wraps at 982px (D9).
- **Slightly rounded.** `rounded-full` and `var(--radius-full)` appear only on
  avatars, status dots, switch tracks and count pills, and no stylesheet sets
  a corner rounder than 8px (D10).
- **Compact app.** `globals.css`'s `:root:not([data-public-surface])` block
  holds the D11 values (table rows `row-app`, card and dialog padding 16,
  section gap 16, card gap 12), `.type-page-title` is `display-sm`, and the
  app sidebar draws no logo. The tables below show the system's `:root`
  values, which the website and docs keep.
- **Flare is a mark.** No `bg-`, `from-`, `via-` or `to-accent` larger than a
  2px mark, no accent background on a box over 4px, no heading in accent.
  Primary actions are ink; a highlighted surface is `accent-soft`.
- **The website's H1 is the ceiling.** No website or docs type exceeds 48px (D26).
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
| `--color-line-strong` | `#d4d4d4` | `#3a3a3a` |
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
`textRole()` in `components/ui/typography.tsx`; the website roles are the
`cl-*` title, lead, body and note classes in `site.css`.

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
| `.type-figure` | product | `28px / 36px` | — |
| `.type-figure-ring` | product | `32px / 38px` | — |
| `.type-figure-sm` | product | `16px / 24px` | — |
| `.type-item-title` | product | `16px / 24px` | — |
| `.type-label` | product | `14px / 20px` | — |
| `.type-page-title` | product | `24px / 32px` | — |
| `.type-section-title` | product | `22px / 28px` | — |
| `.cl-body` | public | `16px / 26px` | — |
| `.cl-fcard-title` | public | `22px / 28px` | — |
| `.cl-lead` | public | `18px / 30px` | — |
| `.cl-lhero-title` | public | `48px / 52px` | — |
| `.cl-note` | public | `14px / 20px` | — |
| `.cl-phero-title` | public | `48px / 52px` | — |
| `.cl-shead-title` | public | `36px / 42px` | — |
<!-- generated:type:end -->

### Controls and layout

<!-- generated:controls:start -->
| Token | Value |
| --- | --- |
| `--container-site` | `1320px` |
| `--container-app` | `1440px` |
| `--container-thread` | `1040px` |
| `--container-prose` | `720px` |
| `--container-narrow` | `560px` |
| `--control-sm` | `28px` |
| `--control-md` | `32px` |
| `--control-lg` | `48px` |
| `--nav-height` | `64px` |
| `--sidebar-width` | `248px` |
| `--nav-item-height` | `32px` |
| `--menu-item-height` | `32px` |
| `--badge-height-sm` | `22px` |
| `--tab-height` | `32px` |
| `--table-row-height` | `44px` |
| `--table-header-height` | `32px` |
<!-- generated:controls:end -->

### Radius

<!-- generated:radii:start -->
| Token | Value |
| --- | --- |
| `--radius-2xs` | `2px` |
| `--radius-xs` | `2px` |
| `--radius-sm` | `4px` |
| `--radius-md` | `6px` |
| `--radius-lg` | `8px` |
| `--radius-xl` | `8px` |
| `--radius-full` | `9999px` |
<!-- generated:radii:end -->

## Behaviour every surface keeps

These hold whatever a component looks like:

- **Nothing moves on interaction.** Pagination, tabs, filters, sorting, loading
  and empty states keep their footprint; a select is as wide as its widest
  option; a pending button keeps its label's box.
- **The app has one component breakpoint**, `desktop:` (981px), and one shell
  breakpoint, `shell:` (1280px). Below 1280px the sidebar is the 57px icon
  rail, `AppGrid` halves and main-aside stack, the KPI layouts (quarters,
  fifths, pair, thirds) stay one row from `desktop:` and the `FilterBar` puts
  its filters on a second row; a child spanning an AppGrid
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

**Website product images.** A `Screen*` is laid out once at its natural size
and `ProductFrame` shows all of it: the frame's well takes the screen's ratio
with even padding and scales the screen down to the well's width (CSS
container query units, no script, no layout shift), never up and never
cropped, so no text is cut at any viewport. The frame and the FeatureCard
around it are flat: a 1px soft border, radius at most 8px, no shadow; in a
FeatureCard the well sits straight in the card above an optional step number,
the title, body and link. A screen whose text would be too small once scaled
is redesigned smaller, never cropped.

A screen's natural size is a width and a height, each from a short list:
`ScreenRoot` takes both and screens.css maps them to one class per width
(`cl-screen--w480`, `--w640`, `--w800`, `--w960`, `--w1200`) and one per
height (`cl-screen--h320`, `--h360`, `--h400`, `--h500`, `--h600`,
`--h680`). The sizes in use:

- 1200 × 680: a full-width screen.
- 960 × 600: a screen in a split or tile that needs the room.
- 800 × 500: one list of rows wide enough for its labels (Actions).
- 640 × 400: a card image (a split, tile or feature card) of one focused
  element: one table of 4–6 rows and at most 4 columns, or one answer, with
  no tabs, toolbars, pagination or second pane, so it renders at its natural
  size in a split at 982 and 1440 and only scales down on narrower wells.
- 480 wide: a vignette, one focused element (three figures over one small
  chart, a list of 3 to 5 rows on a fixed column template, one panel or one
  exchange) with no tabs, toolbars, filters, rails, pagination or second
  pane, so it shows at 1:1 in a split and at 0.9 or more in a span-7 tile at
  982px (text at least 11px). Its height fits its content: 320 for a short
  stack or one exchange, 360 for figures over a chart or a 3 to 5 row list,
  400 for a large-type panel (a title, one line under it, three or four rows
  in `title-sm`) that still reads at 11px scaled down to a 300px tile.
- 1440 × 820: the home page's app in its chrome (`cl-screen--app`).

A new size adds its width or height to both lists rather than a new
width class with its own height; a vignette takes the shortest height its
content fills without a gap.
