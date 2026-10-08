# CiteLadder Design System

> Canonical visual and interaction contract for marketing, authentication, onboarding, and the authenticated application. This is the only design-system document.

Existing owners govern production workflows. Visual work must not change factual copy, data, feature claims, scripted preview content, transactions, or explicit confirmation gates without approval. Product decisions remain with the owning feature contract.

Tests verify shared ownership, accessibility, and product correctness—not exact classes, fonts, pixels, or CSS recipes as a second visual authority.

## Direction and identity

One system covers every surface (owner decision, 2026-10-07): the public site, docs, auth, onboarding and the authenticated app share the light B2B SaaS system executed at Attio/Linear craft. The material is a hairline shadow ring, a close contact shadow and, on larger objects, one long soft ambient layer; nothing glows and nothing carries an inset bevel. The primary action alone adds a faint top sheen. CiteLadder retains its forest accent, self-hosted type, content, routes and workflows.

CiteLadder (`citeladder.com`) is an evidence-led enterprise system. The app puts a quiet green-tinted neutral ground behind the chrome and floats the work on one white sheet, using near-black green-tinted ink, forest actions, semantic evidence washes, useful density, and deliberate negative space. Prioritise current state → movement → next action → evidence, not equal-weight KPI cards. Voice is direct, confident, specific, and evidence-led: one idea per sentence.

- **Logo:** `frontend/components/ui/logo-mark.tsx` owns every surface's lockup: `frontend/public/citeladder-logo.svg` for the wordmark and the matching inline glyph for mark-only mode. `BRAND_LOGO_SIZES` owns standard heights; explicit `size` supports exceptional layouts. The mark inherits `currentColor`; non-empty `alt` supplies either rendering's accessible name. `frontend/public/citeladder-favicon.ico` owns browser/installable-app icons with the same black silhouette across frames.
- **Typography:** self-hosted Satoshi (sans) on every surface for body, UI, data and product headings; self-hosted Sentient (serif) for public and focused-flow display headings only (`--font-editorial`, scoped by `website-type.css`; coded product previews reset to Satoshi). Both are capped at weight 600 by their `@font-face` ranges; 14px working baseline. Each semantic role owns size, leading, weight, tracking, and ink together. In the product, hierarchy comes from size and weight together through the closed `.type-*` roles (see Product app ladder); shared fields and dropdowns use the 14px `--text-field` role on every surface.
- **Icons:** Lucide only; import concepts from `frontend/lib/icons.ts` where available. Call sites set size only: `size-3`/`size-3.5` for dense tables, toolbars, and chips; `size-4` for chrome; `size-5` for empty states and marketing wells; larger only for decorative marks. The global stroke ladder derives approximately 1.3px stems from size. Keep `currentColor`; do not override stroke weight locally.
- **Surface identity:** Light is the default. The app header carries a one-click circular light/dark toggle beside the account menu (`frontend/lib/theme/theme.ts` owns the per-device preference; the semantic tokens rebind under `[data-theme='dark']`). There is no automatic system-theme following. Marketing is light-only and never applies the preference. Forest is the sole action accent on public and product surfaces. The logo and provider marks retain their fixed brand colours. The app's sidebar shares the neutral shell ground, and the work floats beside it on one white workspace sheet. Auth and onboarding share the public website's light world (white stage, public palette, frame-shadowed task sheet); in dark mode they keep the app's dark rebinds. Dark mode keeps the same tonal order in near-black neutrals with the same slight green tint, and its material leads with light hairline rings. Controls retain white fills and distinct edges in light mode. Marketing and docs remain light-only.

## Source of truth and implementation rules

| Owner | Responsibility |
| --- | --- |
| `frontend/apps/app/src/globals.css` | Global tokens, shared geometry, interaction rules, animations, and the single `@theme` definition |
| `frontend/apps/app/index.html` and `frontend/components/marketing/chrome/PublicFonts.astro` | Self-hosted Satoshi and Sentient loading (`--font-text`, `--font-heading`, `--font-editorial`) and metric-matched fallbacks in each runtime |
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
| Ground and rail | `background`, `shell`, `sidebar` `#F4F5F4` | One neutral ground behind the rail and around the workspace sheet in light mode |
| Structure | `background-alt` `#F6F7F6`; `panel-tonal` `#F8F9F8`; `well` `#EFF1F0` | Tonal bands and panels, and recessed wells |
| Paper | `panel`, `input`, `elevated` `#FFFFFF` | The workspace sheet, inputs, semantic objects, overlays |
| Ink | `foreground` `#0B0F0D`; `secondary` `#3B423E`; `muted` `#5C645F`; `ink-*` chrome ladder below | Titles and values; sentences; fallback metadata. Shared labels, captions, category chips and navigation use the graduated chrome ladder. The legacy `text-subtle` utility stays retired. |
| Boundaries | `border-subtle` `#ECEEED`; `border` `#E1E4E2`; `border-strong` `#CFD4D1`; `border-bold` `#858D88` | `border-subtle` divides rows or peers *inside* one surface; `border` bounds controls, inset white panels and overlays, rings a bare table and divides a table header from its rows; `border-strong` is deliberate emphasis; `border-bold` bounds small choice controls. Cards use a hairline shadow ring. |
| Neutral states | `hover`, `selected`, `active`, `disabled` | Surface mixed with primary ink at 4%, 8%, 12%, and 3%; the selected state is distinct from hover. `track` is the recessed segmented-control surface. |
| Interaction | Emerald: forest `#14532D`; hover `#166534`; pressed `#0B3D20`; brand `#16A34A`; soft `#F0FDF4`; line `#86EFAC`. | Primary actions, links, tab underlines, checked indicators and focus; navigation and filter selection use neutral tints |
| Evidence | `success`, `warning`, `danger`, `info`; `chart-1..8`, `chart-grid` | Status families carry labelled status; data-viz roles carry measurements |

Hierarchy combines the ground and paper fills with restrained depth. Cards, secondary controls and selected navigation use a one-pixel shadow ring and a close contact shadow; cards add one soft ambient layer. Primary and destructive buttons add a faint top sheen and a ring in their own pressed shade. The workspace sheet uses a quiet frame shadow; focused auth/onboarding sheets use the deeper public frame shadow. In dark mode the ring is 6–8% white, because a drop shadow carries no edge on near-black. Detached menus and dialogs retain their own elevation roles.

The chrome ink ladder separates decoration from reading text. `ink-faint` is only
for decorative icons paired with a readable label; it must not carry small text.
All other rungs meet 4.5:1 on their intended neutral surfaces. Names describe the
role, not a fixed lightness order across themes.

Category tags use ten independent `--tag-{tone}-{bg,border,text}` triples in
`globals.css`: blue, purple, green, moss, red, orange, amber, teal, yellow and
neutral. Light mode uses pale fills and dark ink; dark mode uses dark-tinted
fills and light ink. `tagClasses` in `filter-chip-variants.ts` owns their pill
recipe, and `Tag`/`TagGroup` consume it. Static tags retain a fine tone border;
interactive filters and overflow disclosure use shadow rings. Topic tags use
blue and company offerings use purple; colors label categories, never status.
`TagGroup` shows two labels and a `+N` disclosure that expands in place with
keyboard/touch support and `aria-expanded`; long labels wrap. Semantic `Badge`
status dots and their meanings remain separate.

**Borders.** Controls, inset panels, overlays and status objects retain semantic edges. Default cards use an inset hairline without changing their box geometry; table wrappers remain fill-separated. Selected sidebar destinations and segments use a raised neutral face. Tinted inset boxes use their fill as the boundary; status cards retain a hairline to carry meaning. Sections are separated by space. The desktop rail has a subtle dividing edge. Lines use semantic tokens; transparent layers belong only to the centralized elevation recipes.

Reading text must meet 4.5:1 contrast. Use primary ink on selected surfaces when secondary ink would lose contrast. Accent denotes action, never success or positive metric deltas. Success, warning, danger and info denote their corresponding statuses; danger also denotes destructive intent. Metrics use data-viz or neutral signed/directional treatments. Decorative icons and category labels use neutral ink. Dark mode keeps colour concentrated in actions and meaningful evidence. Never communicate meaning through colour alone.

The public website, login and onboarding follow the B2B SaaS category standard at Attio/Linear craft (owner decision, 2026-10-07). `[data-public-surface]` (and `[data-flow-surface]` in light mode) rebinds a white ground, near-black green-tinted ink, a soft neutral band (`background-alt`) and quiet hairlines, and defines three public shadows: `--public-frame-shadow` for product frames and focused sheets, `--public-raised-shadow` for small raised objects (secondary buttons, icon tiles, link cards) and `--public-menu-shadow` for navigation panels. There is no grain, no saturated gradient wash and no dark band. The only texture is a faint dot lattice behind product stages, the closing band and the auth stage, masked so it never sits behind text. Evidence colour lives only inside product views.

Public geometry: `--radius-marketing-control` (8px) for public buttons and controls; product frames 14px; stages, bento tiles and link cards 16–20px; auth/onboarding sheets 16px. The public container measure (`max-w-7xl` plus `--site-gutter`) is shared by navigation, hero, sections and footer. These roles do not change the authenticated application's 12px `--radius-card` contract.

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
| `--color-active` | state-tint | Pressed neutral surface | Surface + 12% primary ink | `#e2e2e2` | `#2c2f2d` |
| `--color-background` | surface | Page ground | Ground | `#f4f5f4` | `#0b0d0c` |
| `--color-background-alt` | surface | Public alternating canvas or neutral inset | Ground/inset | `#f6f7f6` | `#181b19` |
| `--color-border` | border | Control, inset and overlay boundary | Between surfaces | `#e1e4e2` | `#2b302d` |
| `--color-border-bold` | border | Small choice-control boundary | Inside panel | `#858d88` | `#737b76` |
| `--color-border-strong` | border | Emphasized or hovered boundary | Between surfaces | `#cfd4d1` | `#3d433f` |
| `--color-border-subtle` | border | Divider within one surface | Inside surface | `#eceeed` | `#212522` |
| `--color-brand-claude` | brand | brand claude identity | Fixed mark or separate public decoration | `#d97757` | `#d97757` |
| `--color-brand-forest` | brand | brand forest identity | Fixed mark or separate public decoration | `#16a34a` | `#16a34a` |
| `--color-brand-gemini` | brand | brand gemini identity | Fixed mark or separate public decoration | `#4285f4` | `#4285f4` |
| `--color-brand-google-blue` | brand | brand google blue identity | Fixed mark or separate public decoration | `#4285f4` | `#4285f4` |
| `--color-brand-google-green` | brand | brand google green identity | Fixed mark or separate public decoration | `#34a853` | `#34a853` |
| `--color-brand-google-red` | brand | brand google red identity | Fixed mark or separate public decoration | `#ea4335` | `#ea4335` |
| `--color-brand-google-yellow` | brand | brand google yellow identity | Fixed mark or separate public decoration | `#fbbc05` | `#fbbc05` |
| `--color-brand-openai` | brand | brand openai identity | Fixed mark or separate public decoration | `#10a37f` | `#10a37f` |
| `--color-canvas-soft` | surface | Public alternating soft canvas | Public ground | `#f6f7f6` | `#111412` |
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
| `--color-disabled` | state-tint | Disabled neutral control fill | Surface + 3% primary ink | `#f8f8f8` | `#191c1a` |
| `--color-elevated` | surface | Detached floating overlay | Above ground/panel | `#ffffff` | `#1b1f1d` |
| `--color-foreground` | ink | Primary reading text | On neutral surfaces | `#0b0f0d` | `#e1e5e2` |
| `--color-gsc-clicks` | data-viz | gsc clicks evidence encoding | Observed data layer | `#1a73e8` | `#8ab4f8` |
| `--color-gsc-ctr` | data-viz | gsc ctr evidence encoding | Observed data layer | `#00897b` | `#4db6ac` |
| `--color-gsc-impressions` | data-viz | gsc impressions evidence encoding | Observed data layer | `#673ab7` | `#c58af9` |
| `--color-gsc-position` | data-viz | gsc position evidence encoding | Observed data layer | `#e65100` | `#ff8a65` |
| `--color-hover` | state-tint | Hovered neutral surface | Surface + 4% primary ink | `#f5f5f5` | `#1b1e1c` |
| `--color-info` | semantic-status | info status mark | Labelled status layer | `#24476b` | `#8ad4e1` |
| `--color-info-bg` | semantic-status | info bg | Labelled status layer | `#eef5fa` | `rgb(138 212 225 / 13%)` |
| `--color-info-border` | semantic-status | info border | Labelled status layer | `#c8d9e8` | `rgb(138 212 225 / 38%)` |
| `--color-info-text` | semantic-status | info text | Labelled status layer | `#24476b` | `#a5e2eb` |
| `--color-ink-chip` | ink | Neutral filter labels | On neutral control surfaces | `#3b423e` | `#cbd1cd` |
| `--color-ink-faint` | ink | Decorative inactive navigation icons only | Beside readable navigation labels | `#8e9690` | `#6d746f` |
| `--color-ink-icon` | ink | Active navigation icons | On selected neutral surfaces | `#2d332f` | `#dce1de` |
| `--color-ink-soft` | ink | 13px labels and inactive destinations | On neutral reading surfaces | `#525a55` | `#a6ada9` |
| `--color-ink-subtle` | ink | 12px captions and navigation group labels | On neutral reading surfaces | `#5c645f` | `#959c98` |
| `--color-input` | surface | Field interior | Inside panel boundary | `#ffffff` | `#0f1210` |
| `--color-muted` | ink | Helpers, metadata and disabled labels | On reading surfaces | `#5c645f` | `#959c98` |
| `--color-neutral-bg` | surface | Neutral badge or progress track | Inside panel | `#eff1f0` | `#222222` |
| `--color-on-inverse` | ink | Label on inverse surface | On surface-inverse | `#ffffff` | `#0b0d0c` |
| `--color-overlay-scrim` | surface | Modal backdrop | Between ground and modal | `rgb(11 15 13 / 32%)` | `rgb(0 0 0 / 72%)` |
| `--color-panel` | surface | Resting content or chrome | On ground | `#ffffff` | `#131614` |
| `--color-panel-tonal` | surface | Tonal resting panel or control band | On ground/panel | `#f8f9f8` | `#171a18` |
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
| `--color-secondary` | ink | Secondary reading text | On neutral surfaces | `#3b423e` | `#bfc5c1` |
| `--color-selected` | state-tint | Selected neutral surface | Surface + 8% primary ink | `#ebecec` | `#232724` |
| `--color-selection` | state-tint | Native text selection highlight | On reading surface | `#bbf7d0` | `rgb(118 223 156 / 35%)` |
| `--color-selection-fg` | ink | Text within native selection | On selection highlight | `#0b0f0d` | `#faf9f5` |
| `--color-sentiment-negative` | data-viz | sentiment negative evidence encoding | Observed data layer | `#ff6e56` | `#f49a8b` |
| `--color-sentiment-negative-bg` | data-viz | sentiment negative bg evidence encoding | Observed data layer | `#fff3f0` | `rgb(243 151 158 / 13%)` |
| `--color-sentiment-negative-text` | data-viz | sentiment negative text evidence encoding | Observed data layer | `#9a3412` | `#f6abb1` |
| `--color-sentiment-neutral` | data-viz | sentiment neutral evidence encoding | Observed data layer | `#6b6b72` | `#a3a39d` |
| `--color-sentiment-neutral-bg` | data-viz | sentiment neutral bg evidence encoding | Observed data layer | `#f4f4f1` | `#222222` |
| `--color-sentiment-neutral-text` | data-viz | sentiment neutral text evidence encoding | Observed data layer | `#3a3a40` | `#bfc5c1` |
| `--color-sentiment-positive` | data-viz | sentiment positive evidence encoding | Observed data layer | `#9acd32` | `#b8db73` |
| `--color-sentiment-positive-bg` | data-viz | sentiment positive bg evidence encoding | Observed data layer | `#f4f8ec` | `rgb(128 223 162 / 13%)` |
| `--color-sentiment-positive-text` | data-viz | sentiment positive text evidence encoding | Observed data layer | `#3f6212` | `#a4edbd` |
| `--color-shell` | surface | Workspace/focused-flow ground | Ground | `#f4f5f4` | `#0b0d0c` |
| `--color-shell-alt` | surface | Stronger shell inset | Inside ground | `#eceeed` | `#121513` |
| `--color-sidebar` | surface | Navigation rail | Below ground | `#f4f5f4` | `#0b0d0c` |
| `--color-success` | semantic-status | success status mark | Labelled status layer | `#166534` | `#80dfa2` |
| `--color-success-bg` | semantic-status | success bg | Labelled status layer | `#edf7ed` | `rgb(128 223 162 / 13%)` |
| `--color-success-text` | semantic-status | success text | Labelled status layer | `#166534` | `#a4edbd` |
| `--color-surface-inverse` | surface | Inverse floating tooltip surface | Floating overlay | `#0b0f0d` | `#e1e5e2` |
| `--color-tile-blue` | brand | tile blue identity | Fixed mark or separate public decoration | `#e0f2fe` | `#e0f2fe` |
| `--color-tile-blue-ink` | brand | tile blue ink identity | Fixed mark or separate public decoration | `#0284c7` | `#0284c7` |
| `--color-tile-green` | brand | tile green identity | Fixed mark or separate public decoration | `#dcfce7` | `#dcfce7` |
| `--color-tile-green-ink` | brand | tile green ink identity | Fixed mark or separate public decoration | `#16a34a` | `#16a34a` |
| `--color-tile-indigo` | brand | tile indigo identity | Fixed mark or separate public decoration | `#ede9fe` | `#ede9fe` |
| `--color-tile-indigo-ink` | brand | tile indigo ink identity | Fixed mark or separate public decoration | `#4f46e5` | `#4f46e5` |
| `--color-tile-purple` | brand | tile purple identity | Fixed mark or separate public decoration | `#ffede8` | `#ffede8` |
| `--color-tile-purple-ink` | brand | tile purple ink identity | Fixed mark or separate public decoration | `#ea580c` | `#ea580c` |
| `--color-track` | surface | Recessed segmented-control track | Inside control | `#eceeed` | `#0f1210` |
| `--color-warning` | semantic-status | warning status mark | Labelled status layer | `#8a4600` | `#f2c879` |
| `--color-warning-bg` | semantic-status | warning bg | Labelled status layer | `#fff5db` | `rgb(242 200 121 / 13%)` |
| `--color-warning-text` | semantic-status | warning text | Labelled status layer | `#8a4600` | `#f7d99e` |
| `--color-well` | surface | Recessed evidence or inset | Inside panel | `#eff1f0` | `#0e100f` |

## Typography

Public display headings (hero, page title, section heading) use weight 600 with tracking that tightens as size grows (about −0.024em to −0.032em) in Sentient; feature and small headings use 600 at about −0.011em. Product-app headings keep normal tracking.

Use Satoshi for text, figures and product page titles, and Sentient for public and focused-flow headings only, never for dense UI or data; metrics, dates, ranks, and percentages explicitly use tabular numerals, not monospace. Numbers retain their data roles rather than display roles. Weights are 400 (sentences), 500 (labels, controls, badges) and 600 (titles, figures). Product titles and figures tighten their tracking as size grows (page title −0.016em, figure −0.02em, section title −0.011em). Do not assemble page-local size/weight/ink hierarchies.

### Website and focused-flow ladder

Roles own all typography properties. The general ladder is mobile-first: base below 700px, with 700px and 981px step-ups where defined. Ordinary paragraphs stay at or above 14px, except the compact homepage editorial ladder below 540px, where short supporting paragraphs step down by 2px. Prose measure is 45–75 characters, except the documentation article column, which can reach 85ch to sit closer to its side navigation; long paragraphs never use accent ink. Body tracking is zero; large text uses calm leading.

| Role | Size / line height | Weight | Tracking | Ink |
| --- | --- | --- | --- | --- |
| Flow group title | 16/24px | 600 | -0.2px | `ink-strong` |
| Flow help | 14/20px | 400 | 0 | `muted` |
| Flow metadata | 12/16px | 500 | 0 | `muted`, tabular |
| Lead | 18/28px → 20/30px at 768px | 400 | −0.011em | `muted` on public pages |
| Large body | 16/26px | 400 | −0.006em | `secondary` |
| Body baseline | 15/24px | 400 | 0 | `secondary` |
| Navigation/actions | 14/20px | 500 | 0 | `ink` or inverse |
| Label/caption | 13/18px | 500 | 0 | `muted` |

Display rungs track the viewport on phones so headlines stay short: the hero and page titles hold two lines from 360px, and long article titles (`website-article-title`) three. The hero tops out at 64px on desktop.

`website-data-display` is pricing-only: Satoshi 500, tabular, 30/36px → 40/46px at 768px. Never apply it to prose or headings.

### Product app ladder

The roles are `.type-*` classes in `globals.css` (components layer, so a status utility such as `text-danger-text` can still set the ink). Reach them through `textRole(role, layoutClasses?)` from `components/ui/typography.tsx` or the class itself; name the text's job rather than overriding its typography. Call sites outside `components/ui/` never set a size, leading, tracking, face or weight.

| Role | Class | Job | Size / line height | Weight | Ink |
| --- | --- | --- | --- | --- | --- |
| `pageTitle` | `type-page-title` | The route H1, one per page | 20/28, display, −0.016em | 600 | `foreground` |
| `figure` | `type-figure` | A metric value | 24/32, display, tabular | 600 | `foreground` |
| `sectionTitle` | `type-section-title` | Section, card, drawer and dialog headings | 16/24 | 600 | `foreground` |
| `figureSm` | `type-figure-sm` | A value in a dense row or cell | 16/24, tabular | 600 | `foreground` |
| `itemTitle` | `type-item-title` | Row, list-item and insight titles | 14/20 | 600 | `foreground` |
| `body` | `type-body` | Sentences, descriptions, table cells | 14/20 | 400 | `secondary` |
| `control` | `type-control` | Buttons, navigation, tabs, links | 13/18 | 500 | by state |
| `label` | `type-label` | Names a value: metric, field and column labels | 13/18 | 500 | `ink-soft` |
| `caption` | `type-caption` | Timestamps, counts, help, footnotes | 12/16 | 400 | `ink-subtle` |
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
| Navigation row / tabs | 32px | 32px |
| Control (small / default / large) | 28 / 32 / 36px | 28 / 32 / 36px |
| Marketing CTA (default / homepage) | 34 / 44px minimum | Text width at 540px and below |
| Table row (standard / dense) | 36 / 32px | Same roles or labelled record layout |

Metric columns retain centred tabular figures with `numeric`; ordinary numeric columns can use `numeric="end"` for trailing alignment. Headers and cells use the same shared alignment option. Text columns stay left-aligned.

`TableRow density="multiline"` adds 12px vertical cell padding for title/URL and status/helper rows. Height remains content-driven; compact rows keep their existing geometry. Wide tables use the shared scroll wrapper.

Website Overview, Pages, and page details use `components/site-health/audit-metric-strip.tsx`: one paper card, equal segments, leading icons, 48px rings at the upper right, visible measurement qualifications, and a consistent footer slot. Only supported drill-downs render “View details”. Strips reflow through two columns to one, with dividers following the arrangement.

Analytical content caps at 1392px; form-first workflow content caps at 1040px while retaining full-width page bands. Two-column pages pick a role from `splitPaneClasses` in `components/ui/workspace.tsx`, never a ratio: `list-detail` (`--pane-list-detail`, a selectable list beside the selection's evidence) or `main-aside` (`--pane-main-aside`, the primary surface beside supporting context). Both stack below `lg`. A route's loading, read-error and first-use empty states render inside `PageShell`, so the identity band never disappears. Spacing is the 4px grid — 4, 8, 12, 16, 20, 24, 32, 40, 48, 64 — plus 2px for hairline insets only; six-, ten- and fourteen-pixel steps are not used. Each rhythm role names one step: label to value 4, icon to text 8, title to content 12, card to card 16, card padding 16, page gutter 32, section to section 24.

| Geometry role | Value | Use |
| --- | --- | --- |
| `--radius-control` | 8px | Controls and fields |
| `--radius-card` | 12px | Cards and semantic objects |
| `--radius-overlay` | 12px | Menus, tooltips, dialogs, drawers |
| `rounded-xs` | 4px | Chart bars, skeletons, inline code |
| `rounded-full` | Full | Pills, badges, dots, counts, filter toggles |

Vertical rhythm belongs to the container: `Stack` from `components/ui/layout.tsx` or container `gap`, not child `mt-*`. Its rungs are `section` 24px, `workspace` 16px, `compact` 12px, and `tight` 4px. A 2px optical nudge, sized glyph, or negative-margin overlap remains allowed.

Marketing subpages and the homepage use `--section-y`: 56px base, 80px from 768px, 96px from 1280px. Adjacent homepage sections of the same tone share one rhythm rather than stacking both paddings. Auth/onboarding use `[data-flow-surface]` geometry from `website-type.css`: 56px bar, centred task measure, 16px mobile gutter, shared control radius, and shared compact controls on every viewport. The flow shell owns its scrolling main region and action bar.

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

The app uses a floating sheet (owner decision, 2026-10-07). The desktop sidebar shares the shell ground and draws no edge; `.app-pane-workspace` is one white sheet inset `--workspace-inset` (8px) from the viewport and the rail, with the 14px workspace radius on all four corners and the quiet sheet shadow. The rail starts one inset down so its rows line up with the sheet's bands. Current destinations lift to paper; the Dashboard/Agent selector shares the recessed segment recipe. Cards use the `panel` fill and shared elevation; bare tables carry the `table-frame` hairline ring, which drops inside a card or dialog. Below 981px the workspace runs edge-to-edge without radius, inset or shadow, under a paper topbar with a hairline. Document scrolling and content overflow stay unchanged; the sheet clips its corners without becoming a scroll container. Auth and onboarding use one rounded, elevated paper task column with unboxed internal groups, including at mobile widths where gutters remain.

Overview sections, Website metric cards/page tables, Actions lists, and Prompts tables consume their existing shared owners; only semantic cards acquire the card elevation. The desktop account trigger sits on the route's first row; below 981px the 56px compact topbar adds the menu trigger, route title and focus-managed off-canvas drawer. Retain every critical mobile action; tables become labelled records, and filters/evidence use full-height sheets.

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

**Agent.** A full workspace in Agent mode, not a sheet over Dashboard pages. New chat offers a freeform composer, starter prompts, a skill picker and the top recommended Actions; an attached Action and typed evidence references show as removable chips, never as pasted evidence. A chat is one centred thread with the composer pinned to the bottom; its one output renders inline as a card in the thread: rendered Markdown, edit-as-new-revision, copy, Markdown export, sources, revision history with restore-as-new-revision, and outline approval for outline-first content. Queued, running, cancelled, failed and stopped-at-limit are distinct states with a Stop control while active. Actions list by deterministic priority with status and target filters; detail shows diagnosis, evidence-family convergence, member evidence in a drawer, recommended approach, what to avoid, measurement legs, linked chats, Dismiss/Reopen and Work on this. Agent chat headers name the sidebar section. Action details name the actual target, place its URL directly below, and separate Diagnosis/Implementation from supporting Evidence/Avoid/Measure with cards. Only observed sources count as supporting evidence; other statuses stay accessible in a counted disclosure. Skills show what each produces, never methodology. Evidence screens offer Ask agent, and Work on this where an Action exists.

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

Product proof comes from coded product views (`components/marketing/scenes/product-views.tsx`): synthetic records in the product's own layout and vocabulary, wrapped by `ProductShot` in a stage, a window frame and an "Illustrative example" caption. Every capability has its own view, so no page repeats one illustration. The homepage hero is a centred headline, lead, Start free trial and Book a demo, then a large app-shell frame with a four-tab product tour (Visibility, Citations, Site Health, Agent) — the page's signature interaction — that rises into place once on arrival and cross-fades between tabs (see Motion and accessibility; none under reduced motion). The engine strip labels API collection honestly (OpenAI API, Gemini API, Claude API, Google AI Overviews). Platform pages share one template: breadcrumb, left-aligned title and lead, actions, a hero product shot, three hairline-topped highlights, alternating copy/visual feature rows on the soft band, FAQ, related link cards and a closing band.

Section grammar: heading → optional short lead → evidence/media, list or table → at most one primary action per band. There are no eyebrow or kicker labels above headings; breadcrumbs are wayfinding, not labels. Prefer split layouts, hairline-divided lists and real product views over icon-card walls; cards are reserved for clickable destinations and real objects such as pricing plans. Number only a real sequence. Body measure is about 60–70 characters; one H1 per page; space separates same-tone sections and the tone change is the edge between different ones.

Marketing navigation is a white bar (hairline once scrolled) with the logo, centred text links (Platform, Solutions and Resources open panels from a single disclosure button each; Enterprise and Pricing are links) and exactly two account actions: Log in and Sign up (Sign up only while self-serve sign-up is open, from `sm` up). Platform opens a three-column panel of icon rows plus an overview footer. Below `lg` a full-height sheet lists the same destinations with Log in and Sign up pinned at its foot. The footer has no buttons: brand line, Platform/Solutions/Resources/Company columns derived from the navigation registry, and a legal row.

### Patterns

Product views keep their desktop layout at every width (owner decision, 2026-10-08). Below its design width a view lays out at that width and `.product-fit` (`marketing.css`) shrinks it with `zoom`, so a phone sees a scaled copy of the desktop frame instead of a reflowed column; it is still live, selectable markup, not an image. Design widths sit at or below each frame's 1024px size, so desktop layouts are unaffected. Keep one shared horizontal grid for navigation, hero, sections and footer.

Cookie consent is a compact bottom-right floating panel with equal-width Reject and Accept actions. On phones it expands only to the viewport gutters and respects the bottom safe area; it never becomes a full-width page banner.

Auth/onboarding use the website type ladder and shared focus treatment. Their flow/sticky action bars use white paper and a single separating edge against the neutral ground; the task column is an elevated `.app-pane` with 16px corners, with unboxed internal groups separated by space/titles. Onboarding adds three-step progress. Review directly confirms category, buyer type, market scope, owned domains, and competitors; the project is created only after confirmation of visible structured ICP facts, and onboarding generates no prompts. No new colour family, decorative glow, nested card, or competitor mutation. Controls may use the shared neutral sheen. Forest marks the primary action, current step, and selected answer without changing font weight.

Product previews may change only layout, typography, colour, border, radius, or elevation; strings, scripted content, factual claims, and workflows remain unchanged without approval.

### Documentation

The docs subdomain is a Read surface using the existing public light palette,
Satoshi and Sentient, semantic tokens and shared controls. Its desktop shell has
grouped guide navigation, a measured reading column and an on-page contents
rail. Mobile uses inline navigation and contents disclosures. Guides, Agent,
MCP and Changelog are the top-level entry points; Updates is the final sidebar
group. Public font loading is shared through `PublicFonts.astro`.
Search uses the shared dialog, input and buttons with keyboard access and
focus restoration. Articles are server-built HTML and remain readable without
JavaScript. It wears the website's chrome: one compact header row (wordmark
with a Docs tag, section tabs with a forest underline, a field-style search,
the marketing Open app button) and compact 32px navigation rows. No decorative
motion or alternate design system is introduced.

## Component recipes

### Controls

Shared buttons use the 8px control radius and the `control` type role. Small controls use `--control-height-sm` (28px), defaults use `--control-height-md` (32px), and large page actions use `--control-height-lg` (36px), on every viewport. Page control bands rebind the default role to small so buttons and all select-family triggers align. Marketing's separately owned `marketing` Button size remains 48px minimum; marketing primitives retain their own public geometry.

Controls need direct labels, immediate pressed feedback and central keyboard focus. Focus paints the existing border rather than adding an outside perimeter. `.focus-input` changes its border to accent; text entry inside `.focus-frame` changes only the frame's border. Auxiliary buttons show their own focus edge without highlighting the surrounding field. Other controls use a 1px accent outline inset by 1px, aligned with their edge; filled primary/destructive actions use their high-contrast label ink. All treatments key on `:focus-visible`. The Agent composer's textarea owns focus, not its outer form. Disabled controls have no outline. Higher contrast uses a dotted edge; forced colours use system Highlight. Invalid controls retain a danger border during hover and focus, paired by the form owner with `aria-invalid` and descriptive recovery text. Placeholder-only labels are forbidden. Glow and bespoke component focus recipes are retired.

### Charts

`components/ui/chart.tsx` owns the chart frame: the responsive container, the axis defaults, the legend and the hover card. It is built on Recharts, which sizes to the container it is actually given — the hand-rolled predecessors scaled a fixed viewBox unevenly, squashing their own tick text and running a rotated axis title through the values beside it. Series colours come from the `--color-chart-1..8` ladder and are passed as token values, never literals.

`series-chart.tsx` is on this frame. `trend-chart.tsx`, `chart-axes.tsx` and `performance-chart.tsx` are still the hand-rolled SVG layer and are migrating; they carry behaviour the frame has yet to prove it can hold (gap-not-zero with version markers, per-point evidence links, timestamp-proportional spacing). `donut-chart.tsx` stays hand-drawn on purpose: it is a fixed square with no axes, and it distinguishes the declared total from its slices' sum, which a generic pie does not.

Every chart is `aria-hidden` and carries a written description instead. A null point is a gap, never a zero, in the drawing and in the hover card alike.

### Panels, badges, and evidence

Structural sections remain open or tonal. `Card` is a white semantic object with the shared card radius, 16px padding, a fine inset edge and layered ambient elevation. Its `recommendation` tone (accent-soft fill, accent-border edge) marks the page's single next action, and the `danger` tone retains its status edge. Bare `Table` wrappers use the same paper fill and card radius, with a hairline below the header; a table inside a card shares its fill. Cards in one row share their height, and a row is either all cards or all open bands, never both. `Card` sets no display mode; opt into aligned-footer layouts at call sites without breaking sticky scrolling. Never nest a `Card` inside another `Card`, modal, drawer, or sheet.

For a filled, padded box inside a card/section, use `panelClasses({ tone, pad })` from `components/ui/panel.tsx`. Only its white `panel` tone draws an edge; `well`, `tonal` and `accent` are separated by their fill. Drawer field groups/lists use unboxed sections/rows. Multi-category editors use shared underline tabs and one linear field flow, not dashboard grids.

Badges pair labels with state marks. Tags use the 20px small badge minimum, badges/filter chips the 24px default. Dense tables rebind badges to the small role. Menu rows use a 32px minimum and may grow for option detail; card/panel padding is 16px. The sidebar uses 12px horizontal insets, 4px item gaps and 12px group labels. Filter bands have 8px vertical padding so wrapping controls clear their rules; page actions wrap at narrow widths. Table headers use the tonal panel fill. Checkbox/radio marks and switch tracks retain intrinsic glyph geometry inside labelled or role-sized targets. Evidence rows identify source, measurement context, and an action opening the persisted record. Loading/empty states preserve layout and explain absence through the availability vocabulary.

Confirmed first-use analytical states omit filters, charts, and table reservations that cannot change or explain the result. Keep controls that can recover a filtered or uncovered state, and render persisted measured zero or partial-provider evidence through its normal measurement surface.

### Documentation

Docs uses a white reading surface, a 240px navigation column, a 216px contents rail and a 46rem article column. Desktop gutters are 20–40px; the contents rail collapses below 1200px, the tabs wrap below 900px and navigation collapses below 768px. Section tabs and navigation groups use Lucide icons. The current page is the only accent: an accent-soft row with a forest rail in navigation, a forest edge in the contents rail, and the article's group label above its title. Tables and code sit in framed panels; notes are forest-railed callouts; previous/next links are raised cards.

The contents panels include H2/H3 entries, omit leading step-number prefixes from link labels, and retain authored headings and anchor IDs. Active-heading tracking is progressive enhancement: ordinary anchors remain usable without JavaScript. Existing quotes, code and table headers use semantic tinted surfaces. Search, generated tool references, keyboard access, CSP and print support remain intact.

### Navigation and overlays

- **Navigation:** current sidebar locations use a raised `panel` face with primary label/icon ink; hover uses `hover`, pressed feedback uses `active`. Preserve contrast and avoid translation. Page controls sit on a tonal band; identity and tab navigation bands stay on paper. Selected tabs use the theme's accent underline.
- **Menus:** shared panel/item recipes, `shadow-overlay`, 12px overlay radius, short system-curve entrance. Filters/page-kind selectors use shared custom Radix menus, not browser-native `<select>` popups. Single-select filters use radio items. Feature components never import Radix directly.
- **Sheets/dialogs:** `components/ui/drawer.tsx` owns right-side modal sheets; use `shadow-modal` and the shared overlay radius. Scrim dims/locks the page; outside click, Escape, and close dismiss. Restore trigger focus, including controlled dialogs. Owners provide padding/footer separation; consumers do not recreate chrome. Tooltips use `shadow-overlay` and the same 12px radius. Features own no shadow recipes.
- **Selection:** underline tabs navigate views or mutually exclusive tables with keyboard navigation and preserved selected-tab focus. Segmented controls use the recessed `track` for compact single-select changes; selected items use a raised neutral `panel` face and primary ink; unselected items use secondary ink and the distinct hover tint. Segment labels use the `badge` role (12/16, 500) so a page's filter row stays one row. Tabs and segments stay on a single row and scroll when labels exceed the available width; keyboard focus reveals the focused option. Filled tabs share spare width without shrinking below their labels; shared UI filter pills handle independent/multi-select filters.
- **Analytical loading:** interval changes retain prior analytical content while the new persisted projection loads. Mark the region busy with compact feedback; no replacement skeleton or labels describing data not yet received.

### Component state contract

| Family | Rest, hover and pressed | Selection or checked | Disabled and invalid |
| --- | --- | --- | --- |
| Buttons | Semantic action fills; secondary/ghost neutral hover and active tints | Toggle/open triggers use selected tint | Neutral disabled fill and muted ink; pending content sizes within the button |
| Fields | Input surface, stronger enabled hover border, central outline | Text selection remains browser-native | Disabled neutral fill; invalid danger edge with owner-provided error text |
| Select family / menus | Shared menu-height, hover and pressed tints | Selected tint and check/ARIA selection, distinct from highlight | Muted disabled rows; existing field invalid contracts retained |
| Tabs / segments | Neutral hover and pressed tints | Tabs have accent underline; segments raised neutral face | Muted disabled controls; roving keyboard model retained |
| Tables | Standard 36px or opt-in dense 32px rows, hover/pressed tints | Highlight/selected tint; sorted headers use primary ink and existing sort indicator | Existing semantic table contracts retained |
| Navigation / palette | Neutral hover and pressed tints | Current sidebar selection uses raised paper and primary ink; palette selection retains its neutral tint | Existing entitlement availability retained |
| Checkbox / radio / switch | Neutral unchecked surface and hover feedback | Accent check/dot/track; checkbox indeterminate mark | Neutral disabled fill; radio dot remains visible in forced colours |
| Filter chips / badges | Chip hover/pressed tints; badges static | Chips selected tint with pressed semantics | Neutral disabled chips |
| Alerts / read errors / toast | Labelled status icon/text; actionable controls follow shared states | Info/success/warning/danger meanings remain distinct | Toast's existing success-only API remains; errors use existing read-error/alert owners |

Focus uses the central recipe for every interactive family. Invalid states apply where the existing component API supports validation; this refresh does not add props or validation policy to choice/navigation/status owners.

Only `shadow-none`, `shadow-overlay` and `shadow-modal` utilities are available to product consumers. Shared material classes own resting elevation: `surface-card`, `control-raised`, `selection-track`, `selection-raised` and `shell-link`; feature call sites do not author shadows. Their `--elevation-*` recipes live in `globals.css`, including dark-mode overrides. Detached menus/popovers/tooltips/palette use overlay, dialogs/drawers/floating toast use modal. Radius families are control 8px, card/well 12px, overlay 12px, xs 4px for intrinsic sub-elements and full for true pills/dots/avatars. Public stages, tiles, link cards and focused flow sheets use 16–20px corners.

## Motion and accessibility

Product and shared-control motion consumes the centralized roles: `--motion-fast` 110ms for hover/micro-feedback, `--motion-normal` 150ms for menus/tooltips, `--motion-slow` 240ms for dialogs/drawers/toasts. Implicit Tailwind transitions inherit the fast duration and standard easing. Standard and enter easing are cubic-bezier(0.33, 1, 0.68, 1), exit is (0.2, 0, 1, 0.9). Repeating activity/shimmer cycles derive from these roles. Keyboard command interfaces and route/tab content update immediately; press feedback begins on pointer-down. Separately owned marketing choreography and onboarding research's 220ms/60ms reveal/stagger remain scoped. Functional delays (tooltip delay, toast dwell, first-load reveal delay) remain independent from motion duration. Browser autofill's paint-suppression timing is a technical exception.

Public-site motion is quiet and never gates content. Header menus open after a 110ms hover intent (immediately when switching between open menus or on click/focus), unfold over 300ms with their rows settling 70ms later, and fold away over 170ms while already inert. Page heroes rise in reading order with an 80ms stagger; the title only sharpens and settles, so it is never invisible at first paint. Section openers, product stages and cards rise on scroll through native scroll-driven animation only where supported. Stage dot lattices drift slowly, tour tabs cross-fade their view, and call-to-action arrows lean toward their destination on hover.

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
