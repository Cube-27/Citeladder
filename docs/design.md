# CiteLadder Design System

> Canonical visual and interaction contract for marketing, authentication, onboarding, and the authenticated application. This is the only design-system document.

Existing owners govern production workflows. Visual work must not change factual copy, data, feature claims, scripted preview content, transactions, or explicit confirmation gates without approval. Unresolved instructions from the supplied contract are recorded at the end; consolidation does not decide them.

Tests verify shared ownership, accessibility, and product correctness—not exact classes, fonts, pixels, or CSS recipes as a second visual authority.

## Direction and identity

CiteLadder (`citeladder.com`) is a light-only, evidence-led enterprise system. Its **Prism Evidence Workspace** puts neutral ground behind the chrome and white paper behind the work, using navy ink, blue actions, semantic evidence washes, useful density, and deliberate negative space. Prioritise current state → movement → next action → evidence, not equal-weight KPI cards. Voice is direct, confident, specific, and evidence-led: one idea per sentence.

- **Logo:** `frontend/components/ui/logo-mark.tsx` owns every surface's lockup: `frontend/public/citeladder-logo.svg` for the wordmark and the matching inline glyph for mark-only mode. `BRAND_LOGO_SIZES` owns standard heights; explicit `size` supports exceptional layouts. The mark inherits `currentColor`; non-empty `alt` supplies either rendering's accessible name. `frontend/public/citeladder-favicon.ico` owns browser/installable-app icons with the same black silhouette across frames.
- **Typography:** self-hosted Geist Variable, weight axis 100–900, on every surface; 14px working baseline. Each semantic role owns size, leading, weight, tracking, and ink together.
- **Icons:** Lucide only; import concepts from `frontend/lib/icons.ts` where available. Call sites set size only: `size-3`/`size-3.5` for dense tables, toolbars, and chips; `size-4` for chrome; `size-5` for empty states and marketing wells; larger only for decorative marks. The global stroke ladder derives approximately 1.3px stems from size. Keep `currentColor`; do not override stroke weight locally.
- **Surface identity:** no dark theme or parallel colour namespace. Marketing uses the shared light editorial system and sanctioned band rebinds. Auth/onboarding use centred light-ground task flows, never a decorative brand rail.

## Source of truth and implementation rules

| Owner | Responsibility |
| --- | --- |
| `frontend/app/globals.css` | Global tokens, font binding, shared geometry, interaction rules, animations, and the single `@theme` definition |
| `frontend/app/layout.tsx` | Existing `next/font/local` Geist loading, with swap display |
| `frontend/app/website-type.css` | Imported public/auth/onboarding type roles and focused-flow geometry; same font and semantic palette |
| `frontend/components/ui/` | Shared controls, typography, layout, panels, and overlays |
| `frontend/components/marketing/` | Existing marketing primitives |
| `frontend/components/layout/nav-items.ts` | The shared navigation registry |

Do not add raw hex colours, `@theme`, shared control recipes, or unregistered animations outside `globals.css`. Do not create marketing colour/elevation namespaces or redefine shared geometry per surface. Reuse primitives before creating another. Public/auth type roles may have their own scale; embedded product previews reset to the app ladder.

`pnpm check:policy` guards raw colours, stray `@theme`, legacy identifiers, ownership boundaries, `font-*` outside `components/ui/`, size-named radii (`rounded-sm|md|lg|xl`), and per-surface geometry redeclarations. Tailwind's default radius scale is cleared in `@theme`. The capability/ownership map remains in [frontend-architecture.md](frontend-architecture.md), under Component capability.

## Colour

Consume semantic roles, never page-local values.

| Role | Tokens and values | Use |
| --- | --- | --- |
| Ground | `canvas` `#F6F8FA` | Neutral ground beneath shell and public surfaces |
| Structure | `surface` `#F7F9FC`; `surface-2` `#EEF1F5` | Insets, wells, tonal panels; hover/selected states |
| Paper | `white` `#FFFFFF` | Work surfaces, inputs, semantic objects, overlays |
| Ink | `ink-strong` `#1A1F36`; `ink` `#30313D`; `muted` `#596579`; `subtle` `#667085` | Headings/primary values; body/row values; labels/support; tertiary metadata/placeholders |
| Boundaries | `line` `#E4E7EC`; `line-strong` `#CBD2DC`; `field-line` `#8793A3` | Hairline structure and field boundaries |
| Interaction | `accent` `#175CD3`; hover `#134DAB`; pressed `#10419D`; soft `#EDF4FF`; line `#C4D7F5` | Primary actions on every surface, links, tabs, selection, active navigation, focus, first chart series |
| Evidence | success, warning, error, info, `chart-secondary`, `chart-grid` | Persisted status/data, always labelled or paired with an icon |

Reading text must meet 4.5:1 contrast. `subtle` metadata belongs on reading surfaces; active/tonal surfaces use `muted` or `ink` to retain contrast. Cyan, coral, lime, and amber express evidence/status, not route decoration. Never communicate meaning through colour alone.

Marketing uses a white root, centred Geist hero, quiet `surface` bands, and white footer. The owner-scoped `[data-public-surface]` rebind deepens inks (`#0F172A` foreground through `#64748B` subtle) and strengthens hairlines, but inherits the shared blue action ramp. Use `divided` hairlines unless a tonal band's edge provides meaningful separation. Functional evidence colours stay in product data and faithful previews. No atmosphere washes, dark teal/indigo bands, grain, or decorative icon-tile families.

## Typography

Use Geist exclusively; metrics, dates, ranks, and percentages use tabular numerals, not monospace. Body weight is 400, labels/navigation 500, actions 550, headings/metrics 600, subject to the documented role exceptions. Do not assemble page-local size/weight/ink hierarchies.

### Website and focused-flow ladder

Roles own all typography properties. The general ladder is mobile-first: base below 700px, with 700px and 981px step-ups where defined. Ordinary paragraphs stay at or above 14px; 13px is for short labels, metadata, captions, and legal support. Prose measure is 45–75 characters; long paragraphs never use accent ink. Body tracking is zero; large text uses calm leading.

| Role | Size / line height | Weight | Tracking | Ink |
| --- | --- | --- | --- | --- |
| Flow group title | 16/24px | 600 | -0.2px | `ink-strong` |
| Flow help | 14/20px | 400 | 0 | `muted` |
| Flow metadata | 12/16px | 500 | 0 | `muted`, tabular |
| Lead | 18/26px | 400 | 0 | `ink` |
| Large body | 16/22px | 400 | 0 | `ink` |
| Body baseline | 14/20px | 400 | 0 | `ink` |
| Navigation/actions | 14/20px | 500–550 | 0 | `ink` or inverse |
| Label/caption/eyebrow | 13/18px | 400–500 | 0 | `muted` or `subtle` |

`website-data-display` is pricing-only: Geist 500, tabular, 30/36px → 40/46px at 768px. Never apply it to prose or headings.

### Product app ladder

Call `textRole(role, layoutClasses?)` from `components/ui/typography.tsx`; name the text's job rather than overriding its typography. `<strong>`, `<b>`, and `<th>` inherit their weight step from `globals.css`.

| Role | Job | Size / line height | Weight | Ink |
| --- | --- | --- | --- | --- |
| `pageTitle` | In-pane route H1 | 26/32px | 600 | `ink-strong` |
| `sectionTitle` | Section H2 | 16/24px | 600 | `ink-strong` |
| `objectTitle` | Entity heading | 18/26px | 600 | `ink-strong` |
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

Content caps at 1392px; sidebar content shares an 18px inset. Compact gutters are 16px; dialogs/drawers use 20px. Internal groups use 16–24px. The source's conflicting major-section spacing is recorded below.

| Geometry role | Value | Use |
| --- | --- | --- |
| `--radius-control` | 6px | Controls and fields |
| `--radius-card` | 8px | Semantic objects |
| `--radius-overlay` | 10px | Menus, tooltips, dialogs, drawers |
| `rounded-xs` | 4px | Chart bars, skeletons, inline code |
| `rounded-full` | Full | Pills, badges, dots, counts, filter toggles |

Vertical rhythm belongs to the container: `Stack` from `components/ui/layout.tsx` or container `gap`, not child `mt-*`. Its rungs are `section` 32px, `workspace` 16px, `compact` 12px, and `tight` 4px. A 2px optical nudge, sized glyph, or negative-margin overlap remains allowed. See unresolved section-spacing precedence below.

Marketing uses `--section-y`: 56px base, 80px from 981px, 96px from 1280px. Auth/onboarding use `[data-flow-surface]` geometry from `website-type.css`: 56px bar, centred task measure, 16px mobile gutter, shared control radius, and selection chips 36px desktop/44px touch. The flow shell owns its scrolling main region and action bar.

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

## Layout and content composition

### Application

Use sections, ledgers, tables, and split workspaces. Cards support architecture; they do not replace it. Recommendations show impact, deterministic priority factors, scope, status, and persisted evidence; never invent confidence, effort, ownership, or causality.

The shell is neutral ground with an inset white `.app-pane`, not separately bordered chrome. Desktop sidebar paints no separate surface; document scrolling remains normal and workspace/content overflow stays unset. The pane meets the sidebar and right/bottom viewport edges: only its top corners round (`.app-pane-workspace`). Below 768px it is edge-to-edge without radius or lift. Ground/paper separates by tone and radius, not a rule; sections inside paper use space and hairlines.

Overview sections, Website metric cards/page tables, Opportunities tables, and Prompts tables use the shared white panel role without added elevation. Compact screens use one 56px topbar and a focus-managed off-canvas drawer. Retain every critical mobile action; tables become labelled records, and filters/evidence use full-height sheets.

#### Screen geometry and shell ownership

| Region | Owns | Excludes |
| --- | --- | --- |
| Desktop sidebar | Brand, project switcher, Search, Agent, Overview/Analyze/Act/Track groups, Settings access, account | Duplicate navigation trees/registries |
| Compact topbar | Menu, compact route title, Search, Agent, account trigger | Fixed bottom navigation |
| Page header | One in-pane route H1, existing description, route actions; entity heading is the sole H1 on detail routes | Metrics or duplicate route H1 |
| Metric row | Three to five headline values, each with coverage/provenance | More than five or unsupported metrics |
| Analytical surface | The page's primary chart, table, or comparison | Competing equal-weight surfaces |
| Insight list | Ranked shared insight objects | Feature-specific finding-card shapes |

Keep date ranges and comparisons in their owning page, not the global shell. Align section tabs/actions on one row rather than adding an empty header row. Desktop and compact navigation reuse `nav-items.ts` destinations and capability resolution; hidden navigation never changes direct-route authorisation.

Search's Command Palette and the Agent controller remain mounted once in the authenticated shell, not inside the drawer. Desktop triggers live in the sidebar; compact triggers live in the topbar. Escape closes overlays and focus returns to the visible trigger.

#### Screen-specific contracts

**Overview.** Keep the page useful before any audit. Preserve reading order: project identity + Facts; one next action + Track; Project State; Movement; ranked actions; report proof; Top Insights. The top card leads with identity/actions, then simultaneously visible tonal summaries for Positioning, Target Audience, and Offerings & Competitors; stack them on compact screens. The shared editor drawer has Facts & Positioning, Audience & Offerings, and Competitors tabs, one save action above the tablist, full available editing height, and shared brand logos beside tracked competitors. Do not restore a Product loop station strip. Track uses explicit availability labels; report actions require a persisted audit/report. Citation share uses separate shared heading/value roles, not an oversized combined sentence.

**AI Visibility.** Exactly three tabs: Trends (default), Mentions & Citations, Query Fanout; no parallel Overview or page-local project switcher. Trends shows exactly five computed metrics: Visibility Score, SOV mention, SOV response, brand mentions, owned citations. Sentiment and average position are not computed (decision B-2): rankings columns say Not measured; neither becomes a stat card. The source requires two points for a trend chart, requests one dot for one run, and hides start-of-range comparison until a second run; single-run rendering ambiguity is recorded below. Avoid an empty full axis beneath a no-movement banner. Evidence tabs use ruled execution rows within one card, not nested boxes; task/analysis/artifact IDs live behind one collapsed Provenance disclosure per row.

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

Marketing is an editorial stack of full-width sections with centred content. The home hero is white, centred, and text-only: value proposition, one action, rotating engine roster on the first screen. Subpages use a white opener above a hairline. Preserve the real workspace canvas as the landing's product beat, not a reconstructed screenshot.

Use optional eyebrow → heading → short lead → evidence/media or focused grid → at most one primary CTA per band. Secondary intents belong in navigation or another band. Allow at most one eyebrow per three sections, hero included. Prefer asymmetric text/media, proof ledgers, and concise grids over feature-card walls. The operating loop uses open numbered stages with quiet separators and named steps. Body measure is about 60–70 characters; one H1 per page; spacing uses the global section rhythm.

Marketing navigation retains Log in at every width and Book a demo from `sm` up. On phones, demo/account links are pinned in the full-screen menu sheet. Navigation is transparent over the hero and frosted white on scroll, without shadow.

Auth/onboarding use the website type ladder and shared focus treatment. Their flow/sticky action bars sit unfilled and unruled on the ground; the task column is an `.app-pane`, with unboxed internal groups separated by space/titles. Onboarding adds three-step progress. Review directly confirms category, buyer type, market scope, owned domains, and competitors; prompt generation starts only after confirmation of visible structured ICP facts. No new colour family, gradient, decorative glow, nested card, or competitor mutation. Blue marks the primary action, current step, and selected answer without changing font weight.

Product previews may change only layout, typography, colour, border, radius, or elevation; strings, scripted content, factual claims, and workflows remain unchanged without approval.

## Component recipes

### Controls

Shared buttons use the 6px control radius: app heights 30px compact, 34px default, 40px large; touch targets at least 44px. App buttons have no decorative inset border. Marketing primary buttons use the same solid-blue `primary` variant, minimum 44px (`min-h-[2.75rem]`), and shared hover ramp. Secondary, neutral, ghost, and danger variants remain shared.

Controls need direct labels, immediate pressed feedback, and visible focus: accent on their own border plus one attached soft glow, no gap or second floating ring. Inputs use semantic input/border roles; labels stay beside controls, helpers explain constraints, and errors provide recovery. Placeholder-only labels are forbidden. Composed inputs have one shared-frame focus ring, not an additional native-input outline.

### Panels, badges, and evidence

Structural sections remain open or tonal. `Card` is a real white semantic object with the shared card radius; its unresolved elevation instructions appear below. `Card` sets no display mode; opt into aligned-footer layouts at call sites without breaking sticky scrolling. Never nest a `Card` inside another `Card`, modal, drawer, or sheet.

For a bordered, filled, padded box inside a card/section, use `panelClasses({ tone, pad })` from `components/ui/panel.tsx`. Drawer field groups/lists use unboxed sections/rows. Multi-category editors use shared underline tabs and one linear field flow, not dashboard grids.

Badges pair labels with state marks. Evidence rows identify source, measurement context, and an action opening the persisted record. Loading/empty states preserve layout and explain absence through the availability vocabulary.

### Navigation and overlays

- **Navigation:** active app location uses an accent-soft pill; hover uses a neutral pill. Preserve icon/label contrast; no translation or leading rail.
- **Menus:** shared panel/item recipes, `shadow-elevated`, 10px overlay radius, short system-curve entrance. Filters/page-kind selectors use shared custom Radix menus, not browser-native `<select>` popups. Single-select filters use radio items. Feature components never import Radix directly.
- **Sheets/dialogs:** `components/ui/drawer.tsx` owns right-side modal sheets; use `shadow-modal-value` and the shared overlay radius. Scrim dims/locks the page; outside click, Escape, and close dismiss. Restore trigger focus, including controlled dialogs. Owners provide padding/footer separation; consumers do not recreate chrome. Tooltips use `shadow-elevated` and the same 10px radius. Features own no shadow recipes.
- **Selection:** underline tabs navigate views or mutually exclusive tables with keyboard navigation and preserved selected-tab focus. Segmented controls use the shared bordered track for compact single-select changes; shared UI filter pills handle independent/multi-select filters.
- **Analytical loading:** interval changes retain prior analytical content while the new persisted projection loads. Mark the region busy with compact feedback; no replacement skeleton or labels describing data not yet received.

HeroUI is a reference for state completeness, not an installed dependency.

## Motion and accessibility

Authenticated routes use shared CSS feedback, never the Motion runtime. Marketing owns a lazy Motion provider for limited editorial scenes. Pointer-opened menus use an origin-aware 150–180ms fade/shift; keyboard command interfaces open immediately. Drawers use interruptible 220–260ms right-side transitions; press feedback begins on pointer-down. Authenticated route content and tab indicators update immediately without opacity transitions.

Sanctioned explanatory motion: rotating answer-engine wordmarks; product-window walkthrough; small GSAP scroll fade/rise reveals that never hide server-rendered content after hydration; master-detail continuity/domain-owned measured expansion; onboarding research results resolving below factual activity with a 220ms fade/rise and 60ms stagger.

All motion stops under `prefers-reduced-motion: reduce`: global CSS animations/transitions are neutralised, SMIL pipeline dots hidden, GSAP reveals disabled. WCAG 2.1 AA is the minimum. Preserve visible focus, non-colour-only meaning, usable keyboard/touch interactions, forced-colours, and print.

## Review checklist

Before merging a visual change, verify:

- Existing token, primitive, typography, geometry, spacing, and ownership contracts are followed; no route-local design recipes or unapproved surface/motion changes.
- Affected text, focus, status, loading, error, empty, keyboard, touch, mobile, reduced-motion, and forced-colours states remain usable; zero remains distinct from absence.
- Factual content, claims, data, product behavior, transactions, and confirmation gates remain unchanged unless explicitly approved.
- Repository-owned static, test, and appropriate visual commands pass under the existing workflow. External/manual tools are not acceptance gates unless a deterministic repository command owns them. Tests do not become a second visual authority.

## Unresolved source instructions

These are ambiguities in the supplied contract, not verified implementation defects. Preserve current implementation until the relevant choice is explicitly resolved; this consolidation supplies no replacement values or behavior.

| Topic | Instructions retained from the source | Decision still needed |
| --- | --- | --- |
| Card elevation | Card recipes prescribe subtle directional `--shadow-card`; general colour/checklist rules reserve shadows for floating surfaces. Named flat app panels explicitly have no added elevation. | Whether semantic `Card` is an exception to the floating-only rule |
| Major-section spacing | `Stack` names `section` as 32px; Data and geometry says major sections separate by 24px. | Which governs major route sections, or how their scopes differ |
| Table-header type | `label` covers column labels at 14/20px, weight 500, `muted`; prose reserves 12px for table headers without naming a separate role. | Required table-header role/precedence |
| Single-run trend | A trend chart renders only with at least two points; one run is also described as plotting one dot. Start-of-range comparison waits for a second run. | Whether/how a one-point chart surface renders without the empty full axis |
