# CiteLadder Design System

> Canonical visual and interaction contract for marketing, authentication, onboarding, and the authenticated application. This is the only design-system document.

Existing owners govern production workflows. Visual work must not change factual copy, data, feature claims, scripted preview content, transactions, or explicit confirmation gates without approval. Product decisions remain with the owning feature contract.

Tests verify shared ownership, accessibility, and product correctness—not exact classes, fonts, pixels, or CSS recipes as a second visual authority.

## Direction and identity

One system covers every surface (owner decision, 2026-10-07): the public site, docs, auth, onboarding and the authenticated app share the light B2B SaaS system executed at Attio/Linear craft. The product's material is crisp hairlines, not lift ([decision](decisions.md#the-product-app-uses-hairlines-not-lift), 2026-10-16): cards and the workspace sheet are a one-pixel `border` edge, secondary controls add only a one-pixel contact shadow, and the primary action is one flat fill; nothing glows, carries a bevel or a sheen. CiteLadder keeps its content, routes and workflows; since the brighter refresh ([decision](decisions.md#the-brighter-refresh-signal-green-sora-and-general-sans), 2026-10-21) its one accent is signal green and its self-hosted type is Sora over Geist. The public website and docs are the exception: they are flat ([decision](decisions.md#the-public-website-is-flat), 2026-10-16; see Public website below).

CiteLadder (`citeladder.com`) is an evidence-led enterprise system. The app puts a quiet green-tinted neutral ground behind the chrome and floats the work on one white sheet, using near-black green-tinted ink, signal-green actions, semantic evidence washes, useful density, and deliberate negative space. Prioritise current state → movement → next action → evidence, not equal-weight KPI cards. Voice is direct, confident, specific, and evidence-led: one idea per sentence.

- **Logo:** `frontend/components/ui/logo-mark.tsx` owns every surface's lockup and draws it inline from `logo-glyphs.ts` in exactly two tokens: ink (`currentColor`, the speech bubble and "Ladder") and the accent (the bars and "Cite"). Both forms therefore follow the theme without a filter, and the mark-only glyph always matches the lockup. `frontend/public/citeladder-logo.svg` is the same drawing in the light values (ink `#0b0f0d`, signal green `#00a650`) for structured data and the docs build; the policy check maps each of its fills to its token. `BRAND_LOGO_SIZES` owns standard heights; explicit `size` supports exceptional layouts; non-empty `alt` supplies the accessible name. `frontend/public/citeladder-favicon.ico` owns browser/installable-app icons with the same ink silhouette.
- **Typography:** self-hosted Geist (`--font-text`, a grotesk with true tabular figures; OFL-licensed) on every surface for body, UI, data and small headings, and self-hosted Outfit (`--font-heading`, from the private Cube27 font repository) for display headings: the product page title, public hero, page and section headings, the flow title and Markdown `h2` (owner decisions, 2026-10-21 and [2026-10-31](decisions.md#outfit-replaces-uncut-sans-for-display-headings)). Both are capped at weight 500 by their `@font-face` ranges (the public Geist face at 600, for card titles), with `font-synthesis-weight: none` so a bold request never renders a faux bold; 14px working baseline, except on the website and docs, whose type steps through the `--text-site-*` tokens. Each semantic role owns size, leading, weight, tracking, and ink together. In the product, hierarchy comes from size and weight together through the closed `.type-*` roles (see Product app ladder); shared fields and dropdowns use the 14px `--text-field` role on every surface.
- **Icons:** Lucide only; import concepts from `frontend/lib/icons.ts` where available. Call sites set size only: `size-3`/`size-3.5` for dense tables, toolbars, and chips; `size-4` for chrome; `size-5` for empty states and marketing wells; larger only for decorative marks. The global stroke ladder derives approximately 1.3px stems from size. Keep `currentColor`; do not override stroke weight locally.
- **Surface identity:** Light is the default. The app header carries a one-click circular light/dark toggle beside the account menu (`frontend/lib/theme/theme.ts` owns the per-device preference; the semantic tokens rebind under `[data-theme='dark']`). There is no automatic system-theme following. Marketing is light-only and never applies the preference. Signal green is the sole action accent on public and product surfaces, and the logo is drawn in the same ink and green. Provider marks retain their own brand colours. The app's sidebar shares the neutral shell ground, and the work floats beside it on one white workspace sheet. Auth and onboarding share the public website's light world (white stage, public palette, flat task sheet); in dark mode they keep the app's dark rebinds. Dark mode keeps the same tonal order in near-black neutrals with the same slight green tint, and its material leads with light hairline rings. Controls retain white fills and distinct edges in light mode. Marketing and docs remain light-only.

## Source of truth and implementation rules

| Owner | Responsibility |
| --- | --- |
| `frontend/apps/app/src/globals.css` | Global tokens, shared geometry, interaction rules, animations, and the single `@theme` definition |
| `frontend/apps/app/index.html` and `frontend/components/marketing/chrome/PublicFonts.astro` | Self-hosted Geist (`--font-text`) and Outfit (`--font-heading`) loading and their metric-matched fallbacks in each runtime |
| `frontend/scripts/pull-licensed-fonts.mjs` | The licensed font list; copies the binaries from the private `Cube-27/cube27-fonts` repo, which the public repo must never contain |
| `frontend/apps/app/src/website-type.css` | Imported public/auth/onboarding type roles and focused-flow geometry; same font and semantic palette |
| `frontend/components/ui/` | Shared controls, typography, layout, panels, and overlays |
| `frontend/components/marketing/` | Existing marketing primitives |
| `frontend/components/layout/nav-items.ts` | The shared navigation registry |

Do not add raw hex colours, `@theme`, shared control recipes, or unregistered animations outside `globals.css`. Homepage-only neutral and preview values belong to the scoped `.cl-landing` tokens there; shared chrome and other marketing pages keep the semantic palette. Do not redefine shared geometry per surface. Reuse primitives before creating another. Public/auth type roles may have their own scale; embedded product previews reset to the app ladder.

`pnpm check:policy` guards raw colours, stray `@theme`, legacy identifiers, ownership boundaries, `font-*` weights, raw text sizes, leading, tracking and faces outside `components/ui/`, the retired `subtle` ink, off-grid spacing, alpha-faded borders, size-named radii (`rounded-sm|md|lg|xl`), and per-surface geometry redeclarations. It also parses every stylesheet and Astro `<style>` block (literal radius, type, off-grid spacing, raw durations and easings, bespoke outlines and shadow recipes), reads TSX for arbitrary radii, literal dimensions outside `components/ui/`, inline-style literals and icon stroke overrides, checks every SVG paint against `currentColor` or its brand token, fails on duplicate token values, unconsumed tokens and stale generated tables, and checks the contrast and colour-vision matrix. Debt that predates a rule is ratcheted in `frontend/scripts/design-system-baseline.json`: counts only fall. Tailwind's default radius scale is cleared in `@theme`. The capability/ownership map remains in [frontend-architecture.md](frontend-architecture.md), under Component capability.

## Colour

Consume semantic roles, never page-local values. Every neutral keeps the same slight green tint, including interaction tints. Two things that mean the same thing share a token; two things that mean different things never share a value (`audit-design-tokens.mjs --check` fails on an undeclared duplicate).

| Role | Tokens | Use |
| --- | --- | --- |
| Ground | `background` | One neutral ground behind the rail and around the workspace sheet; white on public and light flow surfaces |
| Structure | `background-alt`; `panel-tonal`; `well`; `track` | Tonal bands and panels, recessed wells, the segmented-control track |
| Paper | `panel`, `input`, `elevated`, `surface-inverse` | The workspace sheet, inputs, semantic objects, overlays, tooltips |
| Ink | `foreground`; `secondary`; `muted`; `ink-faint`; `brand-ink` | Exactly three text inks (owner decision, 2026-10-09): a softened ~80% black for titles and values, a very dark grey for sentences and labels, a light grey for captions and metadata, mirrored in white for dark mode. The website, docs and light-mode sign-in and onboarding rebind the same three inks darker (owner decision, 2026-10-11): near-black `#151a17`, dark-grey `#3d4541` and mid-grey `#4e5450`, each at least 20% darker than the product's, spaced like IBM Carbon and GitHub Primer, so no light grey carries text there. `ink-faint` is decorative only and never carries text; `brand-ink` is the logo and inverse surface, kept at full strength |
| Boundaries | `border-subtle`; `border`; `border-strong`; `border-bold` | A rule inside one surface; the edge of a control, inset panel or overlay; deliberate emphasis; small choice controls and edges on tinted fills |
| Neutral states | `hover`, `selected`, `active`, `disabled` | The receiving surface mixed with `state-ink` (a green-tinted ink) at 4%, 8%, 12% and 3%, so they stay in the neutral family |
| Action | `accent`, `accent-hover`, `accent-active`, `accent-fill`, `accent-fill-hover`, `accent-fill-active`, `accent-fg`, `accent-text`, `accent-soft`, `accent-subtle`, `accent-border`, `selection` | Signal green: tab underlines, tracks, selection markers, the bars of the logo. Anything that carries ink on green (buttons, the selected day, checked marks) fills with the deeper `accent-fill` and white `accent-fg` ([decision](decisions.md#filled-controls-carry-white-ink-product-views-are-windows)); dark mode keeps the bright fill and dark ink. Links and focus use the deeper `accent-text`. Never success, never a chart series |
| Outcome scale | `success`, `warning`, `danger`, `info`, `neutral`, each with `-text` and `-bg` | Every state in the product (see below) |
| Series | `chart-1..8`; `citation-*` aliases | Categorical identity in charts and legends only |
| Identity | `brand-google-*`, `brand-claude`, `brand-gemini` | Google's own mark (sign-in, engine logo) and the Claude and Gemini marks in the homepage engine rotor; never state |

**Outcome scale.** One scale carries run status, score bands, sentiment, alerts and badges; there are no per-feature status palettes. `danger` is bad, `warning` is mixed or partial, `success` is good, `info` is active or in progress, `neutral` is not started, queued or cancelled. Each family is a mark (dots, rings, icons, bars), a `-text` ink that passes 4.5:1 on its `-bg` and on paper, and a quiet `-bg`. The marks separate by lightness as well as hue (bad is dark red, good is mid teal, mixed is light amber, neutral is the palest), so every pair stays apart under deuteranopia and protanopia: ΔL* of at least 15, or ΔE2000 of at least 10 under simulation, checked by `pnpm check:policy`. Success is teal so it never reads as the forest action. Score bands map low → danger, mid → warning, good → success at a lighter step, high → success. Colour is never the only cue: every mark ships with a label or an icon.

**Series.** `chart-1..8` is purely categorical and never equals an action or outcome value. Each step holds 3:1 on paper in both themes, and each neighbour stays separable under red–green colour-vision loss, so series are assigned in order. Citation classes are series with fixed meanings in both themes: owned `chart-1`, competitor `chart-2`, third party `chart-8`.

Hierarchy combines the ground and paper fills with hairlines. Cards and the workspace sheet are a one-pixel `border` ring with no drop; secondary controls are the same ring plus a one-pixel contact shadow; primary and destructive buttons are one flat fill ringed in their own colour. Fields carry their border and no shadow. The current sidebar destination and a selected list row take the neutral `selected` tint of the surface they sit on, not a raised face; segmented controls keep their raised segment. A recommendation card is the `accent-soft` wash with an `accent-subtle` hairline. `[data-public-surface]` and light-mode `[data-flow-surface]` bind `--elevation-control`, `--elevation-primary`, `--elevation-card` and `--elevation-flow` to `none`, and a coded product view (`[data-ui]`) restates them so its contents keep the product's material. There, a secondary button takes the `background-alt` fill (`panel` on a soft band) instead of its ring. In dark mode the ring is 6–8% white, because a drop shadow carries no edge on near-black. Detached menus and dialogs retain their own elevation roles.

Category tags use ten independent `--tag-{tone}-{bg,border,text}` triples in
`globals.css`: blue, purple, green, moss, red, orange, amber, teal, yellow and
neutral. Light mode uses pale fills and dark ink; dark mode uses dark-tinted
fills and light ink. `tagClasses` in `tag-variants.ts` owns their pill
recipe, and `Tag`/`TagGroup` consume it. Static tags retain a fine tone border;
interactive filters and overflow disclosure use shadow rings. Topic tags use
blue and company offerings use purple; colors label categories, never status.
`TagGroup` shows two labels and a `+N` disclosure that expands in place with
keyboard/touch support and `aria-expanded`; long labels wrap. Semantic `Badge`
status dots and their meanings remain separate.

**Borders.** Controls, inset panels, overlays and status objects retain semantic edges. Default cards use an inset hairline without changing their box geometry; table wrappers remain fill-separated. Selected sidebar destinations and list rows take the neutral selected tint; segments use a raised neutral face. Tinted inset boxes use their fill as the boundary; status cards retain a hairline to carry meaning. Sections are separated by space. Lines use semantic tokens; transparent layers belong only to the centralized elevation recipes. On the public website there are no dividers or 1px outlined boxes outside real tables, form fields and controls: rows and lists separate by space, and objects by a tone step from the band they sit on.

Reading text must meet 4.5:1 contrast. Use primary ink on selected surfaces when secondary ink would lose contrast. Accent denotes action, never success or positive metric deltas. Metrics use data-viz or neutral signed/directional treatments. Decorative icons and category labels use neutral ink. Dark mode keeps colour concentrated in actions and meaningful evidence. Never communicate meaning through colour alone.

The public website, login and onboarding follow the B2B SaaS category standard at Attio/Linear craft (owner decision, 2026-10-07). `[data-flow-surface]` in light mode rebinds only the ground, to white; ink, edges, bands and material are the product's own. The public website and docs (`[data-public-surface]`), and in light mode sign-in and onboarding, are flat, Lattice-style ([decision](decisions.md#the-public-website-is-flat), 2026-10-16): nothing at rest casts a shadow, there are no gradients and no button sheen, and surfaces separate by a tone step (white, `background-alt`, `well`) or by space; a section may change its whole field colour. Only detached layers (menus, the consent bar) and product views keep the overlay shadow: every coded product view (hero picture, product shot, homepage tile) is the same white window with the overlay ring and soft lift, so it never merges with the page ([decision](decisions.md#filled-controls-carry-white-ink-product-views-are-windows)). There is no dark band. The shared dot lattice (`--lattice`, 16px) sits behind the closing band and the auth stage, masked so it never sits behind text; product windows sit straight on the page with no stage tone behind them. The homepage hero runs up under the transparent nav, so the bar sits on the hero's ground until the page scrolls. Below 640px the homepage copy takes its own composition (owner, 2026-10-21): left-aligned copy with full-width actions, the product edge to edge, the engines as a two-column list and a left-aligned close. The product views inside it are the desktop picture scaled down, sidebar and every control included, with nothing hidden or reflowed and very small text accepted ([decision](decisions.md#product-views-scale-down-on-phones), 2026-10-31; see Patterns below). The homepage sits on one neutral ground ([decision](decisions.md#the-public-site-gets-a-neutral-ground-and-inks), 2026-10-31; `apps/marketing/src/pages/landing-wireframe.css`, one switchable stylesheet that adds no element): every band, the hero included, sits on the one `site-ground` field (no mint field or grain; the announcement strip shares the ground) except the closing band, which keeps its mint field and lattice as on every page, with no rails, band rules or column dividers, bento and team tiles and hovered capability rows are white cards on the card radius kept inside the content edge, and the capability group labels are white chips, which carry the one at-rest shadow on the public site (`--shadow-site-chip`) besides product views. The accent stays on buttons, links and the logo. The flow bar and action bar carry no rule, the "or" between Google and email sign-in is a word without lines, and onboarding review cards are `background-alt` tiles. Account access (sign-in, sign-up and the mailbox screens) is one flat sheet split into the form column and a flat `field-mint` brand panel carrying the site tagline over a decorative answer-and-citation illustration that assembles once on arrival; below 900px the panel drops away and the sheet is the form alone. Evidence colour lives only inside product views.

Geometry is one ladder on every surface: 4 / 8 / 12 / 16 / full (see Data and geometry). The public container measure (`max-w-7xl` plus `--site-gutter`) is shared by navigation, hero, sections and footer.

## Token contract

The surface ladder is ground → resting panel → recessed well, with `elevated`
reserved for detached floating surfaces. State tints follow the surface they
modify: mix `state-ink` into that surface at 4% for hover, 8% for selection,
12% for pressed feedback, and 3% for disabled fill. The source surface classes
own this derivation in `globals.css`. Selected and pressed labels use primary
ink; dark chrome uses neutral tints rather than an accent wash.

The table below is generated from `globals.css` by
`node frontend/scripts/audit-design-tokens.mjs --write` and checked by
`pnpm check:policy`; never edit it by hand. Light/dark values are the effective
product defaults; state values show the panel context. Roles and purposes are
the Colour section above. Every token must have a consumer.

<!-- generated:tokens:start -->
| Token | Light | Dark |
| --- | --- | --- |
| `--color-accent` | `#00a650` | `#76df9c` |
| `--color-accent-active` | `#009447` | `#b2f4c6` |
| `--color-accent-border` | `#7fdca7` | `rgb(118 223 156 / 45%)` |
| `--color-accent-fg` | `#ffffff` | `#0d2618` |
| `--color-accent-fill` | `#00873f` | `#76df9c` |
| `--color-accent-fill-active` | `#006d33` | `#b2f4c6` |
| `--color-accent-fill-hover` | `#007a39` | `#94ebb0` |
| `--color-accent-hover` | `#00b85a` | `#94ebb0` |
| `--color-accent-soft` | `#edfbf2` | `rgb(118 223 156 / 12%)` |
| `--color-accent-subtle` | `#d3f6df` | `rgb(118 223 156 / 18%)` |
| `--color-accent-text` | `#08773b` | `#86e5a6` |
| `--color-active` | `#e4e8e6` | `#2a2d2b` |
| `--color-background` | `#f4f5f4` | `#0b0d0c` |
| `--color-background-alt` | `#f6f7f6` | `#181b19` |
| `--color-border` | `#e1e4e2` | `#2b302d` |
| `--color-border-bold` | `#858d88` | `#737b76` |
| `--color-border-strong` | `#cfd4d1` | `#3d433f` |
| `--color-border-subtle` | `#eceeed` | `#212522` |
| `--color-brand-claude` | `#d97757` | `#d97757` |
| `--color-brand-gemini` | `#3186ff` | `#3186ff` |
| `--color-brand-google-blue` | `#4285f4` | `#4285f4` |
| `--color-brand-google-green` | `#34a853` | `#34a853` |
| `--color-brand-google-red` | `#ea4335` | `#ea4335` |
| `--color-brand-google-yellow` | `#fbbc05` | `#fbbc05` |
| `--color-brand-ink` | `#0b0f0d` | `#e1e5e2` |
| `--color-chart-1` | `#16a34a` | `#4ade80` |
| `--color-chart-2` | `#2563eb` | `#60a5fa` |
| `--color-chart-3` | `#d97706` | `#fbbf24` |
| `--color-chart-4` | `#db2777` | `#f472b6` |
| `--color-chart-5` | `#0891b2` | `#22d3ee` |
| `--color-chart-6` | `#7c3aed` | `#a78bfa` |
| `--color-chart-7` | `#ea580c` | `#fb923c` |
| `--color-chart-8` | `#6b746f` | `#9aa29d` |
| `--color-citation-competitor` | `#2563eb` | `#60a5fa` |
| `--color-citation-owned` | `#16a34a` | `#4ade80` |
| `--color-citation-third-party` | `#6b746f` | `#9aa29d` |
| `--color-danger` | `#b42332` | `#ef6b73` |
| `--color-danger-bg` | `#fff0f1` | `rgb(243 151 158 / 13%)` |
| `--color-danger-border` | `#f2c6cb` | `rgb(243 151 158 / 38%)` |
| `--color-danger-fg` | `#ffffff` | `#350b10` |
| `--color-danger-solid` | `#b42332` | `#d95767` |
| `--color-danger-solid-hover` | `#8f1d29` | `#eb7481` |
| `--color-danger-text` | `#b42332` | `#f6abb1` |
| `--color-disabled` | `#f8f9f9` | `#191c1a` |
| `--color-elevated` | `#ffffff` | `#1b1f1d` |
| `--color-field-lime` | `#e4fb9b` | `rgb(228 251 155 / 12%)` |
| `--color-field-mint` | `#e8f9ee` | `rgb(118 223 156 / 16%)` |
| `--color-foreground` | `#2f3431` | `#d3d8d5` |
| `--color-hover` | `#f6f7f7` | `#1b1e1c` |
| `--color-info` | `#2f6fdb` | `#7aa7f5` |
| `--color-info-bg` | `#eef4fd` | `rgb(122 167 245 / 13%)` |
| `--color-info-text` | `#1d4fae` | `#a9c6f8` |
| `--color-ink-faint` | `#8e9690` | `#6d746f` |
| `--color-input` | `#ffffff` | `#0f1210` |
| `--color-muted` | `#616964` | `#939a96` |
| `--color-neutral` | `#aab2ad` | `#5f6762` |
| `--color-neutral-bg` | `#eff1f0` | `#212523` |
| `--color-on-inverse` | `#ffffff` | `#0b0d0c` |
| `--color-overlay-scrim` | `rgb(11 15 13 / 32%)` | `rgb(0 0 0 / 72%)` |
| `--color-panel` | `#ffffff` | `#131614` |
| `--color-panel-tonal` | `#f8f9f8` | `#171a18` |
| `--color-secondary` | `#4e5551` | `#a9b0ac` |
| `--color-selected` | `#edefee` | `#222623` |
| `--color-selection` | `#b5efca` | `rgb(118 223 156 / 35%)` |
| `--color-selection-fg` | `#2f3431` | `#f1f4f2` |
| `--color-state-ink` | `#1c3d2c` | `#d3d8d5` |
| `--color-success` | `#0d9488` | `#2ec4b0` |
| `--color-success-bg` | `#ecf8f5` | `rgb(46 196 176 / 13%)` |
| `--color-success-text` | `#0f766e` | `#7fe0d0` |
| `--color-surface-inverse` | `#0b0f0d` | `#e1e5e2` |
| `--color-track` | `#eceeed` | `#0f1210` |
| `--color-warning` | `#e0900f` | `#f2c879` |
| `--color-warning-bg` | `#fff5db` | `rgb(242 200 121 / 13%)` |
| `--color-warning-text` | `#8a4600` | `#f7d99e` |
| `--color-well` | `#eff1f0` | `#0e100f` |
<!-- generated:tokens:end -->

## Typography

Public display headings set in Outfit at −0.02em: the hero at weight 400, the page and section headings at 500. The card and feature title sets in Geist 600, the one public role above 500 (the public Geist face runs to 600 for it). Product-app headings keep normal tracking.

Use Geist for text, figures, labels and small headings on every surface, and Outfit only for display headings; metrics, dates, ranks, and percentages explicitly use tabular numerals, not monospace. Numbers retain their data roles rather than display roles. Weights are 400 (sentences) and 500 (labels, controls, badges, titles, figures); there is no heavier rung, so titles separate from labels by size. Product titles and figures tighten their tracking as size grows (page title −0.01em, figure −0.02em, section title −0.011em). Do not assemble page-local size/weight/ink hierarchies.

There is one scale for every surface in `globals.css` (12 · 14 · 16 · 18 · 20 · 24 · 28 · 32, plus the public display roles at 40, 44, 64 and 68), and no surface rebinds it. 14px is the baseline on every surface: body, controls, navigation and labels. The exception is the website and docs, whose roles read the `--text-site-*` tokens in `website-type.css` ([decision](decisions.md#the-public-site-gets-a-neutral-ground-and-inks), 2026-10-31): reading copy (`.website-body`, the marketing checklist) is 17px on a phone, 14px on a tablet and 16px from 1200px, and the display sizes 15, 17, 26, 39, 48 and 64 are the site's own; blog article prose keeps its rungs, and sign-in and onboarding keep theirs. 12px is the one rung below it (captions, badges, deltas, eyebrows, flow meta) and is used sparingly; 10px is reserved and currently unused. There is no 13px rung. Above 14px, adjacent rungs differ by at least 2px. The rungs follow the 4px rhythm that Atlassian, Primer and Carbon share. No stylesheet sets a literal `font-size` or `line-height` outside the role definitions; everything else uses `var(--text-*)`.

The sizes below are generated from the role definitions in `globals.css` and `website-type.css`.

<!-- generated:type:start -->
| Role | Surface | Size / line height | ≥768px |
| --- | --- | --- | --- |
| `.type-badge` | product | `12px / 16px` | — |
| `.type-body` | product | `14px / 20px` | — |
| `.type-caption` | product | `12px / 16px` | — |
| `.type-control` | product | `14px / 20px` | — |
| `.type-delta` | product | `12px / 16px` | — |
| `.type-figure` | product | `24px / 32px` | — |
| `.type-figure-sm` | product | `16px / 24px` | — |
| `.type-item-title` | product | `14px / 20px` | — |
| `.type-label` | product | `14px / 20px` | — |
| `.type-page-title` | product | `20px / 28px` | — |
| `.type-section-title` | product | `16px / 24px` | — |
| `.flow-group-title` | public | `16px / 24px` | — |
| `.flow-help` | public | `14px / 20px` | — |
| `.flow-meta` | public | `12px / 16px` | — |
| `.flow-title` | public | `28px / 36px` | — |
| `.website-article-title` | public | `clamp(20px, 5.6vw, 24px) / inherit` | `32px / 40px` |
| `.website-body` | public | `17px / 1.4` | — |
| `.website-data-display` | public | `28px / 36px` | `32px / 40px` |
| `.website-feature-heading` | public | `16px / 1.2` | — |
| `.website-hero-display` | public | `32px / 1` | — |
| `.website-label` | public | `14px / 20px` | — |
| `.website-lead` | public | `15px / 1.2` | — |
| `.website-nav` | public | `14px / 1.2` | — |
| `.website-page-title` | public | `clamp(24px, 6.4vw, 28px) / 1.2` | `36px / 44px` |
| `.website-section-heading` | public | `26px / 1.05` | — |
<!-- generated:type:end -->

### Website and focused-flow ladder

Roles own all typography properties. The public ladder is mobile-first in three bands, phone (below 810px), tablet (810–1199px) and desktop (1200px and up), set once as `--text-site-*` tokens; the page title, article title and data display keep one step at 768px. The generated table above shows the phone size of a token-driven role. Ordinary paragraphs stay at or above 14px. Prose measure is 45–75 characters, except the documentation article column, which can reach 85ch to sit closer to its side navigation, and blog articles, which span the site container with the text column filling the space up to the contents rail (owner decision, 2026-10-11); long paragraphs never use accent ink. Body tracking is zero or slightly negative; large text uses calm leading.

| Role | Class | Job |
| --- | --- | --- |
| Hero display | `website-hero-display` | The homepage headline; tracks the viewport on phones |
| Page title | `website-page-title` (`website-article-title` on articles) | One H1 per page |
| Section heading | `website-section-heading` | A section's H2 |
| Feature heading | `website-feature-heading` | Card, tile, feature-row and FAQ headings |
| Lead | `website-lead` | The sentence under a page or section heading |
| Body | `website-body` | Paragraphs |
| Navigation/actions | `website-nav` | Header links and inline actions |
| Label | `website-label` | Names a value, a list group or a breadcrumb |
| Data display | `website-data-display` | Pricing figures only; tabular |
| Flow rungs | `flow-title`, `flow-group-title`, `flow-help`, `flow-meta` | The focused flow: title (24→28), group title (16), help (14) and meta (12) |

Phone → tablet → desktop: the hero is 32 → 48 → 64px (line height 1, weight 400); the section heading 26 → 32 → 39px (1.05); the feature heading beside a product shot (`.mk-dive-title`) keeps the page title's phone size and 32px from 768px, in the heading ink; the lead, the subtitle under a heading, 15 → 18 → 24px at 500 in the soft ink (the homepage hero lead is body copy instead); card titles 16 → 18 → 18px (1.2, weight 600); body 17 → 14 → 16px (1.4, −0.2px). FAQ questions are 16px/1 at 500 in the strong ink, FAQ answers, captions and capability descriptions 14px/1.6, header links 14px at 400 in the nav ink, header buttons 14px and page CTAs 15px at 500 on a 16px line. Page titles track the viewport on phones so they hold two lines from 360px (long article titles three) and top out at 36px (40px on marketing pages from 768px, 36px from 900px and 56px from 1280px, `marketing.css`; docs and articles keep their rungs). Inks are `--color-site-*` (globals.css): `#171717` headings, `#000` FAQ questions, `#707070` sentences, 60% ink navigation, footer links (`#6d6d6d` on a phone) and subtitles, and 55% black lead-in labels; the lighter inks are deliberately lighter than the headings but each meets 4.5:1 on white, the ground, `background-alt` and `field-mint` (checked by `pnpm check:policy`). Embedded product previews (`.app-type-scale`) reset to the product ladder below and keep the product inks.

### Product app ladder

The roles are `.type-*` classes in `globals.css` (components layer, so a status utility such as `text-danger-text` can still set the ink). Reach them through `textRole(role, layoutClasses?)` from `components/ui/typography.tsx` or the class itself; name the text's job rather than overriding its typography. Call sites outside `components/ui/` never set a size, leading, tracking, face or weight.

| Role | Class | Job | Ink |
| --- | --- | --- | --- |
| `pageTitle` | `type-page-title` | The route H1, one per page; display face, −0.01em | `foreground` |
| `figure` | `type-figure` | A metric value; tabular | `foreground` |
| `sectionTitle` | `type-section-title` | Section, card, drawer and dialog headings | `foreground` |
| `figureSm` | `type-figure-sm` | A value in a dense row or cell; tabular | `foreground` |
| `itemTitle` | `type-item-title` | Row and list-item titles | `foreground` |
| `body` | `type-body` | Sentences, descriptions, table cells | `secondary` |
| `control` | `type-control` | Buttons, navigation, tabs, links | by state |
| `label` | `type-label` | Names a value: metric, field and column labels | `secondary` |
| `caption` | `type-caption` | Timestamps, counts, help, footnotes | `muted` |
| `badge` | `type-badge` | Badges, chips, counts, key hints | the tone |
| `delta` | `type-delta` | Change indicator; tabular | the caller's tone |
| `emphasis` | `type-emphasis` | A value inside text that owns its size | `foreground` |

The ladder is strictly ordered: a section title never out-sizes the page title and a caption never out-sizes the value it describes. A missing figure is the muted dash at the figure's own role (`MetricValue`), so absence sits where the value would. Rendered Markdown uses `.prose-content`, built from the same rungs (reading text 16/24, compact 14/20). Availability labels in running text use `UnavailableValue`.

## Data and geometry

| Context | Desktop | Laptop / compact |
| --- | --- | --- |
| Sidebar | 240px | 224px |
| Compact topbar | — | 56px |
| Content gutter | 32px | 24px / 16px |
| Navigation row / tabs | 32px | 32px |
| Table row (standard / dense) | 36 / 32px | Same roles or labelled record layout |

The product has one control height, 32 (generated below): buttons, icon buttons, fields, selects, filter triggers, segmented controls, tabs, sidebar rows, the project switcher and the account menu. The auth and onboarding flow is product: its buttons and fields are the same 32. There is no smaller rung and no context rebinds it. 36 is the public website's only (the website's coded product views keep a 28 of their own in `website-type.css`): public buttons, marketing CTAs and the docs CTA use 36 with 14px text. 44 is the homepage hero CTA and the phone touch rung of the flow action bar. At 540px and below public CTAs take their text width.

<!-- generated:controls:start -->
| Token | Value |
| --- | --- |
| `--nav-item-height` | `32px` |
| `--control-height-md` | `32px` |
| `--control-height-lg` | `36px` |
| `--control-height-xl` | `44px` |
| `--menu-item-height` | `32px` |
| `--badge-height-sm` | `20px` |
| `--tab-height` | `32px` |
| `--table-row-height` | `36px` |
| `--table-header-height` | `32px` |
<!-- generated:controls:end -->

A figure column (and a trailing control column) passes `numeric`: right-aligned tabular figures, so digits line up place by place. Headers and cells use the same shared alignment option. Text columns stay left-aligned.

Every table shares one row rhythm: `--table-row-height` (36px) is the floor and every cell carries the same 6px `--table-cell-padding-y`, so a row is one line or two and never more. `TableCell` clamps plain text at two lines; JSX cells use `ClampText` (`lines={1}` for each half of a title-over-URL stack). Cut text shows in full in a tooltip. There are no density variants. Numeric cells never wrap. Wide tables use the shared scroll wrapper.

A record table is a `DataTable` (`components/ui/data-table.tsx`): one card holding the header (the title and the table's `FilterBar` on one row, 49px with its hairline — the control band again — flush with the card's top edge, as the column header is in a table with no title: the card has no top padding of its own), the `Table` laid out fixed from column width roles (`lead`, `index`, `figure`, `metric` for a figure whose header names its unit, `status`, `category` for a badge longer than a status, `date`, `name`, `action`, `rowActions` for up to two trailing buttons in a `TableActionsCell`, and one `flex` column), the shared `Pager`, and the read's loading, error and empty states inside the body under the same header row. A column can carry a `hint` (its shared caveat, behind a tooltip on the header, sortable or not), a `sublabel` (a caption under its label, sortable or not) and be `desktopOnly`; a plain header longer than its role wraps rather than overlapping its neighbour. A table's `description` is one caption line under the 49px header row, never a second line inside it; a note about the rows (a truncation notice) is its `footer`. A table that fits on one page shows no pager and no blank rows (owner, 2026-10-21); once its rows run past one page (another page either way, or more rows than the smallest rows-per-page option), it reserves a full page of rows and pads a short last page, so paging never moves the pager, and a fixed list with no pager (top movers) always reserves its rows; rows that stack a caption under their value (`TableCellLines`, `rowLines={2}`) are padded with two-line blanks. `pinFirstColumn` keeps the row identity in view while a wide table scrolls in its frame; `selection` adds a leading checkbox column with a select-all box (each row starts with a `TableSelectCell`); `nested` drops the card when the table sits inside a box that already frames it (a card holding other content, a dialog's preview of parsed rows). The table is named by its title (or `label`) for assistive technology. A selectable list beside its selection's detail is not a record table: it is `ListDetailCard` with `ListDetailRow`s and a `ListDetailPane` (`components/ui/list-detail.tsx`).

Feature screens draw no geometry of their own. Rows and stacks are `Inline` and `Stack` on one gap ladder (section 24, workspace 16, compact 12, item 8, tight 4, and `Inline`'s wrapping `meta` caption row); a glyph is `Icon` (16px, one form) and a status marker beside text is `Dot` (6px); an icon-only control is `IconButton`; a divided list is `ledgerItemClasses`, a nested branch `treeBranchClasses`, a labelled sub-block `SubsectionHeader` and a caption footer `MetaFooter` (`components/ui/workspace.tsx`); a chart's reserved height is `ChartFrame`; a placeholder is a `Skeleton shape` (`line`, `block`, `chart`). An offer or connection row (optional leading mark, text column, trailing controls that drop under the text below `desktop`) is `ControlRow` (`boxed` on the tonal panel), and a row's kind mark is the 32px `IconTile`. A logo or avatar beside a title and caption is `IdentityRow`. Labelled facts are a `FactList` (`ruled`, `inline`, or `spread` with an optional `total`), and a short ranked list that keeps its height is a `ValueLedger`. A selectable option with a check is `OptionRow` and a row that navigates (a workspace to enter) is `NavRow`, both padded 12 across and 8 down; a nested tree rail is `RailItem`/`RailItemForm`, a reorderable list is `ReorderList`, and a widget's editing controls are a `FloatingToolbar`. A brand's multi-colour mark beside a label (the Google "G") is a `BrandGlyph` drawn through `Icon` at 16. A field's end target (clear a search, reveal a password) is `FieldEndButton`, 28px inside the 32px field. A caption under a labelled checkbox (a notice, its error) is `CheckboxCaption`, aligned with the label's text. A literal the reader copies (a URL) is an inline `CodeToken`. A KPI's second window is a `StatRow` segment's `comparison` (a hairline, the window's label and its value in the smaller numeral, `ComparisonValue`); `MetricValue` itself has one form, the `figure` numeral. A page shown instead of the workspace before the shell opens (the Terms review, ended access) is a `GateScreen`, and a whole-page gate notice is a `GateNoticeScreen` (`components/layout`), both inset by the content gutter. On the flow surface the stage results band (`flow-stage-band`), the competitor edit row's rhythm and the 14px check inside the 20px selection mark are owned by `website-type.css`. A chat column is `DockedThread` over a `ComposerDock` holding a `ComposerFrame` (`RemovableChip`s, `SuggestionList`). Widths are roles, never classes: `Dialog width` (`form` 480, `wide` 720, `review` 820), `DropdownContent width` (`panel` 256, `trigger`), `Input width="quantity"` and `FilterField` (160, a typed or picked filter value; the full row below `desktop` inside a `FilterBar`). `Button`, menu items and badges do not resize a descendant `svg`, because that would also resize logos and avatars inside a control; every glyph is the `Icon` atom.

An empty, loading or failed read is a `QueryState`. On the sheet it is its own card surface; nested in a card, panel, dialog or table it shares that container's surface and keeps its 160px footprint. The one-line absence inside a section that otherwise has content ("No orphaned pages.") is its `inline` presentation: one 32px row of muted body text with an optional icon and one action. Never wrap one in a `Card`.

A row of label/value facts is a `StatRow` (`components/ui/stat-row.tsx`): equal segments divided by hairlines, one row of up to four on desktop (more balance across rows), stacked below it. Each segment is padded 12 above and below and 16 from its divider, flush with the card at the outer edges; a row's segments share one height. A segment is a label (optional leading icon and trailing marker), an optional period caption, the `figure` value or a 48px `ScoreRing`, a delta, a sub-line and one action; a pressable segment is a toggle. Website Overview, Pages and page details draw their scores this way. Only supported drill-downs render "View details".

`Avatar`, `BrandLogo`, `Spinner` and `ScoreRing` have no size. `Avatar` and `BrandLogo` take a `placement`: an avatar is `inline` (24, in a row or the account trigger) or `identity` (40, a profile); a brand mark is `mark` (16, a run of favicons in a cell), `row` (20, beside a name) or `identity` (40, the identity header). `Spinner` is the 16px glyph and `ScoreRing` the 48px dial everywhere.

The product has one breakpoint, `desktop:` (981px, `@custom-variant` in `globals.css`), the edge where the sidebar shell appears. Product components change layout only through it; `sm:`/`md:`/`lg:`/`xl:`/`2xl:` and arbitrary `min-[…]`/`max-[…]` breakpoints are not used in `components/` outside `marketing/`, `auth/` and `onboarding/`, which keep the public ladder. `pnpm check:policy` enforces it.

Analytical content caps at 1392px; form-first workflow content caps at 1040px while retaining full-width page bands. Two-column pages pick a role from `splitPaneClasses` in `components/ui/workspace.tsx`, never a ratio: `list-detail` (`--pane-list-detail`, a selectable list beside the selection's evidence) or `main-aside` (`--pane-main-aside`, the primary surface beside supporting context). Both stack below `desktop`. A route's loading, read-error and first-use empty states render inside its screen template, so the identity band never disappears. Spacing is the 4px grid — 4, 8, 12, 16, 20, 24, 32, 40, 48, 64 — plus 2px for hairline insets only; six-, ten- and fourteen-pixel steps are not used. Each rhythm role names one step: label to value 4, icon to text 8, title to content 12, card to card 16, card padding 16, page gutter 32, section to section 24.

The radius ladder is 4 / 8 / 12 / 16 / full on every surface, generated below. Tailwind's default radius scale is cleared, and no stylesheet sets a literal `border-radius`.

<!-- generated:radii:start -->
| Token | Value |
| --- | --- |
| `--radius-xs` | `4px` |
| `--radius-control` | `8px` |
| `--radius-card` | `12px` |
| `--radius-lg` | `16px` |
| `--radius-full` | `9999px` |
<!-- generated:radii:end -->

| Role | Use |
| --- | --- |
| `--radius-xs` (`rounded-xs`) | Chart bars, skeletons, inline code, badges |
| `--radius-control` | Buttons, fields, rows, chips, tabs, menu items |
| `--radius-card` | Cards, semantic objects, menus, tooltips, dialogs, drawers, popovers |
| `--radius-lg` | The app workspace sheet and focused flow sheets, public product frames and stages, bento tiles, link cards, plan cards |
| `--radius-full` (`rounded-full`) | Pills, dots, counts, avatars, filter toggles |

Vertical rhythm belongs to the container: `Stack` from `components/ui/layout.tsx` or container `gap`, not child `mt-*`. Its rungs are `section` 24px, `workspace` 16px, `compact` 12px, and `tight` 4px. A 2px optical nudge, sized glyph, or negative-margin overlap remains allowed.

Marketing subpages and the homepage use `--section-y`: 72px base, 104px from 768px, 128px from 1280px. Adjacent homepage sections of the same tone share one rhythm rather than stacking both paddings. Public stylesheets keep the same 4px grid as the product (checked by `pnpm check:policy`). Auth/onboarding use `[data-flow-surface]` geometry from `website-type.css`: a 64px bar (56px on phones and short laptops), centred task measure, 16px mobile gutter, shared control radius and the shared control ladder. The flow shell owns its scrolling main region and action bar.

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

The app uses a floating sheet (owner decision, 2026-10-07). The desktop sidebar shares the shell ground and draws no edge; `.app-pane-workspace` is one white sheet inset `--workspace-inset` (8px) from the viewport and the rail, with the 16px `--radius-lg` on all four corners and a hairline edge. The rail starts one inset down so its rows line up with the sheet's bands. Current destinations take the neutral selected tint; the Dashboard/Agent selector shares the recessed segment recipe. Metric rows (`StatRow`, up to four segments) sit on one row on desktop, because the sheet beside the rail is still about 700px wide on a 981px desktop; a page's action row never squeezes its title below `--page-title-min-width`, and a route with more than two actions groups the secondary ones in one menu. Cards use the `panel` fill and shared elevation; bare tables carry the `table-frame` hairline ring, which drops inside a card or dialog. Below 981px the workspace runs edge-to-edge without radius, inset or shadow, under a paper topbar with a hairline. Document scrolling and content overflow stay unchanged; the sheet clips its corners without becoming a scroll container. Auth and onboarding use one rounded, flat paper task column with unboxed internal groups, including at mobile widths where gutters remain.

Overview sections, Website metric cards/page tables, Actions lists, and Prompts tables consume their existing shared owners; only semantic cards acquire the card elevation. The desktop account trigger sits on the route's first row; below 981px the 56px compact topbar adds the menu trigger, route title and focus-managed off-canvas drawer. Retain every critical mobile action; tables become labelled records, and filters/evidence use full-height sheets.

#### Screen geometry and shell ownership

| Region | Owns | Excludes |
| --- | --- | --- |
| Desktop sidebar | Project switcher (first row), Search, the Dashboard/Agent mode switch, then either the Overview/Analyze/Track groups or the Agent navigation, Settings access and brand lockup (foot) | Duplicate navigation trees/registries; the account trigger |
| Topbar | Account trigger at every width; below 981px also Menu and compact route title | Fixed bottom navigation |
| Page header | One in-pane route H1 at `pageTitle` (`type-page-title`), existing description, route actions on the same row; entity heading is the sole H1 on detail routes | Metrics or duplicate route H1 |
| Metric row | Three to five headline values, each with its change when one is comparable | More than five, unsupported metrics, or run bookkeeping |
| Analytical surface | The page's primary chart, table, or comparison | Competing equal-weight surfaces |

Keep date ranges and comparisons in their owning page, not the global shell. Align section tabs/actions on one row rather than adding an empty header row. Desktop and compact navigation reuse `nav-items.ts` destinations and capability resolution; hidden navigation never changes direct-route authorisation.

Search's Command Palette remains mounted once in the authenticated shell, not inside the drawer; its trigger lives in the sidebar and in the compact drawer. The account trigger is the topbar's at every width, and renders initials only. Escape closes overlays and focus returns to the visible trigger.

#### Route recipe

Every route assembles the same parts from `components/ui/` and `components/layout/`, so a pattern looks the same on every screen:

| Need | Owner |
| --- | --- |
| Page frame, actions, section tabs, controls | `ListScreen` (identity band → `tabs` → `TabRow` → `controls` → `FilterBar` → content; `measure="workflow"` for form pages, `fill` for a chat column) or `DetailScreen` (the same with the required `back` link above the title, and an optional `aside` in a `main-aside` / `list-detail` split). Both live in `components/layout/page-shell.tsx`, own every band and band gap, and stack content sections 24px apart; `PageShell` itself is internal |
| Section header | `EditorialSectionHeader` for open sections; `CardHeader` with `actions` for cards — never a raw heading or a re-laid-out header |
| Headline figures; dense facts | `StatRow` (`segments`: label, value or `score`, `sub`, `delta`, `action`; pressable with `onSelect`) |
| Record tables | `DataTable` (title, `description`, `toolbar` → `FilterBar`, `columns` with width roles, `hint`, `sublabel` and `desktopOnly`, `pageSize`/`rowCount`/`rowLines`, `pager`, `state`, `pinFirstColumn`, `selection`, `nested`, `footer`; cells `TableCellLines`, `TableActionsCell`, `TableSelectCell`); a list beside its detail is `ListDetailCard` |
| Rows, stacks, glyphs | `Inline`, `Stack` (gap roles); `Icon`, `Dot`, `IconButton` — never a spacing, size or radius class in a feature folder |
| Change | `Delta`: sign, arrow and outcome tone, with `policy` for lower-is-better metrics |
| Usage, progress, distribution | `Meter` |
| Loading, read error, first-use empty, no project | `QueryState` (`kind` loading / error / empty): one 160px card footprint for all three, or `inline` for a one-line absence inside content; `ReadError` only for a section or refresh failure under content that is still shown; `ProjectRequiredState` |
| Two columns | `splitPaneClasses(role)`, `ResizableSplitPane`, `stickyPaneClasses` |
| Settings pages | `SettingsSections` / `SettingsSection` (`components/ui/settings-section.tsx`), with read-only facts in `FactList layout="ruled"`: a ruled list where each section's title and help sit in a narrow column and its controls start at one edge in the wide one; the columns stack in a narrow container such as a dialog |
| Filters, paging | one `FilterBar` (search, filters, status, actions; + `FilterTrigger`) in the template's `controls`, or in a `DataTable`'s `toolbar`, and one `Pager` per list |
| Links; selected rows | `TextLink` (internal, external, back); `listRowClasses` (neutral selected tint, never an accent wash) |
| Tables, charts | `Table minWidth`, `SortableTableHead`; `ChartContainer size`, `LegendSwatch`, `ChartKey` (a static legend) |
| People; brands | `Avatar` (`placement` inline / identity); `BrandLogo` (`placement` mark / row / identity) |

#### Screen-specific contracts

**Overview.** Keep the page useful before any audit. Project identity and warnings lead; the widgets below follow the project's saved layout, whose default reading order is Project State with Track context; Movement; one Next action; where you're missing; ranked actions and report proof; Company facts. Widgets sit in a two-column grid (half or full width) in the same DOM order at desktop and compact widths. Editing lives in one Layout menu, and per-widget controls overlay the widget, so neither entering edit mode nor saving moves anything. Company facts are edited in Agent → Context, not in an Overview drawer. Do not restore a Product loop station strip. Track uses explicit availability labels. Citation share uses separate shared heading/value roles, not an oversized combined sentence.

**AI Visibility.** Exactly three tabs: Trends (default), Sources, Query fanouts; no parallel Overview or page-local project switcher.

The surface speaks the reader's vocabulary, never the measurement schema's. A backend token reaches a reader only through `lib/visibility/vocabulary.ts`, which is the single owner of that translation; an unmapped token renders as nothing rather than raw. Never print an enum, a taxonomy identifier, a scoring field name, or a row id — `no_baseline`, `third_party`, `source-taxonomy-2` and a monospace `task/analysis/artifact` triple all reached customers this way. Run bookkeeping (expected against measured, failed, not-run, skipped configurations, matched-cell counts) is instrumentation, not evidence: keep it out of the default view. A measure's definition belongs in an info hint on its label, not in permanent body copy under the number.

The page carries ONE filter row. Every control in it answers a question a customer would ask — which measurement, over what period, about which prompts, models and view. Selection mode belongs inside the measurement picker rather than beside it; comparison-baseline and frozen-configuration pickers are analyst controls that stay honoured from the URL and are not surfaced as permanent chrome.

Trends presents three headline measures (Visibility, Share of voice, Owned citation rate), one metric-selectable history chart whose control shares the title row, and one competitor comparison table. Where NOTHING in a selection is comparable, a change column is omitted entirely rather than filled with a repeated placeholder; where one row among many lacks a change, it uses the shared availability vocabulary. Use timestamp spacing and break chart lines at unavailable measurements. A single point uses a compact textual state.

Prompt results belong to the Prompts section, on the prompt row, because the prompt is the object a reader came for. Sources splits into Domains and URLs on a segmented control, and its drill-downs keep the page's one filter row rather than becoming routes that would have to re-establish the selection. Query fanouts is one table under a Group by control (None, Prompt, Topic); groups render as spanning rows of that shared table, never as a table per group. Evidence uses ruled execution rows and original-answer links. Retain shared metric, table, typography, spacing, responsive and control primitives throughout; secondary mobile fields use labelled details without removing actions.

**Site Health: crawl and inventory.** Put the crawl control and URL inventory before crawler-bot, file, and page-kind diagnostics; keep the contextual action visible while secondary diagnostics collapse. Use Run new crawl before/after a run and Stop crawl while the persisted crawl is active; Export is secondary. Discovery and analysis are not separate actions. Before the first run, show an actionable empty placeholder; during discovery, show the first ten persisted inventory rows and enrich them in place. When non-zero, progress names Blocked by robots.txt, HTTP 4xx, HTTP 5xx, and Timeouts beside completed work. Waiting copy identifies healthy host-gate/retry-backoff waits; “stalled” requires backend expired-lease evidence, never a browser timer.

**Site Health: findings and evidence.** Separate Defects and Advisories. Defects own severity and Opportunity eligibility; advisories carry Advisory, not severity. Headlines say defect issue types or advisory issue types, with class-labelled occurrences and affected URLs counters. Severity, dimension, and page kinds use compact unboxed metadata; affected-page counts use regular body type. Use one responsive master-detail workspace: compact group list, then a sticky right rail with selected occurrence evidence, affected URLs, remediation, and actions. Stack these regions on narrow screens without hiding evidence; do not restore per-card expansion, queries, or cursor state. Group/URL detail reuse one bounded presenter for persisted occurrences and directly linked evaluations: exact schema types/properties, heading transitions/scope, and offending control descriptors. Unknown shapes use labelled bounded fields, not raw JSON or generic site-wide claims. URL detail opens resolved-issue history from a History page action in the right drawer, never inline and never repeating current issues. The AI crawler robots policy is collapsed by default behind a one-line policy summary, and opens to one compact row per crawler.

**AEO Readiness.** Open directly on a seven-dimension ledger, never a gauge or unexplained number. Aggregate score, coverage, and page-count summaries remain in Overview, which links here through View details. Reuse Overview's score, quality, coverage, and state roles; keep not-applicable rows visible without failure styling. Evidence opens failures-first in the shared right sheet, not an expanding table cell.

**Site Health Architecture.** Lead with persisted Internal linking and Structure depth summaries; follow with five site-level facts and an always-visible page-kind ledger showing kind, pages, median depth, indexable count, duplicate metadata, and orphaned count. Only assigned URL lists expand, in bounded regions. A read-only observed hierarchy shows persisted parents/evidence sources in its own bounded scroll region, without client-side inference.

**Website Changes.** Use an evidence ledger with four named classes and expandable before/after provenance. Expected is a secondary exact-link label, not a fifth severity. Distinguish unavailable from non-comparable empty panels. Partial comparisons lead with shared-URL-only and added/removed suppression copy. Observed zero says “No changes were observed,” never unavailable.

**Commerce.** This conditional Analyze destination requires persisted capability evidence. Its catalog is the sole target selector. Group catalog-wide secondary actions behind one disclosure; show bulk actions only after selection; align one correction control with the selected target's heading.

**Agent.** A full workspace in Agent mode, not a sheet over Dashboard pages. New chat offers a freeform composer, starter prompts, a skill picker and the top recommended Actions; an attached Action and typed evidence references show as removable chips, never as pasted evidence. A chat is one centred thread with the composer pinned to the bottom; its one output renders inline as a card in the thread: rendered Markdown, edit-as-new-revision, copy, Markdown export, sources, revision history with restore-as-new-revision, and outline approval for outline-first content. Queued, running, cancelled, failed and stopped-at-limit are distinct states with a Stop control while active. Actions list by deterministic priority with status and target filters; detail shows diagnosis, evidence-family convergence, member evidence in a drawer, recommended approach, what to avoid, measurement legs, linked chats, Dismiss/Reopen and Work on this. Agent chat headers name the sidebar section. Action details name the actual target, place its URL directly below, and separate Diagnosis/Implementation from supporting Evidence/Avoid/Measure with cards. Only observed sources count as supporting evidence; other statuses stay accessible in a counted disclosure. Skills show what each produces, never methodology. Evidence screens offer Ask agent, and Work on this where an Action exists.

### Marketing and auth

Product proof comes from coded product views (`components/marketing/scenes/product-views.tsx`): synthetic records in the product's own layout and vocabulary, wrapped by `ProductShot` in a window frame marked `data-ui` that sits straight on the page, with no caption (the frame already reads as a sample). Every capability has its own view, so no page repeats one illustration. On the homepage only, a thin accent-soft announcement band sits above the nav bar inside the fixed chrome (raising `--marketing-nav-offset`) and links to the MCP page; the MCP page leads with the shared connect strip (`components/mcp/connect-strip.tsx`: Connect to Claude with a chevron menu of ChatGPT, Gemini and Grok, then the MCP URL and copy) in place of buttons, as Settings → MCP connections does. The homepage hero is a centred two-line headline whose first line ends in an answer-engine rotor (ChatGPT, Gemini, Claude with their marks; the slot holds the widest name so the line never shifts, and the heading's accessible name is the full sentence), lead, Start free trial and Book a demo, then a large app-shell frame showing one still AI Visibility page: no tabs, no autoplay and no entrance motion ([decision](decisions.md#filled-controls-carry-white-ink-product-views-are-windows)). The engine strip labels API collection honestly (OpenAI API, Gemini API, Claude API, Google AI Overviews). Platform pages share one template: breadcrumb, left-aligned title and lead, actions, a hero product shot, three highlights, alternating copy/visual feature rows on the soft band, FAQ, related link cards and a closing band.

Section grammar: heading → optional short lead → evidence/media, list or table → at most one primary action per band. There are no eyebrow or kicker labels above headings; breadcrumbs are wayfinding, not labels. Prefer split layouts, space-separated lists and real product views over icon-card walls (no icon-topped card rows); cards are reserved for clickable destinations and real objects such as pricing plans. Number only a real sequence. Body measure is about 60–70 characters; one H1 per page; space separates same-tone sections and the tone change is the edge between different ones.

Marketing navigation is a white bar (white once scrolled, with no rule) with the logo, centred text links (Platform, Solutions and Resources open panels from a single disclosure button each; Enterprise and Pricing are links) and exactly two account actions: Log in and Sign up (Sign up only while self-serve sign-up is open, from `sm` up). Platform opens a three-column panel of icon rows plus an overview footer. Below `lg` a full-height sheet lists the same destinations with Log in and Sign up pinned at its foot. The footer has no buttons: brand line, Platform/Solutions/Resources/Company columns derived from the navigation registry, and a legal row.

### Patterns

Product views keep their desktop layout at every width (owner decision, 2026-10-08). On a desktop viewport (981px and up) a view fills its frame. Below that it lays out at its design width, the width its frame has at 1440px, and `.product-fit` (`marketing.css`) scales it down with `zoom`, never up, so a phone sees a smaller copy of the 1440px picture instead of a reflowed, trimmed or hidden-control version, even though its text gets very small ([decision](decisions.md#product-views-scale-down-on-phones), 2026-10-31); it is still live, selectable markup, not an image. Homepage tiles crop on the view inside the zoom, so a phone shows the same corner as a desktop. Nothing inside a view steps by viewport, and no surface hides parts of a view on small screens. Keep one shared horizontal grid for navigation, hero, sections and footer.

Cookie consent is a compact bottom-right floating panel with equal-width Reject and Accept actions. On phones it expands only to the viewport gutters and respects the bottom safe area; it never becomes a full-width page banner.

Auth/onboarding use the website type ladder and shared focus treatment. Their flow/sticky action bars use white paper and a single separating edge against the neutral ground; the task column is an elevated `.app-pane` with 16px corners, with unboxed internal groups separated by space/titles. Onboarding adds three-step progress. Review directly confirms category, buyer type, market scope, owned domains, and competitors; the project is created only after confirmation of visible structured ICP facts, and onboarding generates no prompts. No new colour family, decorative glow, nested card, or competitor mutation. Forest marks the primary action, current step, and selected answer without changing font weight.

Product previews render on the product's own ladder: 14px body and the `.type-*` sizes for captions and badges, 8px controls and rows, 12px cards and panels, the product control heights. They may change only layout, typography, colour, border, radius, or elevation; strings, scripted content, factual claims, and workflows remain unchanged without approval.

Shared public objects use one flat card recipe: link cards, plan cards, the review card and docs pagination take `--radius-lg` and a fill one tone step from their band (`background-alt` on white, white on the soft band); hover deepens the fill. The recommended plan is an `accent-soft` field. Buttons are one flat fill; the alternate action is `background-alt`. Callouts use one treatment across docs and marketing.

### Documentation

The docs subdomain is a Read surface using the existing public light palette,
Geist and Outfit, semantic tokens and shared controls. Its desktop shell has
grouped guide navigation, a measured reading column and an on-page contents
rail. Mobile uses inline navigation and contents disclosures. Guides, Agent,
MCP and Changelog are the top-level entry points; Updates is the final sidebar
group. Public font loading is shared through `PublicFonts.astro`.
Search uses the shared dialog, input and buttons with keyboard access and
focus restoration. Articles are server-built HTML and remain readable without
JavaScript. It wears the website's chrome: one compact header row (wordmark
with a lime Docs tag, section tabs with a green underline, a field-style search,
the marketing Open app button) and compact 32px navigation rows. No decorative
motion or alternate design system is introduced.

## Component recipes

### Controls

Shared buttons use the 8px control radius and the `control` type role. Atoms have one form: a product control is `--control-height-md` (32px) with 14px text, a text control has 12px horizontal padding (tabs included) and an icon-only control (`size="icon"`) none. There is no small rung (`sm`, `iconSm`, `iconRound`, compact fields and the 24px interactive chip are deleted), and anything the user clicks is a control, never a badge: toggle chips are secondary `Button`s with `aria-pressed`, radio chips render the same face. `lg` (36px) is the public website's only and `marketing` (`--control-height-xl`, 44px) its hero CTA's; public `md`/`lg` buttons and marketing CTAs are 36px at 14px text. Flow buttons are the product's 32.

Controls need direct labels, immediate pressed feedback and central keyboard focus. Focus paints the existing border rather than adding an outside perimeter. `.focus-input` changes its border to accent; text entry inside `.focus-frame` changes only the frame's border. Auxiliary buttons show their own focus edge without highlighting the surrounding field. Other controls use a 1px accent outline inset by 1px, aligned with their edge; filled primary/destructive actions use their high-contrast label ink. All treatments key on `:focus-visible`. The Agent composer's textarea owns focus, not its outer form. Disabled controls have no outline. Higher contrast uses a dotted edge; forced colours use system Highlight. Invalid controls retain a danger border during hover and focus, paired by the form owner with `aria-invalid` and descriptive recovery text. Placeholder-only labels are forbidden. Glow and bespoke component focus recipes are retired.

### Charts

`components/ui/chart.tsx` owns the chart frame: the responsive container, the axis defaults, the legend and the hover card. It is built on Recharts, which sizes to the container it is actually given — the hand-rolled predecessors scaled a fixed viewBox unevenly, squashing their own tick text and running a rotated axis title through the values beside it. Series colours come from the `--color-chart-1..8` ladder and are passed as token values, never literals.

`series-chart.tsx` is on this frame. `trend-chart.tsx`, `chart-axes.tsx` and `components/performance/performance-chart.tsx` are still the hand-rolled SVG layer and are migrating; they carry behaviour the frame has yet to prove it can hold (gap-not-zero with version markers, per-point evidence links, timestamp-proportional spacing). `donut-chart.tsx` stays hand-drawn on purpose: it is a fixed square with no axes, and it distinguishes the declared total from its slices' sum, which a generic pie does not.

Every chart is `aria-hidden` and carries a written description instead. A null point is a gap, never a zero, in the drawing and in the hover card alike.

### Panels, badges, and evidence

Structural sections remain open or tonal. One box recipe: `Card` (a semantic object) and `Panel` (a nested structural box) share radius 12, a one-pixel `border` and 16px padding on the box element itself; their tones change fill and edge colour, never geometry, and neither has a padding, radius or edge variant. `CardHeader` keeps 12px under the title before content; `CardContent` adds no padding, so a table or list sits in the same 16px inset as text. A `QueryState` nested in a box shares that box's surface and inset; a boxed ledger (`ledgerClasses('boxed')`) is the panel recipe with its rows divided inside it. `Card` is white with a fine edge. Its `recommendation` tone (accent-soft fill, accent-border edge) marks the page's single next action, and the `danger` tone retains its status edge. Bare `Table` wrappers use the same paper fill and card radius, with a hairline below the header; a table inside a card shares its fill. Cards in one row share their height, and a row is either all cards or all open bands, never both. `Card` sets no display mode; opt into aligned-footer layouts at call sites without breaking sticky scrolling. Never nest a `Card` inside another `Card`, modal, drawer, or sheet.

For a filled, padded box inside a card/section, use `panelClasses({ tone })` from `components/ui/panel.tsx`. Only its white `panel` tone shows its edge; `well`, `tonal` and `accent` are separated by their fill and keep a transparent one-pixel border, so every box has the same geometry. Drawer field groups/lists use unboxed sections/rows. Multi-category editors use shared underline tabs and one linear field flow, not dashboard grids.

Badges pair labels with state marks. Every badge and tag — a status or count object inside text or a cell — is 20px with 12px text; there is no second badge height. Menu rows use a 32px minimum and may grow for option detail; card/panel padding is 16px. The sidebar uses 12px horizontal insets, 4px item gaps and 12px group labels. Filter bands have 8px vertical padding so wrapping controls clear their rules; page actions wrap at narrow widths. Table headers sit on the panel itself, with no fill band, closed by the one rule under them; figures, their headers and sort buttons are right-aligned in tabular digits, text columns left. A placeholder is a flat bar at its value's size, with no shimmer. Checkbox/radio marks and switch tracks retain intrinsic glyph geometry inside labelled or role-sized targets. Evidence rows identify source, measurement context, and an action opening the persisted record. Loading/empty states preserve layout and explain absence through the availability vocabulary.

Confirmed first-use analytical states omit filters, charts, and table reservations that cannot change or explain the result. Keep controls that can recover a filtered or uncovered state, and render persisted measured zero or partial-provider evidence through its normal measurement surface.

### Documentation

Docs uses a white reading surface, a 240px navigation column, a 216px contents rail and a 46rem article column. Desktop gutters follow `--site-gutter`; the contents rail collapses below 1200px, the tabs wrap below 900px and navigation collapses below 768px. Section tabs and navigation groups use Lucide icons. The current page is the only accent: an accent-soft row with a forest rail in navigation, a forest edge on the current contents-rail link (the rail has no track line), and the article's group label above its title. Docs is flat like the website: the header, article title and footer carry no rule; code sits in a `background-alt` panel and tables in a rounded panel without an outer frame; notes are forest-railed callouts; previous/next links and the mobile menus are `background-alt` tiles.

The contents panels include H2/H3 entries, omit leading step-number prefixes from link labels, and retain authored headings and anchor IDs. Active-heading tracking is progressive enhancement: ordinary anchors remain usable without JavaScript. Existing quotes, code and table headers use semantic tinted surfaces. Search, generated tool references, keyboard access, CSP and print support remain intact.

### Navigation and overlays

- **Navigation:** current sidebar locations use a raised `panel` face with primary label/icon ink; hover uses `hover`, pressed feedback uses `active`. Preserve contrast and avoid translation. Page controls sit on a tonal band; identity and tab navigation bands stay on paper. Selected tabs use the theme's accent underline.
- **Menus:** shared panel/item recipes, `shadow-overlay`, 12px card radius, short system-curve entrance. Filters/page-kind selectors use shared custom Radix menus, not browser-native `<select>` popups. Single-select filters use radio items. Feature components never import Radix directly.
- **Sheets/dialogs:** `components/ui/drawer.tsx` owns right-side modal sheets; use `shadow-modal` and the shared card radius. Scrim dims/locks the page; outside click, Escape, and close dismiss. Restore trigger focus, including controlled dialogs. Owners provide padding/footer separation; consumers do not recreate chrome. Tooltips use `shadow-overlay` and the same 12px radius. Features own no shadow recipes.
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

Only `shadow-none`, `shadow-overlay` and `shadow-modal` utilities are available to product consumers. Shared material classes own resting elevation: `surface-card`, `control-raised`, `selection-track`, `selection-raised` and `shell-link`; feature call sites do not author shadows. Their `--elevation-*` recipes live in `globals.css`, including dark-mode overrides. Detached menus/popovers/tooltips/palette use overlay, dialogs/drawers/floating toast use modal. Radius families are the one ladder: xs 4px for intrinsic sub-elements, control 8px, card 12px (cards, wells, overlays), lg 16px (sheets, stages, tiles, link cards) and full for true pills, dots and avatars.

## Motion and accessibility

Every duration and easing is a token in `globals.css`; no stylesheet or class writes a raw one. Product and shared-control motion consumes `--motion-fast` 110ms for hover/micro-feedback, `--motion-normal` 150ms for menus/tooltips and short exits, `--motion-slow` 240ms for dialogs/drawers/toasts and short reveals. Public surfaces add `--motion-menu` 280ms (header menus unfolding) and `--motion-reveal` 720ms (sections and heroes arriving). Implicit Tailwind transitions inherit the fast duration and standard easing. Easings are `--ease-standard` cubic-bezier(0.33, 1, 0.68, 1) for everything that enters or responds, including public menus and reveals, and `--ease-exit` (0.2, 0, 1, 0.9) for exits. Repeating activity cycles and staggers derive from these roles. Keyboard command interfaces and route/tab content update immediately; press feedback begins on pointer-down. Functional delays (tooltip delay, toast dwell, first-load reveal delay) remain independent from motion duration. Browser autofill's paint-suppression timing is a technical exception.

Public-site motion is quiet and never gates content. Header menus open after a 110ms hover intent (immediately when switching between open menus or on click/focus), unfold over the menu role with their rows settling a beat later, and fold away over the normal role while already inert. Page heroes rise in reading order with a short stagger; the title only sharpens and settles, so it is never invisible at first paint. Section headings rise on scroll through native scroll-driven animation only where supported; nothing else moves on scroll. Call-to-action arrows lean toward their destination on hover. The homepage engine rotor dissolves one name into the next every 2.4s; it pauses outside the viewport and in hidden tabs, and does not run under reduced motion. Product views are still.

Sanctioned explanatory motion: rotating answer-engine wordmarks; native CSS scroll fade/rise reveals on section headings that never hide server-rendered content after hydration; master-detail continuity/domain-owned measured expansion; onboarding research results resolving below factual activity with a slow-role fade/rise and a short stagger.

Answer-engine rotors pause outside the viewport and in hidden tabs. Static product
preview bars render complete on the server without a hydration-time collapse or replay.

All motion stops under `prefers-reduced-motion: reduce`: global CSS animations/transitions are neutralised. WCAG 2.1 AA is the minimum. Preserve visible focus, non-colour-only meaning, usable keyboard/touch interactions, forced-colours, and print.

## Review checklist

Before merging a visual change, verify:

- Existing token, primitive, typography, geometry, spacing, and ownership contracts are followed; no route-local design recipes or unapproved surface/motion changes.
- Affected text, focus, status, loading, error, empty, keyboard, touch, mobile, reduced-motion, and forced-colours states remain usable; zero remains distinct from absence.
- Factual content, claims, data, product behavior, transactions, and confirmation gates remain unchanged unless explicitly approved.
- `e2e/geometry-census.spec.ts` passes: every product route at 982×900 and 1280×900, light and dark, renders one value per geometric role (controls 32 at 14px text, badges 20, text-control padding 12, icon-only 0, control band 49, section gap 24, card→card 16, box padding 16 on the box with radius 12 and a 1px border, query state 160, table row 36 with 6 cell padding). The census, not code reading, is the check for consistency.
- Atomic layering holds (`pnpm check:policy`, `layer-*` rules): geometry lives in `components/ui` (atoms, organisms, templates) and `components/layout`; a feature folder composes them and carries no spacing, sized-box or radius utilities, no `size=`/`padding=` props and no breakpoint but `desktop:`. Every `layer-*` finding fails the check outright: the layering rules have no baseline entries and no ratchet, so the debt stays at zero. Something a page needs that no organism provides is built in `ui/` or `layout/`.
- Repository-owned static, test, and appropriate visual commands pass under the existing workflow. External/manual tools are not acceptance gates unless a deterministic repository command owns them. Tests do not become a second visual authority.
