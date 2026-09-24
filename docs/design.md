# CiteLadder Design System

> Canonical visual and interaction contract for marketing, authentication, onboarding, and the authenticated application. This is the only design-system document.

Existing owners govern production workflows. Visual work must not change factual copy, data, feature claims, scripted preview content, transactions, or explicit confirmation gates without approval. Unresolved instructions from the supplied contract are recorded at the end; consolidation does not decide them.

Tests verify shared ownership, accessibility, and product correctness—not exact classes, fonts, pixels, or CSS recipes as a second visual authority.

## Direction and identity

CiteLadder (`citeladder.com`) is an evidence-led enterprise system. Its **Prism Evidence Workspace** puts neutral ground behind the chrome and a distinct work surface behind the content, using navy ink in light mode, Emerald actions by default, semantic evidence washes, useful density, and deliberate negative space. Prioritise current state → movement → next action → evidence, not equal-weight KPI cards. Voice is direct, confident, specific, and evidence-led: one idea per sentence.

- **Logo:** `frontend/components/ui/logo-mark.tsx` owns every surface's lockup: `frontend/public/citeladder-logo.svg` for the wordmark and the matching inline glyph for mark-only mode. `BRAND_LOGO_SIZES` owns standard heights; explicit `size` supports exceptional layouts. The mark inherits `currentColor`; non-empty `alt` supplies either rendering's accessible name. `frontend/public/citeladder-favicon.ico` owns browser/installable-app icons with the same black silhouette across frames.
- **Typography:** self-hosted variable faces on every surface: Inter for body, UI and data type, General Sans for headings and display roles, both capped at weight 600 by their `@font-face` ranges; 14px working baseline. Each semantic role owns size, leading, weight, tracking, and ink together.
- **Icons:** Lucide only; import concepts from `frontend/lib/icons.ts` where available. Call sites set size only: `size-3`/`size-3.5` for dense tables, toolbars, and chips; `size-4` for chrome; `size-5` for empty states and marketing wells; larger only for decorative marks. The global stroke ladder derives approximately 1.3px stems from size. Keep `currentColor`; do not override stroke weight locally.
- **Surface identity:** Light is the shipped default. Semantic tokens support `[data-theme='dark']` for developer inspection; there is no public theme control or automatic system-theme following yet. Emerald is the sole action accent on public and product surfaces. The logo and provider marks retain their fixed brand colours. Marketing keeps a warmer canvas than the cooler product workspace. Auth/onboarding use centred task flows.

## Source of truth and implementation rules

| Owner | Responsibility |
| --- | --- |
| `frontend/apps/app/src/globals.css` | Global tokens, shared geometry, interaction rules, animations, and the single `@theme` definition |
| `frontend/apps/app/index.html` and `frontend/apps/marketing/src/layouts/MarketingLayout.astro` | Self-hosted Inter/General Sans loading (`--font-text`, `--font-heading`) and metric-matched fallbacks in each runtime |
| `frontend/scripts/pull-licensed-fonts.mjs` | The licensed font list; copies the binaries from the private `Cube-27/cube27-fonts` repo, which the public repo must never contain |
| `frontend/apps/app/src/website-type.css` | Imported public/auth/onboarding type roles and focused-flow geometry; same font and semantic palette |
| `frontend/components/ui/` | Shared controls, typography, layout, panels, and overlays |
| `frontend/components/marketing/` | Existing marketing primitives |
| `frontend/components/layout/nav-items.ts` | The shared navigation registry |

Do not add raw hex colours, `@theme`, shared control recipes, or unregistered animations outside `globals.css`. Homepage-only neutral and preview values belong to the scoped `.cl-landing` tokens there; shared chrome and other marketing pages keep the semantic palette. Do not redefine shared geometry per surface. Reuse primitives before creating another. Public/auth type roles may have their own scale; embedded product previews reset to the app ladder.

`pnpm check:policy` guards raw colours, stray `@theme`, legacy identifiers, ownership boundaries, `font-*` outside `components/ui/`, size-named radii (`rounded-sm|md|lg|xl`), and per-surface geometry redeclarations. Tailwind's default radius scale is cleared in `@theme`. The capability/ownership map remains in [frontend-architecture.md](frontend-architecture.md), under Component capability.

## Colour

Consume semantic roles, never page-local values.

| Role | Tokens and values | Use |
| --- | --- | --- |
| Ground | `canvas` `#F6F8FA` | Neutral ground beneath shell and public surfaces |
| Structure | `surface` `#F7F9FC`; `surface-2` `#EEF1F5` | Insets, wells, tonal panels; hover/selected states |
| Paper | `white` `#FFFFFF` | Work surfaces, inputs, semantic objects, overlays |
| Ink | `ink-strong` `#1A1F36`; `ink` `#30313D`; `muted` `#596579`; `subtle` `#667085` | Headings/primary values; body/row values; labels/support; tertiary metadata/placeholders |
| Boundaries | `line-subtle` `#E8EDF3`; `line` `#D9E0EA`; `line-strong` `#C3CCD9`; `field-line` `#94A3B8` | Four rungs that must stay visibly distinct. `line-subtle` is a rule *inside* a surface (row hairlines, divides between peers, menu separators, chart gridlines); `line` is the edge *of* a box (card, panel, table wrapper, band, pane seam) and is the default; `line-strong` is deliberate emphasis; `field-line` bounds inputs. |
| Interaction | Emerald: forest `#14532D`; hover `#166534`; pressed `#0B3D20`; brand `#16A34A`; soft `#F0FDF4`; line `#86EFAC`. | Primary actions on every surface, links, tabs, selection, active navigation, focus, first chart series |
| Evidence | success, warning, error, info, `chart-secondary`, `chart-grid` | Persisted status/data, always labelled or paired with an icon |

Hierarchy is carried by boundary and tone, not by elevation: a box is separated by its edge and the tone beneath it, and shadow is reserved for surfaces that genuinely float (menus, sheets, dialogs, tooltips). A `Card` carries at most a contact shadow — a hair that stops a bordered white box from looking printed onto the ground — never a lift. If something needs to read as *above* rather than *on*, it is a different object, not a larger shadow.

Reading text must meet 4.5:1 contrast. `subtle` metadata belongs on reading surfaces; active/tonal surfaces use `muted` or `ink` to retain contrast. Cyan, coral, lime, and amber express evidence/status, not route decoration. Never communicate meaning through colour alone.

Marketing subpages use the semantic public canvas, centred General Sans hero, quiet surface bands, and the shared full-width dark footer. The homepage keeps a warmer neutral canvas than the product UI, with scoped aliases resolving to shared semantic roles. The owner-scoped `[data-public-surface]` rebind deepens light-mode inks and strengthens hairlines. Use divided hairlines unless a tonal band's edge provides meaningful separation. Functional evidence colours stay in product data and previews.

The homepage may use marketing-only geometry roles: `--radius-marketing-card` (20px), `--radius-marketing-well` (16px), `--radius-marketing-preview` (24px), and `--radius-marketing-control` (10px). The homepage shares the public container measure (`max-w-7xl` plus `--site-gutter`) with the navigation and footer. White capability and integration objects sit on warm hairlines; each capability owns one identity hue (`--cl-hue-*`: visibility blue, sources green, site health indigo, demand teal, content orange, MCP pink) that `landing.css` derives into a tint for its wells and an ink for its labels, icons and bars; everything else uses the accent-tinted `--cl-well`. Identity hues never carry actions, which stay Emerald. Section heads stack a single-line heading over the lead; embedded sub-headings stay a rung below the section heading. Homepage headings use weight 500 at most. Product data and status colours retain their own meaning. These roles do not change the authenticated application's 8px `--radius-card` contract.

## Typography

Use Inter for text and General Sans for headings (`font-display` and `h1`–`h6`) exclusively; metrics, dates, ranks, and percentages use tabular numerals, not monospace. Body weight is 400, labels/navigation/actions and product headings 500, metrics 600 (the ceiling), subject to the documented role exceptions. Do not assemble page-local size/weight/ink hierarchies.

### Website and focused-flow ladder

Roles own all typography properties. The general ladder is mobile-first: base below 700px, with 700px and 981px step-ups where defined. Ordinary paragraphs stay at or above 14px, except the compact homepage editorial ladder below 540px, where short supporting paragraphs step down by 2px. Prose measure is 45–75 characters; long paragraphs never use accent ink. Body tracking is zero; large text uses calm leading.

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

`website-data-display` is pricing-only: Inter 500, tabular, 30/36px → 40/46px at 768px. Never apply it to prose or headings.

### Product app ladder

Call `textRole(role, layoutClasses?)` from `components/ui/typography.tsx`; name the text's job rather than overriding its typography. `<strong>`, `<b>`, and `<th>` inherit their weight step from `globals.css`.

| Role | Job | Size / line height | Weight | Ink |
| --- | --- | --- | --- | --- |
| `pageTitle` | Reserved; no longer the route H1 | 26/32px | 600 | `ink-strong` |
| `sectionTitle` | Section H2 | 16/24px | 600 | `ink-strong` |
| `objectTitle` | Entity heading; the in-pane route H1 | 18/26px | 600 | `ink-strong` |
| `bodyStrong` | Leading copy | 14/20px | 500 | `ink` |
| `body` | Reading copy, descriptions, cells | 14/20px | 400 | `ink` |
| `label` | Field/column labels | 14/20px | 500 | `muted` |
| `meta` | Timestamps, counts, help, footnotes | 12/16px | 500 | `subtle` |
| `eyebrow` | Short metadata label | 12/16px | 500 | `muted` |
| `emphasis` | Ambient-size value/name | Inherited | 500 | `ink-strong` |
| `metric` | Primary numeral | 28/36px | 600 | `ink-strong`, tabular |
| `metricSm` | Dense-row numeral | 16/22px | 500 | `ink`, tabular |
| `delta` | Change indicator | 12/16px | 500 | Caller's tone, tabular |

Twelve pixels is reserved for short metadata, provenance, badges, and table headers; the table-header role ambiguity is recorded below. Availability labels use `UnavailableValue`, never metric type: muted, 12/16px, regular weight, zero tracking on every surface.

## Data and geometry

| Context | Desktop | Laptop / compact |
| --- | --- | --- |
| Sidebar | 232px | 210px |
| Compact topbar | — | 56px |
| Content gutter | 28px | 22px / 16px |
| Navigation row | 32px | 44px minimum target |
| Control | 30–40px | 44px minimum target |
| Table row | 44px | Labelled record |

Data columns and their headers are centre-aligned and tabular; text columns stay left-aligned. The header centres with its values so a column reads as one block — a sort glyph pushed to the padding edge leaves the label sitting off the numbers by its own width. This resolves the table-header precedence question previously recorded as unresolved: the shared `numeric` flag on `TableHead`/`TableCell` owns both alignment and tabular figures, and call sites do not re-declare either.

Analytical content caps at 1392px; form-first workflow content caps at 1040px while retaining full-width page bands. Sidebar content shares an 18px inset. Compact gutters are 16px; dialogs/drawers use 20px. Internal groups use 16–24px.

| Geometry role | Value | Use |
| --- | --- | --- |
| `--radius-control` | 6px | Controls and fields |
| `--radius-card` | 8px | Semantic objects |
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

Where the label appears depends on the surface. Metric cards, chart states, non-tabular values and workflow states a reader can act on (**Not run**, **Failed**) print the word: there is one of them, and it is the answer. A **metric cell in a table** does not: a column repeats its placeholder once per row to make a point it only needs to make once, and at `--text-xs` inside a `text-sm` tabular column it reads as a different kind of value rather than an absent one. Those cells use `MissingValue` from `components/ui/unavailable-value.tsx` — a muted en dash, with the state as assistive text and the reason available on hover and focus. It is never blank: an empty cell and a measured zero look identical, and those are opposite findings.

State a shared reason once, on the column header or the section, not in every cell that lacks a value. Core columns stay present across loading, filtering and pagination; omit a column only where it is unsupported or irrelevant for the entire view, never because the current page happens to be empty. A table or chart with nothing to show uses one contextual empty state that distinguishes first use, no results, loading and error — those four are different findings and a reader who cannot tell them apart cannot tell whether to change the filter or retry.

## Layout and content composition

### Application

Use sections, ledgers, tables, and split workspaces. Cards support architecture; they do not replace it. Recommendations show impact, deterministic priority factors, scope, status, and persisted evidence; never invent confidence, effort, ownership, or causality.

The shell is neutral ground with an inset white `.app-pane`, not separately bordered chrome. Desktop sidebar paints no separate surface; document scrolling remains normal and workspace/content overflow stays unset. The pane meets the sidebar and right/bottom viewport edges: only its top corners round (`.app-pane-workspace`). Below 768px it is edge-to-edge without radius or lift. Ground/paper separates by tone and radius plus the pane's own single cast edge (`--shadow-pane`), which follows the pane's radius; the sidebar adds no border of its own, or the two rules stack into a trench at that one seam. Sections inside paper use space and hairlines.

Overview sections, Website metric cards/page tables, Opportunities tables, and Prompts tables use the shared white panel role without added elevation. The 56px topbar is present at every width: from 981px it carries only the account trigger, and below that it adds the menu trigger, the compact route title, and a focus-managed off-canvas drawer. Retain every critical mobile action; tables become labelled records, and filters/evidence use full-height sheets.

#### Screen geometry and shell ownership

| Region | Owns | Excludes |
| --- | --- | --- |
| Desktop sidebar | Project switcher (first row), Search, Agent, Overview/Analyze/Act/Track groups, Settings access, brand lockup and accent picker (foot) | Duplicate navigation trees/registries; the account trigger |
| Topbar | Account trigger at every width; below 981px also Menu, compact route title, Agent and accent picker | Fixed bottom navigation |
| Page header | One in-pane route H1 at `objectTitle`, existing description, route actions on the same row; entity heading is the sole H1 on detail routes | Metrics or duplicate route H1 |
| Metric row | Three to five headline values, each with its change when one is comparable | More than five, unsupported metrics, or run bookkeeping |
| Analytical surface | The page's primary chart, table, or comparison | Competing equal-weight surfaces |
| Insight list | Ranked shared insight objects | Feature-specific finding-card shapes |

Keep date ranges and comparisons in their owning page, not the global shell. Align section tabs/actions on one row rather than adding an empty header row. Desktop and compact navigation reuse `nav-items.ts` destinations and capability resolution; hidden navigation never changes direct-route authorisation.

Search's Command Palette and the Agent controller remain mounted once in the authenticated shell, not inside the drawer. Desktop Search/Agent triggers live in the sidebar; compact Search/Agent triggers live in the topbar. The account trigger is the topbar's at every width, and renders initials only. Escape closes overlays and focus returns to the visible trigger.

#### Screen-specific contracts

**Overview.** Keep the page useful before any audit. Preserve reading order: compact project identity; warnings; Project State with Track context; Movement; one Next action; ranked actions and report proof; Top Insights; Company facts. Use the same DOM order at desktop and compact widths. The shared editor drawer has Facts & Positioning, Audience & Offerings, and Competitors tabs, one save action above the tablist, full available editing height, and shared brand logos beside tracked competitors. Do not restore a Product loop station strip. Track uses explicit availability labels; report actions require a persisted audit/report. Citation share uses separate shared heading/value roles, not an oversized combined sentence.

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

**Agent.** Context is limited to typed workspace, project, canonical route, date range, and route filters—never DOM text or unpersisted page data. Reuse the bounded explain/roadmap workspace and clear the route preset on project change. The sheet is its sole host: drawer-owned title/description, one result scroll region, pinned composer, and collapsed task history rather than a sidebar or duplicated page chrome.

**Content Generation.** Use full workspace width. Show catalog channel groups first, with server-owned formats inside channel dropdowns, not a growing wall of chips. A searchable persisted-page picker plus explicit URL escape hatch precedes Your instruction. Entry points may preselect page/format; instruction remains empty and focused. A quiet line names available brand, target, issue, and related-page context without confirmation. History opens from the composer header in the shared right drawer. Prose scrolls vertically; normal text/long links wrap, while intrinsically wide Markdown tables may scroll horizontally. Copy, Markdown export, and regenerate remain at both result header and footer. Terminal history rows expose Delete; individual deletion/Clear history use shared destructive confirmation and never delete active work.

#### The insight object

The product loop is acquire evidence → understand → detect gaps → create opportunities → improve → verify → recommend next. Its reusable unit is one shared insight component across Analyze, Act, Track, and the Growth Agent sheet.

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

Auth/onboarding use the website type ladder and shared focus treatment. Their flow/sticky action bars sit unfilled and unruled on the ground; the task column is an `.app-pane`, with unboxed internal groups separated by space/titles. Onboarding adds three-step progress. Review directly confirms category, buyer type, market scope, owned domains, and competitors; prompt generation starts only after confirmation of visible structured ICP facts. No new colour family, gradient, decorative glow, nested card, or competitor mutation. Forest marks the primary action, current step, and selected answer without changing font weight.

Product previews may change only layout, typography, colour, border, radius, or elevation; strings, scripted content, factual claims, and workflows remain unchanged without approval.

## Component recipes

### Controls

Shared buttons use the 6px control radius: app heights 30px compact, 34px default, 40px large; touch targets at least 44px. App buttons have no decorative inset border. Marketing primary buttons use the same solid-forest `primary` variant, minimum 44px (`min-h-[2.75rem]`), and shared hover ramp. Secondary, neutral, ghost, and danger variants remain shared.

Controls need direct labels, immediate pressed feedback, and visible focus: accent on their own border plus one attached soft glow, no gap or second floating ring. Inputs use semantic input/border roles; labels stay beside controls, helpers explain constraints, and errors provide recovery. Placeholder-only labels are forbidden. Composed inputs have one shared-frame focus ring, not an additional native-input outline.

### Charts

`components/ui/chart.tsx` owns the chart frame: the responsive container, the axis defaults, the legend and the hover card. It is built on Recharts, which sizes to the container it is actually given — the hand-rolled predecessors scaled a fixed viewBox unevenly, squashing their own tick text and running a rotated axis title through the values beside it. Series colours come from the `--color-chart-1..8` ladder and are passed as token values, never literals.

`series-chart.tsx` is on this frame. `trend-chart.tsx`, `chart-axes.tsx` and `performance-chart.tsx` are still the hand-rolled SVG layer and are migrating; they carry behaviour the frame has yet to prove it can hold (gap-not-zero with version markers, per-point evidence links, timestamp-proportional spacing). `donut-chart.tsx` stays hand-drawn on purpose: it is a fixed square with no axes, and it distinguishes the declared total from its slices' sum, which a generic pie does not.

Every chart is `aria-hidden` and carries a written description instead. A null point is a gap, never a zero, in the drawing and in the hover card alike.

### Panels, badges, and evidence

Structural sections remain open or tonal. `Card` is a real white semantic object with the shared card radius, a `line` edge, and the contact shadow described above — it is separated by its border, not by lift. `Card` sets no display mode; opt into aligned-footer layouts at call sites without breaking sticky scrolling. Never nest a `Card` inside another `Card`, modal, drawer, or sheet.

For a bordered, filled, padded box inside a card/section, use `panelClasses({ tone, pad })` from `components/ui/panel.tsx`. Drawer field groups/lists use unboxed sections/rows. Multi-category editors use shared underline tabs and one linear field flow, not dashboard grids.

Badges pair labels with state marks. Evidence rows identify source, measurement context, and an action opening the persisted record. Loading/empty states preserve layout and explain absence through the availability vocabulary.

Confirmed first-use analytical states omit filters, charts, and table reservations that cannot change or explain the result. Keep controls that can recover a filtered or uncovered state, and render persisted measured zero or partial-provider evidence through its normal measurement surface.

### Navigation and overlays

- **Navigation:** active app location uses a bordered paper pill with a contact shadow, dark label, brand-green icon, and 2px leading mark. Hover uses an accent-soft pill. Preserve icon/label contrast and avoid translation. Page controls sit on a tonal band; identity and tab navigation bands stay on paper. Selected tab underlines use brand green.
- **Menus:** shared panel/item recipes, `shadow-elevated`, 12px overlay radius, short system-curve entrance. Filters/page-kind selectors use shared custom Radix menus, not browser-native `<select>` popups. Single-select filters use radio items. Feature components never import Radix directly.
- **Sheets/dialogs:** `components/ui/drawer.tsx` owns right-side modal sheets; use `shadow-modal-value` and the shared overlay radius. Scrim dims/locks the page; outside click, Escape, and close dismiss. Restore trigger focus, including controlled dialogs. Owners provide padding/footer separation; consumers do not recreate chrome. Tooltips use `shadow-elevated` and the same 12px radius. Features own no shadow recipes.
- **Selection:** underline tabs navigate views or mutually exclusive tables with keyboard navigation and preserved selected-tab focus. Segmented controls use the shared bordered track for compact single-select changes; shared UI filter pills handle independent/multi-select filters.
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
