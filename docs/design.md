# CiteLadder Design System

> Canonical visual and interaction contract for marketing, authentication, onboarding, and the authenticated application. This is the only design-system document.

Existing owners govern production workflows. Visual work must not change factual copy, data, feature claims, scripted preview content, transactions, or explicit confirmation gates without approval. Unresolved instructions from the supplied contract are recorded at the end; consolidation does not decide them.

Tests verify shared ownership, accessibility, and product correctness—not exact classes, fonts, pixels, or CSS recipes as a second visual authority.

## Direction and identity

CiteLadder (`citeladder.com`) is an evidence-led enterprise system. Its **Prism Evidence Workspace** puts neutral ground behind the chrome and a distinct work surface behind the content, using navy ink in light mode, Emerald actions by default, semantic evidence washes, useful density, and deliberate negative space. Prioritise current state → movement → next action → evidence, not equal-weight KPI cards. Voice is direct, confident, specific, and evidence-led: one idea per sentence.

- **Logo:** `frontend/components/ui/logo-mark.tsx` owns every surface's lockup: `frontend/public/citeladder-logo.svg` for the wordmark and the matching inline glyph for mark-only mode. `BRAND_LOGO_SIZES` owns standard heights; explicit `size` supports exceptional layouts. The mark inherits `currentColor`; non-empty `alt` supplies either rendering's accessible name. `frontend/public/citeladder-favicon.ico` owns browser/installable-app icons with the same black silhouette across frames.
- **Typography:** self-hosted variable faces on every surface: Switzer (sans) for body, UI and data type, Sora (sans) for headings and display roles, both capped at weight 600 by their `@font-face` ranges; 14px working baseline. Each semantic role owns size, leading, weight, tracking, and ink together. In the product, hierarchy comes from size and weight together through the closed `.type-*` roles (see Product app ladder); field text is 16px (`--text-field`, 14px on public surfaces).
- **Icons:** Lucide only; import concepts from `frontend/lib/icons.ts` where available. Call sites set size only: `size-3`/`size-3.5` for dense tables, toolbars, and chips; `size-4` for chrome; `size-5` for empty states and marketing wells; larger only for decorative marks. The global stroke ladder derives approximately 1.3px stems from size. Keep `currentColor`; do not override stroke weight locally.
- **Surface identity:** Light is the default. The app and onboarding headers carry a one-click circular light/dark toggle beside the account menu (`frontend/lib/theme/theme.ts` owns the per-device preference; the semantic tokens rebind under `[data-theme='dark']`). There is no automatic system-theme following. Marketing is light-only and never applies the preference. Emerald is the sole action accent on public and product surfaces. The logo and provider marks retain their fixed brand colours. The app uses a sidebar rail below neutral workspace ground, with paper cards and tables above it; auth and onboarding retain a centred paper task column against neutral ground. Dark mode keeps the same tonal order in near-black neutrals. Controls retain white fills and distinct edges in light mode. Marketing and docs remain light-only with their own editorial ink.

## Source of truth and implementation rules

| Owner | Responsibility |
| --- | --- |
| `frontend/apps/app/src/globals.css` | Global tokens, shared geometry, interaction rules, animations, and the single `@theme` definition |
| `frontend/apps/app/index.html` and `frontend/components/marketing/chrome/PublicFonts.astro` | Self-hosted Switzer/Sora loading (`--font-text`, `--font-heading`) and fallbacks in each runtime |
| `frontend/scripts/pull-licensed-fonts.mjs` | The licensed font list; copies the binaries from the private `Cube-27/cube27-fonts` repo, which the public repo must never contain |
| `frontend/apps/app/src/website-type.css` | Imported public/auth/onboarding type roles and focused-flow geometry; same font and semantic palette |
| `frontend/components/ui/` | Shared controls, typography, layout, panels, and overlays |
| `frontend/components/marketing/` | Existing marketing primitives |
| `frontend/components/layout/nav-items.ts` | The shared navigation registry |

Do not add raw hex colours, `@theme`, shared control recipes, or unregistered animations outside `globals.css`. Homepage-only neutral and preview values belong to the scoped `.cl-landing` tokens there; shared chrome and other marketing pages keep the semantic palette. Do not redefine shared geometry per surface. Reuse primitives before creating another. Public/auth type roles may have their own scale; embedded product previews reset to the app ladder.

`pnpm check:policy` guards raw colours, stray `@theme`, legacy identifiers, ownership boundaries, `font-*` weights, raw text sizes, leading, tracking and faces outside `components/ui/`, the retired `subtle` ink, off-grid spacing, alpha-faded borders, size-named radii (`rounded-sm|md|lg|xl`), and per-surface geometry redeclarations. Tailwind's default radius scale is cleared in `@theme`. The capability/ownership map remains in [frontend-architecture.md](frontend-architecture.md), under Component capability.

## Colour

Consume semantic roles, never page-local values.

| Role | Tokens and values | Use |
| --- | --- | --- |
| Ground and rail | `background`, `shell` `#F3F5F7`; `sidebar` `#E9EDF1` | Neutral workspace ground and the lower sidebar rail in light mode |
| Structure | `panel-tonal`, `background-alt` `#F7F9FB`; `well`, `active` `#E9EDF1` | Insets, wells, tonal panels; hover/selected states |
| Paper | `panel`, `input`, `elevated` `#FFFFFF` | Work surfaces, inputs, semantic objects, overlays |
| Ink | `foreground` `#0F172A`; `secondary` `#334155`; `muted` `#5B6678` | Three clearly separated inks: titles and values; sentences; labels and metadata. The former fourth rung, `subtle`, resolves to `muted` and is retired. |
| Boundaries | `border-subtle` `#E5E9EF`; `border` `#D3DAE4`; `border-strong` `#C3CCD9`; `border-bold` `#8A95A5` | `border-subtle` divides rows or peers *inside* one surface; `border` bounds controls, inset white panels and overlays, and divides a table header from its rows; `border-strong` is deliberate emphasis; `border-bold` bounds inputs. Default cards and table wrappers use fill contrast instead. |
| Selection | `track` `#E6EAF0`; `selected` `#FFFFFF`; `shadow-selected` | The recessed groove of a segmented control and the raised paper of the selected item on it or in navigation. |
| Interaction | Emerald: forest `#14532D`; hover `#166534`; pressed `#0B3D20`; brand `#16A34A`; soft `#F0FDF4`; line `#86EFAC`. | Primary actions on every surface, links, tabs, selection, active navigation, focus, first chart series |
| Evidence | success, warning, error, info, `chart-secondary`, `chart-grid` | Persisted status/data, always labelled or paired with an icon |

Hierarchy is carried by boundary and tone, not by elevation: the app's rail, ground and paper are distinct fills, while an inset box may use an edge. Shadow is reserved for surfaces that genuinely float (menus, sheets, dialogs, tooltips) and for the raised selected item (`shadow-selected`). A `Card` has no resting shadow.

**Borders.** A line may draw the edge of an inset white panel, status card, overlay, control or field, or divide rows and peers inside one surface (including the full-width rule closing each page band). Default cards and table wrappers have no outer border: their paper fill separates them from workspace ground. Selection is fill plus `shadow-selected`, never an outline or a leading bar. Tinted inset boxes use their fill as the boundary; status cards retain a hairline to carry meaning. Sections are separated by space, not by a rule above or around them. The workspace pane has no seam against the ground. Lines use a token at full strength, never an alpha-faded colour.

Reading text must meet 4.5:1 contrast. `subtle` metadata belongs on reading surfaces; active/tonal surfaces use `muted` or `ink` to retain contrast. Cyan, coral, lime, and amber express evidence/status, not route decoration. Never communicate meaning through colour alone.

Marketing subpages use the semantic public canvas, centred Sora hero, quiet surface bands, and the shared full-width dark footer. The homepage uses a white canvas with distinct neutral bands and capability-tinted wells, with scoped aliases resolving to shared semantic roles. The owner-scoped `[data-public-surface]` rebind deepens light-mode inks and strengthens hairlines. Use divided hairlines unless a tonal band's edge provides meaningful separation. Functional evidence colours stay in product data and previews.

The homepage may use marketing-only geometry roles: `--radius-marketing-card` (20px), `--radius-marketing-well` (16px), `--radius-marketing-preview` (24px), and `--radius-marketing-control` (10px). The homepage shares the public container measure (`max-w-7xl` plus `--site-gutter`) with the navigation and footer. White capability and integration objects sit on neutral edges; each capability owns one identity hue (`--cl-hue-*`: visibility blue, sources green, site health indigo, demand teal, content orange, MCP pink) that `landing.css` derives into a tint for its wells and an ink for its labels, icons and bars; everything else uses the accent-tinted `--cl-well`. Identity hues never carry actions, which stay Emerald. Section heads stack a single-line heading over the lead; embedded sub-headings stay a rung below the section heading. Homepage headings use weight 500 at most. Product data and status colours retain their own meaning. These roles do not change the authenticated application's 8px `--radius-card` contract.

## Token contract

The surface ladder is ground → resting panel → recessed well, with `elevated`
reserved for detached floating surfaces. State tints follow the surface they
modify: mix primary ink into that surface at 4% for hover, 8% for selection,
12% for pressed feedback, and 3% for disabled fill. The source surface classes
own this derivation in `globals.css`. Selected and pressed labels use primary
ink; dark chrome uses neutral tints rather than an accent wash.

Every application-owned color token has exactly one class and purpose below.
Light/dark values are the effective product defaults; state values show the
panel context and rederive on input, well, track, rail and overlay surfaces.
Public canvases and feature bands retain their separately scoped counterparts.
`node frontend/scripts/audit-design-tokens.mjs` inventories values and current
consumers without becoming another value authority.

| Token | Class | Purpose | Position | Light | Dark |
| --- | --- | --- | --- | --- | --- |
| `--color-accent` | brand | Sole product action accent | Action layer | `#14532d` | `#76df9c` |
| `--color-accent-active` | state-tint | Pressed solid action fill | Action layer | `#0b3d20` | `#b2f4c6` |
| `--color-accent-border` | border | Boundary of a tinted action | Action layer | `#86efac` | `rgb(118 223 156 / 45%)` |
| `--color-accent-fg` | ink | Label on solid accent | On accent fill | `#ffffff` | `#0d2618` |
| `--color-accent-hover` | state-tint | Hovered solid action fill | Action layer | `#166534` | `#94ebb0` |
| `--color-accent-soft` | state-tint | Quiet action or recommendation wash | Action on panel | `#f0fdf4` | `rgb(118 223 156 / 12%)` |
| `--color-accent-subtle` | state-tint | Stronger action-selection wash | Action on panel | `#dcfce7` | `rgb(118 223 156 / 18%)` |
| `--color-accent-text` | ink | Readable action/link text | On neutral surfaces | `#14532d` | `#86e5a6` |
| `--color-active` | state-tint | Pressed neutral surface | Surface + 12% primary ink | `#e2e3e5` | `#303030` |
| `--color-atmosphere-blue` | brand | atmosphere blue identity wash | Fixed mark or separate public decoration | `rgb(219 234 248 / 55%)` | `rgb(219 234 248 / 55%)` |
| `--color-atmosphere-green` | brand | atmosphere green identity wash | Fixed mark or separate public decoration | `rgb(214 236 222 / 60%)` | `rgb(214 236 222 / 60%)` |
| `--color-background` | surface | Page ground | Ground | `#f3f5f7` | `#111111` |
| `--color-background-alt` | surface | Public alternating canvas or neutral inset | Ground/inset | `#f7f9fb` | `#1e1e1e` |
| `--color-band-indigo` | surface | Public indigo feature canvas | Public ground | `#1b1938` | `#1b1938` |
| `--color-band-teal` | surface | Public teal feature canvas | Public ground | `#0e3030` | `#0e3030` |
| `--color-border` | border | Control, inset and overlay boundary | Between surfaces | `#d3dae4` | `#343434` |
| `--color-border-bold` | border | Small choice-control boundary | Inside panel | `#8a95a5` | `#76766f` |
| `--color-border-strong` | border | Emphasized or hovered boundary | Between surfaces | `#c3ccd9` | `#5c5c59` |
| `--color-border-subtle` | border | Divider within one surface | Inside surface | `#e5e9ef` | `#272727` |
| `--color-brand-claude` | brand | brand claude identity | Fixed mark or separate public decoration | `#d97757` | `#d97757` |
| `--color-brand-forest` | brand | brand forest identity | Fixed mark or separate public decoration | `#16a34a` | `#16a34a` |
| `--color-brand-gemini` | brand | brand gemini identity | Fixed mark or separate public decoration | `#4285f4` | `#4285f4` |
| `--color-brand-google-blue` | brand | brand google blue identity | Fixed mark or separate public decoration | `#4285f4` | `#4285f4` |
| `--color-brand-google-green` | brand | brand google green identity | Fixed mark or separate public decoration | `#34a853` | `#34a853` |
| `--color-brand-google-red` | brand | brand google red identity | Fixed mark or separate public decoration | `#ea4335` | `#ea4335` |
| `--color-brand-google-yellow` | brand | brand google yellow identity | Fixed mark or separate public decoration | `#fbbc05` | `#fbbc05` |
| `--color-brand-openai` | brand | brand openai identity | Fixed mark or separate public decoration | `#10a37f` | `#10a37f` |
| `--color-canvas-soft` | surface | Public alternating soft canvas | Public ground | `#f7f9fb` | `#161616` |
| `--color-chart-1` | data-viz | Categorical chart series 1 | Observed data layer | `#16a34a` | `#76df9c` |
| `--color-chart-2` | data-viz | Categorical chart series 2 | Observed data layer | `#00a9c5` | `#75cee1` |
| `--color-chart-3` | data-viz | Categorical chart series 3 | Observed data layer | `#f59e0b` | `#efc676` |
| `--color-chart-4` | data-viz | Categorical chart series 4 | Observed data layer | `#ff6e56` | `#f49a8b` |
| `--color-chart-5` | data-viz | Categorical chart series 5 | Observed data layer | `#9acd32` | `#b8db73` |
| `--color-chart-6` | data-viz | Categorical chart series 6 | Observed data layer | `#8b5cf6` | `#bca4f6` |
| `--color-chart-7` | data-viz | Categorical chart series 7 | Observed data layer | `#14532d` | `#9ce5ba` |
| `--color-chart-8` | data-viz | Categorical chart series 8 | Observed data layer | `#64748b` | `#a3a39d` |
| `--color-citation-competitor` | data-viz | citation competitor evidence encoding | Observed data layer | `#00a9c5` | `#75cee1` |
| `--color-citation-owned` | data-viz | citation owned evidence encoding | Observed data layer | `#c15f3c` | `#f49a8b` |
| `--color-citation-third-party` | data-viz | citation third party evidence encoding | Observed data layer | `#6b6b72` | `#a3a39d` |
| `--color-danger` | semantic-status | danger status mark | Labelled status layer | `#b42332` | `#f3979e` |
| `--color-danger-bg` | semantic-status | danger bg | Labelled status layer | `#fff0f1` | `rgb(243 151 158 / 13%)` |
| `--color-danger-border` | semantic-status | danger border | Labelled status layer | `#f2c6cb` | `rgb(243 151 158 / 38%)` |
| `--color-danger-fg` | semantic-status | danger fg | Labelled status layer | `#ffffff` | `#350b10` |
| `--color-danger-solid` | semantic-status | danger solid | Labelled status layer | `#b42332` | `#d95767` |
| `--color-danger-solid-hover` | semantic-status | danger solid hover | Labelled status layer | `#8f1d29` | `#eb7481` |
| `--color-danger-text` | semantic-status | danger text | Labelled status layer | `#b42332` | `#f6abb1` |
| `--color-disabled` | state-tint | Disabled neutral control fill | Surface + 3% primary ink | `#f8f8f9` | `#20201f` |
| `--color-elevated` | surface | Detached floating overlay | Above ground/panel | `#ffffff` | `#262626` |
| `--color-foreground` | ink | Primary reading text | On neutral surfaces | `#0f172a` | `#d2d2d0` |
| `--color-gsc-clicks` | data-viz | gsc clicks evidence encoding | Observed data layer | `#1a73e8` | `#8ab4f8` |
| `--color-gsc-ctr` | data-viz | gsc ctr evidence encoding | Observed data layer | `#00897b` | `#4db6ac` |
| `--color-gsc-impressions` | data-viz | gsc impressions evidence encoding | Observed data layer | `#673ab7` | `#c58af9` |
| `--color-gsc-position` | data-viz | gsc position evidence encoding | Observed data layer | `#e65100` | `#ff8a65` |
| `--color-hairline-warm` | border | Public editorial boundary | Public surfaces | `#e8e4dd` | `#343434` |
| `--color-hover` | state-tint | Hovered neutral surface | Surface + 4% primary ink | `#f5f6f6` | `#212121` |
| `--color-info` | semantic-status | info status mark | Labelled status layer | `#24476b` | `#8ad4e1` |
| `--color-info-bg` | semantic-status | info bg | Labelled status layer | `#eef5fa` | `rgb(138 212 225 / 13%)` |
| `--color-info-border` | semantic-status | info border | Labelled status layer | `#c8d9e8` | `rgb(138 212 225 / 38%)` |
| `--color-info-text` | semantic-status | info text | Labelled status layer | `#24476b` | `#a5e2eb` |
| `--color-input` | surface | Field interior | Inside panel boundary | `#ffffff` | `#141414` |
| `--color-muted` | ink | Helpers, metadata and disabled labels | On reading surfaces | `#5b6678` | `#999996` |
| `--color-neutral-bg` | surface | Neutral badge or progress track | Inside panel | `#e9edf1` | `#222222` |
| `--color-on-inverse` | ink | Label on inverse surface | On surface-inverse | `#ffffff` | `#0d2618` |
| `--color-overlay-scrim` | surface | Modal backdrop | Between ground and modal | `rgb(20 33 61 / 45%)` | `rgb(0 0 0 / 72%)` |
| `--color-panel` | surface | Resting content or chrome | On ground | `#ffffff` | `#1a1a1a` |
| `--color-panel-tonal` | surface | Tonal resting panel or control band | On ground/panel | `#f7f9fb` | `#1e1e1e` |
| `--color-run-analyzing` | semantic-status | Persisted run analyzing mark | Labelled status layer | `#c15f3c` | `#efc676` |
| `--color-run-cancelled` | semantic-status | Persisted run cancelled mark | Labelled status layer | `#6b6b72` | `#a3a39d` |
| `--color-run-completed` | semantic-status | Persisted run completed mark | Labelled status layer | `#9acd32` | `#b8db73` |
| `--color-run-draft` | semantic-status | Persisted run draft mark | Labelled status layer | `#6b6b72` | `#a3a39d` |
| `--color-run-failed` | semantic-status | Persisted run failed mark | Labelled status layer | `#ff6e56` | `#f49a8b` |
| `--color-run-partial` | semantic-status | Persisted run partial mark | Labelled status layer | `#f59e0b` | `#efc676` |
| `--color-run-queued` | semantic-status | Persisted run queued mark | Labelled status layer | `#6b6b72` | `#a3a39d` |
| `--color-run-running` | semantic-status | Persisted run running mark | Labelled status layer | `#00a9c5` | `#75cee1` |
| `--color-score-good-ring` | data-viz | score good ring evidence encoding | Observed data layer | `#00a9c5` | `#75cee1` |
| `--color-score-good-text` | data-viz | score good text evidence encoding | Observed data layer | `#155e75` | `#a5e2eb` |
| `--color-score-high` | data-viz | score high evidence encoding | Observed data layer | `#9acd32` | `#b8db73` |
| `--color-score-high-ring` | data-viz | score high ring evidence encoding | Observed data layer | `#9acd32` | `#b8db73` |
| `--color-score-high-text` | data-viz | score high text evidence encoding | Observed data layer | `#3f6212` | `#a4edbd` |
| `--color-score-low-ring` | data-viz | score low ring evidence encoding | Observed data layer | `#ff6e56` | `#f49a8b` |
| `--color-score-low-text` | data-viz | score low text evidence encoding | Observed data layer | `#9a3412` | `#f6abb1` |
| `--color-score-mid-ring` | data-viz | score mid ring evidence encoding | Observed data layer | `#f59e0b` | `#efc676` |
| `--color-score-mid-text` | data-viz | score mid text evidence encoding | Observed data layer | `#b45309` | `#f7d99e` |
| `--color-secondary` | ink | Secondary reading text | On neutral surfaces | `#334155` | `#c0c0be` |
| `--color-selected` | state-tint | Selected neutral surface | Surface + 8% primary ink | `#ececee` | `#292929` |
| `--color-selection` | state-tint | Native text selection highlight | On reading surface | `#86efac` | `rgb(118 223 156 / 35%)` |
| `--color-selection-fg` | ink | Text within native selection | On selection highlight | `#0f172a` | `#faf9f5` |
| `--color-sentiment-negative` | data-viz | sentiment negative evidence encoding | Observed data layer | `#ff6e56` | `#f49a8b` |
| `--color-sentiment-negative-bg` | data-viz | sentiment negative bg evidence encoding | Observed data layer | `#fff3f0` | `rgb(243 151 158 / 13%)` |
| `--color-sentiment-negative-text` | data-viz | sentiment negative text evidence encoding | Observed data layer | `#9a3412` | `#f6abb1` |
| `--color-sentiment-neutral` | data-viz | sentiment neutral evidence encoding | Observed data layer | `#6b6b72` | `#a3a39d` |
| `--color-sentiment-neutral-bg` | data-viz | sentiment neutral bg evidence encoding | Observed data layer | `#f4f4f1` | `#222222` |
| `--color-sentiment-neutral-text` | data-viz | sentiment neutral text evidence encoding | Observed data layer | `#3a3a40` | `#c0c0be` |
| `--color-sentiment-positive` | data-viz | sentiment positive evidence encoding | Observed data layer | `#9acd32` | `#b8db73` |
| `--color-sentiment-positive-bg` | data-viz | sentiment positive bg evidence encoding | Observed data layer | `#f4f8ec` | `rgb(128 223 162 / 13%)` |
| `--color-sentiment-positive-text` | data-viz | sentiment positive text evidence encoding | Observed data layer | `#3f6212` | `#a4edbd` |
| `--color-shell` | surface | Workspace/focused-flow ground | Ground | `#f3f5f7` | `#111111` |
| `--color-shell-alt` | surface | Stronger shell inset | Inside ground | `#e9edf1` | `#161616` |
| `--color-sidebar` | surface | Navigation rail | Below ground | `#e9edf1` | `#0a0a0a` |
| `--color-success` | semantic-status | success status mark | Labelled status layer | `#166534` | `#80dfa2` |
| `--color-success-bg` | semantic-status | success bg | Labelled status layer | `#edf7ed` | `rgb(128 223 162 / 13%)` |
| `--color-success-text` | semantic-status | success text | Labelled status layer | `#166534` | `#a4edbd` |
| `--color-surface-inverse` | surface | Inverse floating tooltip surface | Floating overlay | `#14532d` | `#76df9c` |
| `--color-tile-blue` | brand | tile blue identity | Fixed mark or separate public decoration | `#e0f2fe` | `#e0f2fe` |
| `--color-tile-blue-ink` | brand | tile blue ink identity | Fixed mark or separate public decoration | `#0284c7` | `#0284c7` |
| `--color-tile-green` | brand | tile green identity | Fixed mark or separate public decoration | `#dcfce7` | `#dcfce7` |
| `--color-tile-green-ink` | brand | tile green ink identity | Fixed mark or separate public decoration | `#16a34a` | `#16a34a` |
| `--color-tile-indigo` | brand | tile indigo identity | Fixed mark or separate public decoration | `#ede9fe` | `#ede9fe` |
| `--color-tile-indigo-ink` | brand | tile indigo ink identity | Fixed mark or separate public decoration | `#4f46e5` | `#4f46e5` |
| `--color-tile-purple` | brand | tile purple identity | Fixed mark or separate public decoration | `#ffede8` | `#ffede8` |
| `--color-tile-purple-ink` | brand | tile purple ink identity | Fixed mark or separate public decoration | `#ea580c` | `#ea580c` |
| `--color-track` | surface | Recessed segmented-control track | Inside control | `#e6eaf0` | `#141414` |
| `--color-warning` | semantic-status | warning status mark | Labelled status layer | `#8a4600` | `#f2c879` |
| `--color-warning-bg` | semantic-status | warning bg | Labelled status layer | `#fff5db` | `rgb(242 200 121 / 13%)` |
| `--color-warning-text` | semantic-status | warning text | Labelled status layer | `#8a4600` | `#f7d99e` |
| `--color-well` | surface | Recessed evidence or inset | Inside panel | `#e9edf1` | `#0e0e0e` |

## Typography

Sora headings use normal letter spacing, without custom tracking. The homepage H1 steps down by 2px at the mobile breakpoint (540px and below).

Use Switzer for text and figures and Sora for the page title and public headings; metrics, dates, ranks, and percentages use tabular numerals, not monospace. Switzer's default digits are already tabular, so numbers stay out of the display face. Weights are 400 (sentences), 500 (labels, controls, badges) and 600 (titles, figures). Do not assemble page-local size/weight/ink hierarchies.

### Website and focused-flow ladder

Roles own all typography properties. The general ladder is mobile-first: base below 700px, with 700px and 981px step-ups where defined. Ordinary paragraphs stay at or above 14px, except the compact homepage editorial ladder below 540px, where short supporting paragraphs step down by 2px. Prose measure is 45–75 characters, except the documentation article column, which can reach 85ch to sit closer to its side navigation; long paragraphs never use accent ink. Body tracking is zero; large text uses calm leading.

| Role | Size / line height | Weight | Tracking | Ink |
| --- | --- | --- | --- | --- |
| Flow group title | 16/24px | 600 | -0.2px | `ink-strong` |
| Flow help | 14/20px | 400 | 0 | `muted` |
| Flow metadata | 12/16px | 500 | 0 | `muted`, tabular |
| Lead | 18/26px | 400 | 0 | `ink` |
| Large body | 16/22px | 400 | 0 | `ink` |
| Body baseline | 14/20px | 400 | 0 | `ink` |
| Navigation/actions | 14/20px | 500 | 0 | `ink` or inverse |
| Label/caption/eyebrow | 13/18px | 400–500 | 0 | `muted` or `subtle` |

`website-data-display` is pricing-only: Switzer 500, tabular, 30/36px → 40/46px at 768px. Never apply it to prose or headings.

### Product app ladder

The roles are `.type-*` classes in `globals.css` (components layer, so a status utility such as `text-danger-text` can still set the ink). Reach them through `textRole(role, layoutClasses?)` from `components/ui/typography.tsx` or the class itself; name the text's job rather than overriding its typography. Call sites outside `components/ui/` never set a size, leading, tracking, face or weight.

| Role | Class | Job | Size / line height | Weight | Ink |
| --- | --- | --- | --- | --- | --- |
| `pageTitle` | `type-page-title` | The route H1, one per page | 18/24, display | 600 | `foreground` |
| `figure` | `type-figure` | A metric value | 24/32, display, tabular | 600 | `foreground` |
| `sectionTitle` | `type-section-title` | Section, card, drawer and dialog headings | 16/24 | 600 | `foreground` |
| `figureSm` | `type-figure-sm` | A value in a dense row or cell | 16/24, tabular | 600 | `foreground` |
| `itemTitle` | `type-item-title` | Row, list-item and insight titles | 14/20 | 600 | `foreground` |
| `body` | `type-body` | Sentences, descriptions, table cells | 14/20 | 400 | `secondary` |
| `control` | `type-control` | Buttons, navigation, tabs, links | 14/20 | 500 | by state |
| `label` | `type-label` | Names a value: metric, field and column labels | 13/18 | 500 | `muted` |
| `caption` | `type-caption` | Timestamps, counts, help, footnotes | 12/16 | 400 | `muted` |
| `badge` | `type-badge` | Badges, chips, counts, key hints | 12/16 | 500 | the tone |
| `delta` | `type-delta` | Change indicator | 12/16, tabular | 500 | the caller's tone |
| `emphasis` | `type-emphasis` | A value inside text that owns its size | inherited | 500 | `foreground` |

The ladder is strictly ordered: a section title never out-sizes the page title and a caption never out-sizes the value it describes. A missing figure is the muted dash at the figure's own role (`MetricValue`), so absence sits where the value would. Rendered Markdown uses `.prose-content`, built from the same rungs (reading text 16/24, compact 14/20). Availability labels in running text use `UnavailableValue`.

## Data and geometry

| Context | Desktop | Laptop / compact |
| --- | --- | --- |
| Sidebar | 240px | 224px |
| Compact topbar | — | 56px |
| Content gutter | 32px | 24px / 16px |
| Navigation row | 36px | 44px minimum target |
| Control | 32 / 36 / 40px | 44px minimum target |
| Table row | 44px | Labelled record |

Data columns and their headers are centre-aligned and tabular; text columns stay left-aligned. The header centres with its values so a column reads as one block — a sort glyph pushed to the padding edge leaves the label sitting off the numbers by its own width. This resolves the table-header precedence question previously recorded as unresolved: the shared `numeric` flag on `TableHead`/`TableCell` owns both alignment and tabular figures, and call sites do not re-declare either.

Analytical content caps at 1392px; form-first workflow content caps at 1040px while retaining full-width page bands. Spacing is the 4px grid — 4, 8, 12, 16, 20, 24, 32, 40, 48, 64 — plus 2px for hairline insets only; six-, ten- and fourteen-pixel steps are not used. Each rhythm role names one step: label to value 4, icon to text 8, title to content 12, card to card 16, card padding 20, page gutter 32, section to section 24.

| Geometry role | Value | Use |
| --- | --- | --- |
| `--radius-control` | 6px | Controls and fields |
| `--radius-card` | 8px | Cards and semantic objects |
| `--radius-overlay` | 12px | Menus, tooltips, dialogs, drawers |
| `rounded-xs` | 4px | Chart bars, skeletons, inline code |
| `rounded-full` | Full | Pills, badges, dots, counts, filter toggles |

Vertical rhythm belongs to the container: `Stack` from `components/ui/layout.tsx` or container `gap`, not child `mt-*`. Its rungs are `section` 24px, `workspace` 16px, `compact` 12px, and `tight` 4px. A 2px optical nudge, sized glyph, or negative-margin overlap remains allowed.

Marketing subpages and the homepage use `--section-y`: 56px base, 80px from 768px, 96px from 1280px. Adjacent homepage sections of the same tone share one rhythm rather than stacking both paddings. Auth/onboarding use `[data-flow-surface]` geometry from `website-type.css`: 56px bar, centred task measure, 16px mobile gutter, shared control radius, and selection chips 36px desktop/44px touch. The flow shell owns its scrolling main region and action bar.

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

Observed zero remains `0`. Chart series retain unavailable-point gaps and explain them accessibly. Authored prose punctuation is unaffected.

Where the label appears depends on the surface. A state is written once where it is decided: a section or card whose values share one state (**Not run** before the first audit) says so once, in its header badge or notice, and its metric slots show the muted dash at the figure's own size (`MetricValue`) with the state as the accessible name — never the same fact again as a badge, a card label, a caption and a sentence. Chart states and workflow states a reader can act on (**Failed**) print the word. A **metric cell in a table** does not: a column repeats its placeholder once per row to make a point it only needs to make once, and at `--text-xs` inside a `text-sm` tabular column it reads as a different kind of value rather than an absent one. Those cells use `MissingValue` from `components/ui/unavailable-value.tsx` — a muted en dash, with the state as assistive text and the reason available on hover and focus. It is never blank: an empty cell and a measured zero look identical, and those are opposite findings.

State a shared reason once, on the column header or the section, not in every cell that lacks a value. Core columns stay present across loading, filtering and pagination; omit a column only where it is unsupported or irrelevant for the entire view, never because the current page happens to be empty. A table or chart with nothing to show uses one contextual empty state that distinguishes first use, no results, loading and error — those four are different findings and a reader who cannot tell them apart cannot tell whether to change the filter or retry.

## Layout and content composition

### Application

Use sections, ledgers, tables, and split workspaces. Cards support architecture; they do not replace it. Recommendations show impact, deterministic priority factors, scope, status, and persisted evidence; never invent confidence, effort, ownership, or causality.

The app shell and `.app-pane-workspace` share neutral ground. The desktop sidebar and compact navigation drawer use the lower `sidebar` fill; neither draws a seam against the workspace. Cards and bare tables use the raised `panel` fill, shared card radius and no resting shadow or outer border. The workspace pane meets the sidebar and right/bottom viewport edges; only its top corners retain the workspace radius. Below 981px the workspace runs edge-to-edge without radius. Document scrolling remains normal and workspace/content overflow stays unset. Auth and onboarding use the base `.app-pane` paper fill for their separate focused task column.

Overview sections, Website metric cards/page tables, Actions lists, and Prompts tables use the shared white panel role without added elevation. The desktop account trigger sits on the route's first row; below 981px the 56px compact topbar adds the menu trigger, route title and focus-managed off-canvas drawer. Retain every critical mobile action; tables become labelled records, and filters/evidence use full-height sheets.

#### Screen geometry and shell ownership

| Region | Owns | Excludes |
| --- | --- | --- |
| Desktop sidebar | Project switcher (first row), Search, the Dashboard/Agent mode switch, then either the Overview/Analyze/Track groups or the Agent navigation, Settings access, brand lockup and accent picker (foot) | Duplicate navigation trees/registries; the account trigger |
| Topbar | Account trigger at every width; below 981px also Menu, compact route title and accent picker | Fixed bottom navigation |
| Page header | One in-pane route H1 at `objectTitle`, existing description, route actions on the same row; entity heading is the sole H1 on detail routes | Metrics or duplicate route H1 |
| Metric row | Three to five headline values, each with its change when one is comparable | More than five, unsupported metrics, or run bookkeeping |
| Analytical surface | The page's primary chart, table, or comparison | Competing equal-weight surfaces |
| Insight list | Ranked shared insight objects | Feature-specific finding-card shapes |

Keep date ranges and comparisons in their owning page, not the global shell. Align section tabs/actions on one row rather than adding an empty header row. Desktop and compact navigation reuse `nav-items.ts` destinations and capability resolution; hidden navigation never changes direct-route authorisation.

Search's Command Palette remains mounted once in the authenticated shell, not inside the drawer; its trigger lives in the sidebar and in the compact drawer. The account trigger is the topbar's at every width, and renders initials only. Escape closes overlays and focus returns to the visible trigger.

#### Screen-specific contracts

**Overview.** Keep the page useful before any audit. Preserve reading order: compact project identity; warnings; Project State with Track context; Movement; one Next action; ranked actions and report proof; Top Insights; Company facts. Use the same DOM order at desktop and compact widths. Company facts are edited in Agent → Context, not in an Overview drawer. Do not restore a Product loop station strip. Track uses explicit availability labels; report actions require a persisted audit/report. Citation share uses separate shared heading/value roles, not an oversized combined sentence.

**AI Visibility.** Exactly three tabs: Trends (default), Sources, Query fanouts; no parallel Overview or page-local project switcher.

The surface speaks the reader's vocabulary, never the measurement schema's. A backend token reaches a reader only through `lib/visibility/vocabulary.ts`, which is the single owner of that translation; an unmapped token renders as nothing rather than raw. Never print an enum, a taxonomy identifier, a scoring field name, or a row id — `no_baseline`, `third_party`, `source-taxonomy-2` and a monospace `task/analysis/artifact` triple all reached customers this way. Run bookkeeping (expected against measured, failed, not-run, skipped configurations, matched-cell counts) is instrumentation, not evidence: keep it out of the default view. A measure's definition belongs in an info hint on its label, not in permanent body copy under the number.

The page carries ONE filter row. Every control in it answers a question a customer would ask — which measurement, over what period, about which prompts, models and view. Selection mode belongs inside the measurement picker rather than beside it; comparison-baseline and frozen-configuration pickers are analyst controls that stay honoured from the URL and are not surfaced as permanent chrome.

Trends presents three headline measures (Visibility, Share of voice, Owned citation rate), one metric-selectable history chart whose control shares the title row, and one competitor comparison table. Where NOTHING in a selection is comparable, a change column is omitted entirely rather than filled with a repeated placeholder; where one row among many lacks a change, it uses the shared availability vocabulary. Use timestamp spacing and break chart lines at unavailable measurements. A single point uses a compact textual state.

Prompt results belong to the Prompts section, on the prompt row, because the prompt is the object a reader came for. Sources splits into Domains and URLs on a segmented control, and its drill-downs keep the page's one filter row rather than becoming routes that would have to re-establish the selection. Query fanouts is one table under a Group by control (None, Prompt, Topic); groups render as spanning rows of that shared table, never as a table per group. Evidence uses ruled execution rows and original-answer links. Retain shared metric, table, typography, spacing, responsive and control primitives throughout; secondary mobile fields use labelled details without removing actions.

**Site Health: crawl and inventory.** Put the crawl control and URL inventory before crawler-bot, file, and page-kind diagnostics; keep the contextual action visible while secondary diagnostics collapse. Use Run new crawl before/after a run and Stop crawl while the persisted crawl is active; Export is secondary. Discovery and analysis are not separate actions. Before the first run, show an actionable empty placeholder; during discovery, show the first ten persisted inventory rows and enrich them in place. When non-zero, progress names Blocked by robots.txt, HTTP 4xx, HTTP 5xx, and Timeouts beside completed work. Waiting copy identifies healthy host-gate/retry-backoff waits; “stalled” requires backend expired-lease evidence, never a browser timer.

**Site Health: findings and evidence.** Separate Defects and Advisories. Defects own severity and Opportunity eligibility; advisories carry Advisory, not severity. Headlines say defect issue types or advisory issue types, with class-labelled occurrences and affected URLs counters. Severity, dimension, and page kinds use compact unboxed metadata; affected-page counts use regular body type. Use one responsive master-detail workspace: compact group list, then a sticky right rail with selected occurrence evidence, affected URLs, remediation, and actions. Stack these regions on narrow screens without hiding evidence; do not restore per-card expansion, queries, or cursor state. Group/URL detail reuse one bounded presenter for persisted occurrences and directly linked evaluations: exact schema types/properties, heading transitions/scope, and offending control descriptors. Unknown shapes use labelled bounded fields, not raw JSON or generic site-wide claims.

**AEO Readiness.** Open directly on a seven-dimension ledger, never a gauge or unexplained number. Aggregate score, coverage, and page-count summaries remain in Overview, which links here through View details. Reuse Overview's score, quality, coverage, and state roles; keep not-applicable rows visible without failure styling. Evidence opens failures-first in the shared right sheet, not an expanding table cell.

**Site Health Architecture.** Lead with persisted Internal linking and Structure depth summaries; follow with five site-level facts and an always-visible page-kind ledger showing kind, pages, median depth, indexable count, duplicate metadata, and orphaned count. Only assigned URL lists expand, in bounded regions. A read-only observed hierarchy shows persisted parents/evidence sources in its own bounded scroll region, without client-side inference.

**Website Changes.** Use an evidence ledger with four named classes and expandable before/after provenance. Expected is a secondary exact-link label, not a fifth severity. Distinguish unavailable from non-comparable empty panels. Partial comparisons lead with shared-URL-only and added/removed suppression copy. Observed zero says “No changes were observed,” never unavailable.

**Commerce.** This conditional Analyze destination requires persisted capability evidence. Its catalog is the sole target selector. Group catalog-wide secondary actions behind one disclosure; show bulk actions only after selection; align one correction control with the selected target's heading.

**Agent.** A full workspace in Agent mode, not a sheet over Dashboard pages. New chat offers a freeform composer, starter prompts, a skill picker and the top recommended Actions; an attached Action and typed evidence references show as removable chips, never as pasted evidence. A chat is one centred thread with the composer pinned to the bottom; its one output renders inline as a card in the thread: rendered Markdown, edit-as-new-revision, copy, Markdown export, sources, revision history with restore-as-new-revision, and outline approval for outline-first content. Queued, running, cancelled, failed and stopped-at-limit are distinct states with a Stop control while active. Actions list by deterministic priority with status and target filters; detail shows diagnosis, evidence-family convergence, member evidence in a drawer, recommended approach, what to avoid, measurement legs, linked chats, Dismiss/Reopen and Work on this. Agent headers stay one row and name the sidebar section (Actions, Agent), never the target or output title. Skills show what each produces, never methodology. Evidence screens offer Ask agent, and Work on this where an Action exists.

#### The insight object

The product loop is acquire evidence → understand → detect gaps → create opportunities → improve → verify → recommend next. Its reusable unit is one shared insight component across Analyze, Track, and the Agent workspace.

Required anatomy, in order:

1. **Priority + source layer:** identify which system found it.
2. **Claim:** one specific sentence, quantified when a count exists.
3. **Evidence:** scope, selector, observation time; resolves to persisted evidence.
4. **Why this matters:** a pack expectation, demand signal, or contradiction—not causality or invented benchmarks.
5. **Potential impact:** deterministic priority formula, never model-authored.
6. **Two actions:** inspect and act.

The same insight retains its server ID/cache identity everywhere. No resolvable evidence means no rendering. Label coverage/unknowns honestly. Deterministic ranking is authoritative; the agent may group/explain, not reorder. Dense summaries may use `hideWhyThisMatters`; priority, claim, evidence, impact, and actions stay visible.

### Marketing and auth

Marketing is an editorial stack of full-width sections with centred content. The home hero uses a neutral ground, centred value proposition, sign-up and demo actions, and a compact interactive dashboard preview. The separate product explorer retains its full preview cards. The main heading is 48px and lead is 16px at desktop widths; the mobile display is 36/40px. Four static surface logos follow the hero: ChatGPT, Gemini, Claude, and Google AI Overviews. The landing uses the selected action accent against neutral section backgrounds, with accent text in the emphasized hero headline. Closing calls to action centre their message and place actions below it. The shared footer is a full-width dark band retaining its logo, destinations, and legal options.

Use optional eyebrow → heading → short lead → evidence/media or focused grid → at most one primary CTA per band. Secondary intents belong in navigation or another band. Prefer asymmetric text/media, proof ledgers, and concise grids over feature-card walls. The operating loop uses open numbered stages with quiet separators and named steps. Body measure is about 60–70 characters; one H1 per page; spacing follows the surface's section rhythm.

Marketing navigation retains Log in at every width and Sign up from `sm` up. On phones, sign-up/account links are pinned in the full-screen menu sheet. Its scrolled surface is opaque.

### Patterns

Capability modules are peer surfaces with one neutral treatment; status and data carry the colour. Number only an actual sequence, such as Discover → Observe → Diagnose → Act → Verify. Use eyebrows sparingly at major transitions. On phones, only the landing hero product image, the landing product explorer's tab images, and the Solutions product images scale their desktop illustrations inside their own frames. The surrounding sections and authenticated app keep responsive mobile layouts, readable type, and touch targets. Keep one shared horizontal grid for navigation, hero, and sections, and use equal heading and description columns when a section has both.

Cookie consent is a compact bottom-right floating panel with equal-width Reject and Accept actions. On phones it expands only to the viewport gutters and respects the bottom safe area; it never becomes a full-width page banner.

Auth/onboarding use the website type ladder and shared focus treatment. Their flow/sticky action bars use white paper and a single separating edge against the neutral ground; the task column is an `.app-pane`, with unboxed internal groups separated by space/titles. Onboarding adds three-step progress. Review directly confirms category, buyer type, market scope, owned domains, and competitors; prompt generation starts only after confirmation of visible structured ICP facts. No new colour family, gradient, decorative glow, nested card, or competitor mutation. Forest marks the primary action, current step, and selected answer without changing font weight.

Product previews may change only layout, typography, colour, border, radius, or elevation; strings, scripted content, factual claims, and workflows remain unchanged without approval.

### Documentation

The docs subdomain is a Read surface using the existing public light palette,
Switzer/Sora, semantic tokens and shared controls. Its desktop shell has
grouped guide navigation, a measured reading column and an on-page contents
rail. Mobile uses inline navigation and contents disclosures. Guides, Agent,
MCP and Changelog are the top-level entry points; Updates is the final sidebar
group. Public font loading is shared through `PublicFonts.astro`.
Search uses the shared dialog, input and buttons with keyboard access and
focus restoration. Articles are server-built HTML and remain readable without
JavaScript. No decorative motion or alternate design system is introduced.

## Component recipes

### Controls

Shared buttons use the 6px control radius and the `control` type role: app heights 32px compact, 36px default, 40px large; touch targets at least 44px. App buttons have no decorative inset border. Marketing primary buttons use the same solid-forest `primary` variant, minimum 44px (`min-h-[2.75rem]`), and shared hover ramp. Secondary, neutral, ghost, and danger variants remain shared.

Controls need direct labels, immediate pressed feedback, and visible focus: accent on their own border plus one attached soft glow, no gap or second floating ring. Inputs use semantic input/border roles; labels stay beside controls, helpers explain constraints, and errors provide recovery. Placeholder-only labels are forbidden. Composed inputs have one shared-frame focus ring, not an additional native-input outline.

### Charts

`components/ui/chart.tsx` owns the chart frame: the responsive container, the axis defaults, the legend and the hover card. It is built on Recharts, which sizes to the container it is actually given — the hand-rolled predecessors scaled a fixed viewBox unevenly, squashing their own tick text and running a rotated axis title through the values beside it. Series colours come from the `--color-chart-1..8` ladder and are passed as token values, never literals.

`series-chart.tsx` is on this frame. `trend-chart.tsx`, `chart-axes.tsx` and `performance-chart.tsx` are still the hand-rolled SVG layer and are migrating; they carry behaviour the frame has yet to prove it can hold (gap-not-zero with version markers, per-point evidence links, timestamp-proportional spacing). `donut-chart.tsx` stays hand-drawn on purpose: it is a fixed square with no axes, and it distinguishes the declared total from its slices' sum, which a generic pie does not.

Every chart is `aria-hidden` and carries a written description instead. A null point is a gap, never a zero, in the drawing and in the hover card alike.

### Panels, badges, and evidence

Structural sections remain open or tonal. `Card` is a white semantic object with the shared card radius, 20px padding, and no resting border or shadow; its fill separates it from workspace ground. Its `recommendation` tone (accent-soft fill, accent-border edge) marks the page's single next action, and the `danger` tone retains its status edge. Bare `Table` wrappers use the same paper fill and card radius, with a hairline below the header; a table inside a card shares its fill. Cards in one row share their height, and a row is either all cards or all open bands, never both. `Card` sets no display mode; opt into aligned-footer layouts at call sites without breaking sticky scrolling. Never nest a `Card` inside another `Card`, modal, drawer, or sheet.

For a filled, padded box inside a card/section, use `panelClasses({ tone, pad })` from `components/ui/panel.tsx`. Only its white `panel` tone draws an edge; `well`, `tonal` and `accent` are separated by their fill. Drawer field groups/lists use unboxed sections/rows. Multi-category editors use shared underline tabs and one linear field flow, not dashboard grids.

Badges pair labels with state marks. Evidence rows identify source, measurement context, and an action opening the persisted record. Loading/empty states preserve layout and explain absence through the availability vocabulary.

Confirmed first-use analytical states omit filters, charts, and table reservations that cannot change or explain the result. Keep controls that can recover a filtered or uncovered state, and render persisted measured zero or partial-provider evidence through its normal measurement surface.

### Documentation

Docs uses a white reading surface, a 240px navigation column, a 220px contents rail and a 65–75-character article measure. Desktop gutters are 40–56px; the contents rail collapses below 1200px and navigation below 768px. Section tabs and navigation groups use Lucide icons, with strong active labels and quiet neutral navigation highlights.

The contents panels include H2/H3 entries, omit leading step-number prefixes from link labels, and retain authored headings and anchor IDs. Active-heading tracking is progressive enhancement: ordinary anchors remain usable without JavaScript. Existing quotes, code and table headers use semantic tinted surfaces. Search, generated tool references, keyboard access, CSP and print support remain intact.

### Navigation and overlays

- **Navigation:** the active app location is raised paper (`selected` fill, `shadow-selected`) with a dark label and brand-green icon — no border and no leading mark. Hover uses the `active` fill. Preserve icon/label contrast and avoid translation. Page controls sit on a tonal band; identity and tab navigation bands stay on paper. Selected tab underlines use brand green.
- **Menus:** shared panel/item recipes, `shadow-elevated`, 12px overlay radius, short system-curve entrance. Filters/page-kind selectors use shared custom Radix menus, not browser-native `<select>` popups. Single-select filters use radio items. Feature components never import Radix directly.
- **Sheets/dialogs:** `components/ui/drawer.tsx` owns right-side modal sheets; use `shadow-modal-value` and the shared overlay radius. Scrim dims/locks the page; outside click, Escape, and close dismiss. Restore trigger focus, including controlled dialogs. Owners provide padding/footer separation; consumers do not recreate chrome. Tooltips use `shadow-elevated` and the same 12px radius. Features own no shadow recipes.
- **Selection:** underline tabs navigate views or mutually exclusive tables with keyboard navigation and preserved selected-tab focus. Segmented controls use the recessed `track` for compact single-select changes; the selected item is raised paper with `shadow-selected` and dark ink, unselected items are muted. Segment labels use the `badge` role (12/16, 500) so a page's filter row stays one row. Tabs and segments stay on a single row and scroll when labels exceed the available width; keyboard focus reveals the focused option. Filled tabs share spare width without shrinking below their labels; shared UI filter pills handle independent/multi-select filters.
- **Analytical loading:** interval changes retain prior analytical content while the new persisted projection loads. Mark the region busy with compact feedback; no replacement skeleton or labels describing data not yet received.

HeroUI is a reference for state completeness, not an installed dependency.

## Motion and accessibility

Authenticated and marketing routes use shared CSS feedback without a general-purpose animation runtime. Pointer-opened menus use a 150–180ms fade/shift; keyboard command interfaces open immediately. Drawers use interruptible 220–260ms right-side transitions; press feedback begins on pointer-down. Authenticated route content and tab indicators update immediately without opacity transitions.

Sanctioned explanatory motion: rotating answer-engine wordmarks; product-window walkthrough; native CSS scroll fade/rise reveals that never hide server-rendered content after hydration; master-detail continuity/domain-owned measured expansion; onboarding research results resolving below factual activity with a 220ms fade/rise and 60ms stagger.

Answer-engine rotors pause outside the viewport and in hidden tabs. Static product
preview bars render complete on the server without a hydration-time collapse or replay.

All motion stops under `prefers-reduced-motion: reduce`: global CSS animations/transitions are neutralised and SMIL pipeline dots are hidden. WCAG 2.1 AA is the minimum. Preserve visible focus, non-colour-only meaning, usable keyboard/touch interactions, forced-colours, and print.

## Review checklist

Before merging a visual change, verify:

- Existing token, primitive, typography, geometry, spacing, and ownership contracts are followed; no route-local design recipes or unapproved surface/motion changes.
- Affected text, focus, status, loading, error, empty, keyboard, touch, mobile, reduced-motion, and forced-colours states remain usable; zero remains distinct from absence.
- Factual content, claims, data, product behavior, transactions, and confirmation gates remain unchanged unless explicitly approved.
- Repository-owned static, test, and appropriate visual commands pass under the existing workflow. External/manual tools are not acceptance gates unless a deterministic repository command owns them. Tests do not become a second visual authority.
