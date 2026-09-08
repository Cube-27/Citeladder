# CiteLadder Design System

> Canonical visual and interaction contract for marketing, authentication, and
> the authenticated application. This is the only design-system document.

This document owns the final visual specification. The approved
[`refined HTML`](plans/citeladder-refined.html) is the frozen visual reference.
Tests verify shared ownership, accessibility and product correctness; they do
not become a second visual authority through exact class, font, pixel, or CSS
recipe assertions. Production workflows remain governed by their existing
owners and behavior contracts.

## Direction and identity

CiteLadder is a light-only, evidence-led enterprise system. The authenticated
application uses the **Prism Evidence Workspace**: one neutral ground carrying the chrome and white paper carrying the work,
dark navy ink, a brand-blue primary action, semantic evidence
washes, useful density, and deliberate negative space. It is an operating
workspace, not a wall of equal-weight KPI cards.

- **Name and domain:** CiteLadder, `citeladder.com`.
- **Logo:** one lockup component, `frontend/components/ui/logo-mark.tsx` uses
  the canonical `frontend/public/citeladder-logo.svg` asset for the full
  wordmark and the matching inline vector glyph for mark-only mode. The shared
  `BRAND_LOGO_SIZES` ladder owns standard heights; an explicit `size` remains
  available for exceptional layouts. Mark-only mode inherits `currentColor`,
  while a non-empty `alt` exposes either rendering with that accessible name.
  Product, marketing, authentication, and onboarding all reuse this owner.
  `frontend/public/citeladder-favicon.ico` owns browser and installable-app
  iconography with the same black silhouette across its frames.
- **Voice:** direct, confident, specific. One idea per sentence. Prefer evidence
  and outcomes over generic AI language.
- **Typography:** one **Geist Variable** family, loaded by the existing
  `next/font/local` owner, serves the authenticated product, public site,
  authentication, onboarding, UI, data, and headings. The full 100–900 wght
  axis is available, with semantic roles selecting the approved weight and
  scale. The working product baseline is 14px. Size, leading, weight,
  tracking, and colour are one role contract, never independent page-level
  choices.
- **Iconography:** lucide only, imported by concept from `frontend/lib/icons.ts`
  where a concept exists. A call site sets the size class and nothing else:
  `size-3`/`size-3.5` for dense tables, toolbars, and inline chips, `size-4` for
  chrome, `size-5` for empty states and marketing wells, larger only for
  decorative marks. Stroke weight is not a call-site choice — the icon stroke
  ladder in `app/globals.css` derives it from the size class so every glyph
  lands near a 1.3px stem instead of growing heavier with the icon. Colour stays
  `currentColor` so `text-muted` and `text-accent-text` keep painting the glyph.
- **Action and selection:** primary accent (`#175CD3`) owns primary actions on
  every surface — product, authentication, onboarding, and the public marketing site
  (the shared solid `primary` button). Analytical selection, links, active navigation, and focus
  consume the semantic accent ladder (`#175CD3`, `#134DAB` hover, and `#10419D` pressed).
  A single definition in `@theme` in `globals.css` propagates token-driven primary color
  to all surfaces without arbitrary per-surface overrides. Cyan, coral, lime,
  and amber are evidence/status families, never route decoration.
- **Composition:** state before features. Product pages prioritise current state,
  movement, next action, then evidence. Marketing is more editorial but uses the
  same tokens, type, and restraint.

There is no user-selectable dark theme or parallel CSS colour namespace. The
public surface renders its own **light editorial marketing system** (below)
through the same token owner and the sanctioned band-rebind mechanism — no
route-local
hex, no second stylesheet. Authentication and onboarding use one centred
light-ground flow; neither surface reserves viewport width for a decorative
brand rail.

## Source of truth and implementation rules

`frontend/app/globals.css` is the sole owner of global tokens, the Geist font
binding, cross-surface geometry, and global interaction rules. Its imported
`frontend/app/website-type.css` owns named public/auth/onboarding type roles
and flow-specific geometry; all roles use the same Geist family and semantic
palette. Editorial, auth, and product UI consume semantic utilities and CSS
custom properties.

- Do not add `@theme`, a raw hex colour, a shared control recipe, or an
  unregistered animation outside `globals.css`.
- Do not create a marketing colour or elevation namespace. Marketing scenes and
  product screens use the same surface, status, elevation, and motion tokens. A
  scoped website type ladder is allowed because public/auth reading sizes and
  dense product UI have different jobs; embedded product previews explicitly reset
  to the app type ladder.
- Prefer existing primitives in `frontend/components/ui/` and
  `frontend/components/marketing/` before making a new one.
- `pnpm check:policy` guards raw colours outside the owner, stray `@theme` blocks,
  legacy identifiers, and architecture ownership boundaries.

## Colour

Tokens are semantic; components use the role, not a colour value.

| Role | Token family | Use |
| --- | --- | --- |
| Ground | `canvas` (`#F6F8FA`) | The neutral ground beneath the authenticated shell and public surfaces |
| Canvas and structure | `surface` (`#F7F9FC`), `surface-2` (`#EEF1F5`) | The neutral inset ladder for wells, tonal panels, hover and selected state |
| Raised surfaces | `white` (`#FFFFFF`) | Inputs, overlays, and meaningful semantic objects |
| Text | `ink` (`#30313D`), `ink-strong` (`#1A1F36`), `muted` (`#596579`), `subtle` (`#667085`) | Four distinct neutral ink roles for headings, body, labels, and peripheral context |
| Borders | `line` (`#E4E7EC`), `line-strong` (`#CBD2DC`), `field-line` (`#8793A3`) | Hairline structure and tactile field boundaries |
| Primary action and selection | `accent` (`#175CD3`), hover (`#134DAB`), pressed (`#10419D`), soft (`#EDF4FF`), line (`#C4D7F5`) | Interaction, links, active navigation, focus, and the primary chart series |
| Status and evidence | success, warning, error, info, `chart-secondary`, `chart-grid` | Persisted evidence and status, always paired with a label or icon |

The product uses a neutral ground and white work surfaces. The blue accent
`#175CD3` owns primary actions, selection, links, tabs, active navigation,
focus, and the first chart series; `#134DAB` and `#10419D` are its hover and
pressed states. Semantic success, warning, error, and info families remain
independent from interaction blue. The authenticated shell has one compact
sidebar and an inset work pane; at compact widths it uses one 56px topbar and
an off-canvas navigation drawer. Hairlines, spacing, and surface tone carry
hierarchy. Raised objects, inputs, and overlays remain white, with elevation
reserved for floating UI. Product, authentication, onboarding, and public
surfaces consume these shared semantic tokens without route-local palette
overrides.

Text hierarchy is semantic rather than route-specific: `ink-strong` owns
headings and primary values; `ink` owns body copy and row values; `muted` owns
labels, captions, and supporting metadata; `subtle` is reserved for tertiary
metadata, placeholders, and unavailable-value marks. Reading text uses a role
with WCAG 2.1 AA normal-text contrast (`4.5:1`); `subtle` metadata is used on
reading surfaces, while active and tonal surfaces use `muted` or `ink` for the
same contrast requirement.

Marketing renders the **light editorial system**: a white root and centred
Geist hero, with quiet `surface` bands separating selected body sections. The
public surface rebinds the text inks to a deeper dark
navy family (`[data-public-surface]` in `globals.css` — `#0F172A`
foreground through `#64748B` subtle) and steps the hairlines up a rung, so the
site prints with more contrast than the product. The public surface inherits
the shared blue action/accent ramp rather than declaring a route-local cut. On
paper a tonal band is a whisper, so a public section separates with a hairline
(`divided`) unless the quiet fill edge is doing real work.
Functional evidence families remain inside product data and faithful preview
scenes because those states must stay legible at a glance. Functional colour
never carries meaning alone. The frozen reference does not authorize
atmosphere washes, dark teal or indigo bands, grain overlays, or decorative
icon-tile families on the public surface.

## Typography

One self-hosted face, **Geist Variable** (`100–900`), is owned by the
`next/font/local` declaration in `app/layout.tsx` and is used on every
product, public, authentication, and onboarding surface. All weights swap
display. Metrics, dates, ranks, and percentages use tabular numerals, never a
monospace face.

### Website and focused-flow ladder

The website scale is role-based and starts from a 14px working baseline. A role
owns its size, leading, weight, tracking, and colour as one unit. Public and auth
components consume these roles instead of assembling arbitrary size, leading,
tracking, weight, and colour combinations.

The ladder is mobile-first: the base value applies below 700px and the arrows
mark the 700px and 981px step-ups. Geist carries display hierarchy through
size, semantic weight, tracking, and neutral ink.
| Role                    | Family           |      Size / line height |  Weight |                       Tracking | Colour                                      |
| ----------------------- | ---------------- | ----------------------: | ------: | -----------------------------: | ------------------------------------------- |
| Flow group title         | Geist            | 16/24px | 600 | -0.2px | ink-strong |
| Flow help                | Geist            | 14/20px | 400 | 0 | muted |
| Flow metadata            | Geist            | 12/16px | 500 | 0 | muted; tabular numerals |
| Lead                     | Geist            | 18/26px | 400 | 0 | ink |
| Large body               | Geist            | 16/22px | 400 | 0 | ink |
| Body baseline            | Geist            | 14/20px | 400 | 0 | ink |
| Navigation and actions   | Geist            | 14/20px | 500–550 | 0 | ink or inverse |
| Label, caption, eyebrow  | Geist            | 13/18px | 400–500 | 0 | muted or subtle |

Ordinary website paragraphs never render below the 14px body rung. Thirteen
pixels is reserved for short labels, metadata, captions, and legal support.
Prose stays within a 45–75 character measure. The accent never carries a
long paragraph. Large text uses calm leading; body text stays at
zero tracking with more leading. Pricing values are the one non-editorial
website display role: `website-data-display` uses Geist at 500 at 30/36px
stepping to 40/46px at 768px, with tabular numerals, and never applies to prose
or headings.

### Product app ladder

The authenticated enterprise application uses Geist exclusively. It enforces
consistent visual hierarchy, strict tabular numerals for metrics, and
high-density information architecture.
Ad-hoc inline text sizes, weights, and color overrides are prohibited in favor of token
classes.

A call site never writes a size, a weight and an ink and picks a hierarchy of
its own. It names the **job the text does** and takes the hierarchy from that.
The roles live in `components/ui/typography.tsx` and are reached through
`textRole(role, layoutClasses?)`.

| Role | Job | Size / line height | Weight | Ink |
| :--- | :--- | ---: | ---: | :--- |
| `pageTitle` | the in-pane route `h1` | 26/32px | 600 | `ink-strong` |
| `sectionTitle` | a screen section `h2` | 16/24px | 600 | `ink-strong` |
| `objectTitle` | an entity heading | 18/26px | 600 | `ink-strong` |
| `bodyStrong` | copy that leads its block | 14/20px | 500 | `ink` |
| `body` | reading copy, descriptions, cell text | 14/20px | **400** | `ink` |
| `label` | a field or column label | 14/20px | 500 | `muted` |
| `meta` | timestamps, counts, help, footnotes | 12/16px | **500** | `subtle` |
| `eyebrow` | short metadata label | 12/16px | 500 | `muted` |
| `emphasis` | a value or name at the ambient size | inherited | 500 | `ink-strong` |
| `metric` | a primary numeral | 28/36px | 600 | `ink-strong`, tabular |
| `metricSm` | a numeral in a dense row | 16/22px | 500 | `ink`, tabular |
| `delta` | a change indicator | 12/16px | 500 | caller's tone, tabular |

Weight is semantic: 400 for body copy, 500 for labels and navigation, 550 for
actions, and 600 for headings and metrics. Hierarchy is carried by the role's
size, leading, tracking, and ink (`ink-strong` → `ink` → `muted` → `subtle`),
never by route-local overrides.

`font-*` utilities are rejected by `check:policy` outside `components/ui/`.
`<strong>`, `<b>` and `<th>` take their one step up from a base rule in
`globals.css`, so no call site restates it.

Fourteen pixels is the product baseline. Twelve pixels is reserved for short
metadata, provenance, badges, and table headers. Product call sites name a
closed `textRole`; they do not write arbitrary weights or sizes.

Availability labels such as **Not measured**, **Unavailable**, and **Unknown**
never inherit metric typography. They use the shared `UnavailableValue`
treatment: muted, 12/16px, regular weight, and zero tracking on every surface.

### High density layout and elevation standard

The product app is an enterprise data-dense environment. It uses diffuse elevation
and crisp semantic hairlines to maintain clear structure without visual clutter:

- **Elevation and borders**: structural sections are open on the canvas or use a
  tonal well. `Card` is reserved for a real semantic object: a white fill, the
  card radius, and a subtle directional bottom-weighted elevation (`--shadow-card`).
  It replaces harsh wireframe hairline borders with clean organic depth. Stronger
  omnidirectional all-side shadows belong to floating overlays: dropdown menus,
  drawers, dialogs, the command palette, and toasts. `Card` sets no display of its own:
  making it a flex column would re-flow every existing card and put an overflow
  boundary between a sticky child and its scroll container, so a row that needs aligned
  footers opts in at the call site.
- **The nested box is a `Panel`**: a bordered, filled, padded box *inside* a card
  or a section uses `panelClasses({ tone, pad })` from `components/ui/panel.tsx`.
  Twenty-seven of these were hand-rolled, each with its own fill, border colour,
  radius and padding, which is why the same evidence box looked different in six
  screens. `Card` cannot absorb them: a `Card` may not nest inside a `Card`.
- **Radius is one ladder, everywhere**: `--radius-control` (6px),
  `--radius-card` (8px), `--radius-overlay` (10px), with `rounded-xs` (4px) for
  micro geometry — chart bars, skeletons, inline code — and `rounded-full` for
  pills. Tailwind's default radius scale is cleared in `@theme` so a size name
  cannot be reached for, and `check:policy` rejects `rounded-sm|md|lg|xl` on
  every surface. **No surface redefines a shared geometry role.** Login used to
  set `--radius-control` to 12px while `--radius-card` stayed 10px, which
  inverted the ladder: controls rounder than the card holding them.
- **Vertical rhythm belongs to the container**: use `Stack` (or a `gap`) from
  `components/ui/layout.tsx`, never `mt-*` on a child. A child that sets its own
  top margin owns its distance from a sibling it cannot see; ninety-odd of these
  had accumulated across a dozen values. The rungs are `section` (32px),
  `workspace` (16px), `compact` (12px) and `tight` (4px). A 2px nudge, a sized
  glyph, and a negative margin stay allowed — those are optical alignment and
  deliberate overlap, not rhythm.
- **Drawer and Sheet Composition**: Modals, slide-out drawers, and sheets already provide an
  elevated surface. They must **never** contain nested `<Card>` components. Field groups and
  lists inside drawers use clean structural section divisions (`space-y-4` / borderless rows).
  Multi-category editors use the shared underline tabs; the selected panel owns one linear
  field flow rather than a dashboard-like field grid.
- **Tab & Action Alignment**: Section headers with tabs and actions place controls on the same
  row (`flex items-center justify-between`) rather than wasting vertical canvas on an empty
  header row.
- **Custom Select Menus**: Filter dropdowns and page-kind selectors use custom Radix menus with
  `shadow-elevated`, the semantic overlay-radius role, and radio items—never raw browser-native
  `<select>` popups.

## Data and geometry

| Context                  | Desktop | Laptop / compact |
| ------------------------ | ------: | ---------------: |
| Authenticated desktop sidebar | 232px | 210px |
| Compact topbar            | — | 56px |
| Content gutter            | 28px | 22px / 16px |
| Navigation row           | 32px | 44px minimum target |
| Control                  | 30–40px | 44px minimum target |
| Table row                | 44px | labelled record |

The content area caps at 1392px. Internal groups use 16–24px and major sections
separate by 24px. Compact gutters remain 16px; dialogs and drawers use 20px.
Cross-surface geometry is role-driven and there is exactly one ladder: controls
and fields use 6px corners, semantic objects use 8px, and overlays use 10px,
with 4px for micro geometry and full rounding for chips, badges, status dots,
count pills, and filter toggles. **No surface — app, login, onboarding or
marketing — redefines a role.** Components consume the semantic geometry role;
they do not select a route-local radius, and `check:policy` rejects both a
size-named radius and any per-surface redeclaration of a role.

`shadow-elevated` owns floating menus and popovers; `shadow-modal-value` owns
drawers and dialogs. No authenticated feature owns a shadow recipe.
Marketing sections use the shared responsive rhythm (`--section-y`: 56px base,
80px from 981px, and 96px from 1280px).

Authentication and onboarding share the `[data-flow-surface]` geometry owned by
`website-type.css`: a compact 56px bar, centred task measure, 16px mobile
gutter, and the same 6px control role as the app. The surface uses Geist and
the same semantic palette. Selection chips are 36px high on desktop and 44px
on touch. The flow shell owns its scrolling main region and action bar.

### Availability vocabulary

Product data never uses punctuation as its only empty-state explanation. Render the state that
is actually known: **Not measured** when no measurement exists, **Not run** when the workflow
has not started, **Not set** for missing user-configurable facts, **Unavailable** when evidence
or a provider cannot supply a value, **Not applicable** when the field does not apply, and
**Unknown** when the system cannot determine the state. An observed zero remains `0`; chart
series retain visual gaps for unavailable points and explain those gaps accessibly.

## Layout and content composition

### Application

- Use sections, ledgers, tables, and split workspaces as page architecture. Cards
  support a section; they do not replace one. Avoid nested decorative cards.
- The shell is a ground with an inset pane, not a bordered sidebar beside a
  bordered header. The desktop sidebar paints nothing; document scrolling
  remains normal, and workspace/content overflow is unset. At
  compact widths a single 56px topbar opens the same sidebar content in a
  focus-managed off-canvas drawer. The pane fills the shell — it meets the
  sidebar on the left and the viewport on the right and bottom, so the work
  gets the room and the top edge alone carries the seam. Only its top corners are therefore rounded
  (`.app-pane-workspace`); rounding an edge with nothing behind it cuts a notch
  rather than softening anything. Below 768px the pane runs edge to edge and
  gives up its radius and its lift — a 16px corner against the viewport edge
  reads as a rendering artefact. Everything in the sidebar rail sits on one 18px
  inset. Overview sections, Website metric cards and page tables,
  Opportunities tables, and Prompts tables use the shared white panel role without
  added elevation.
- Recommendations show impact, deterministic priority factors, affected scope,
  status, and links to persisted evidence. Do not invent confidence, effort,
  ownership, or causality.
- Site Health puts its crawl control and URL inventory before crawler-bot,
  file, and page-kind diagnostics. The one contextual crawl action stays
  visible while secondary diagnostics collapse.
- That contextual action is **Run new crawl** before or after a run and **Stop
  crawl** while the persisted crawl is active. **Export** is secondary;
  discovery and analysis are not separate user actions. Before a first run, use
  the actionable empty placeholder. During discovery, keep the first ten
  persisted inventory rows visible and enrich them in place as analysis
  arrives. Issues use one responsive master-detail workspace: a compact group
  list on the left and the selected group's occurrence evidence, affected URLs,
  remediation, and actions in a sticky right rail. Narrow screens stack the
  same regions without hiding evidence. Do not restore per-card expansion,
  queries, or cursor state.
- Site Health progress names blocked and failed work beside completed work:
  **Blocked by robots.txt**, **HTTP 4xx**, **HTTP 5xx**, and **Timeouts** appear
  when non-zero. Waiting copy names a healthy host-gate or retry-backoff wait;
  stalled copy is reserved for backend-reported expired-lease evidence. Never
  describe a crawl as stuck solely because a browser-side timer elapsed.
- Site Health findings use separate **Defects** and **Advisories** views.
  Defects own severity and Opportunity eligibility. The headline says
  **defect issue types** in the default view and **advisory issue types** after
  switching views; supporting counters say class-labelled **occurrences** and
  **affected URLs** so visually adjacent quantities never masquerade as one
  number. Issue severity, dimension, and affected page kinds use compact
  unboxed metadata labels; advisory rows use an Advisory label rather than a
  severity label. Affected-page counts stay at body scale and regular weight.
- Issue evidence belongs to a persisted occurrence and its directly linked
  evaluation. Group detail and URL detail reuse one bounded presenter for exact
  schema types/properties, heading transitions and scope, and offending control
  descriptors. Unknown shapes use labelled bounded fields, never raw JSON or a
  generic site-wide claim.
- AEO Readiness is a dimension ledger, never a gauge or mystery number. Its
  dedicated tab opens directly on that ledger; aggregate score, coverage, and
  page-count summaries stay in Overview instead of repeating in a second card.
  The table uses the same score, quality, coverage, and state roles as Overview
  for all seven dimensions; not-applicable rows remain visible and are not
  styled as failures. Overview provides the direct **View details** route into
  this tab.
  Evidence opens in the shared right-side sheet, failures first — a dimension
  can carry dozens of persisted evaluations, and an in-cell disclosure inflated
  one table row past the height of the viewport.
- Site Health Architecture leads with the persisted Internal linking and
  Structure depth summaries because they are primary AEO signals. Five
  site-level facts and an always-visible page-kind ledger follow. Page kind,
  pages, median depth, indexable count, duplicate
  metadata, and orphaned count never require disclosure; only a kind's assigned
  URL list expands in a bounded region. A read-only observed hierarchy then
  renders the persisted parent relationships and their evidence sources without
  client-side inference in its own bounded scroll region.
- Website Changes is an evidence ledger with four named classes and expandable
  before/after provenance. `Expected` is a secondary exact-link label, not a
  fifth severity. Unavailable and non-comparable states use distinct empty
  panels; partial comparisons lead with shared-URL-only and added/removed
  suppression copy. An observed zero renders as “No changes were observed,”
  never as unavailable.
- Mobile retains every critical action. Tables become labelled records; filters
  and evidence use full-height sheets.

#### Screen geometry

Every product screen uses one geometry. Learning it once should mean knowing where
to look on every page in the app.

```text
┌──────────────────────────────────────────────────────────────┐
│ Brand / project / Search / Agent │ Route title and actions   │
├────────────┬─────────────────────────────────────────────────┤
│            │                                                 │
│ Overview   │  Supporting context                  Actions    │
│ Analyze    │                                                 │
│ Act        │                                                 │
│ Track      │  ┌─────────┐ ┌─────────┐ ┌─────────┐            │
│            │  │ Metric  │ │ Metric  │ │ Metric  │            │
│            │  └─────────┘ └─────────┘ └─────────┘            │
│ User Menu  │  Primary analytical surface                     │
│ (Settings) │  ──────────────────────────────────────         │
│            │                                                 │
│            │  Insights / findings / table                    │
└────────────┴─────────────────────────────────────────────────┘
```

Fixed responsibilities per region:

| Region             | Owns                                                                                                        | Never                                             |
| ------------------ | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Desktop sidebar    | Brand, project switcher, Search, Agent, four station groups, supporting Settings access, and account | A second navigation registry or hidden duplicate tree |
| Compact topbar     | Menu opener, compact route title, Search, Agent, and account trigger | A fixed bottom navigation bar |
| Page header        | One explicit in-pane route title, existing description, and route-owned actions; entity detail routes use the entity heading as the sole H1 | Metrics or a duplicate route H1 |
| Metric row         | Three to five headline numbers, each with coverage                                                          | More than five, or a metric without provenance    |
| Analytical surface | The one chart, table, or comparison this page exists for                                                    | Competing equal-weight surfaces                   |
| Insight list       | Ranked insight objects (below)                                                                              | Ad-hoc card shapes                                |

Date range and comparison remain in the owning page region because they apply
to that route's persisted context, not to a global shell action.

Desktop and compact navigation use the current four station groups — Overview,
Analyze, Act, and Track — from `frontend/components/layout/nav-items.ts`.
The compact drawer exposes the same destinations and capability resolver as the
desktop sidebar; it does not create a second mobile bar or registry.
Commerce is a conditional Analyze destination backed by persisted capability
evidence; hidden navigation never changes direct-route authorization.
Its catalog remains the one target selector. Catalog-wide secondary actions are
grouped behind one disclosure, bulk actions appear only after a selection, and
the selected target keeps one aligned correction control beside its heading.
Search and Agent are desktop sidebar actions and compact topbar launchers. The
single persistent Command Palette and Agent controller remain mounted with the
authenticated shell; they are not mounted inside the navigation drawer.
Escape closes each overlay, focus returns to the visible trigger, and Agent context is limited to
typed workspace, project, canonical route, date range, and route filters.
The shipped sheet reuses the bounded explain/roadmap workspace and clears its
route preset when the active project changes; no DOM text or unpersisted page
data enters Agent context. Because the sheet is the workspace's only host, the
workspace carries no page chrome of its own: the drawer owns the one title and
description, the result region owns the one scroll container, the composer pins
below it, and task history is a collapsed disclosure rather than a sidebar rail.

Content Generation uses the full workspace width. Its format control exposes
the catalog's channel groups first and keeps the server-owned formats inside
channel dropdowns, so catalog growth does not create a wall of chips. Generation
history opens from the composer header in the shared right-side drawer. Generated
prose scrolls vertically inside its result surface; normal text and long links
wrap to the reading width, while intrinsically wide Markdown such as tables may
scroll horizontally. Copy, Markdown export, and regenerate remain available at
both the result header and footer.

The composer places one searchable persisted-page picker (plus an explicit URL
escape hatch) before **Your instruction**. Origin entry points may preselect the
page and format, but the instruction stays empty and focused. A quiet context
line names available brand, target, issue, and related-page context without a
confirmation step. Terminal history rows expose Delete; Clear history and
individual deletion use the shared destructive confirmation dialog and never
delete active work.

Overview stays useful without an audit. Its canonical reading order is project identity plus
Facts, one next action plus Track, Project State, Movement, ranked actions, report proof, and Top
Insights. The top card places the project identity and actions first, followed by three
simultaneously visible tonal summaries: Positioning, Target Audience, and Offerings &
Competitors. These summaries stack on compact screens; the editor opens in the shared drawer
with **Facts & Positioning**, **Audience & Offerings**, and **Competitors** tabs. Its single save
action sits above the tablist, editable facts use the drawer's available vertical space, and
tracked competitors pair their names with the shared brand-logo treatment. There is no
Product loop station strip: four tiles restating pipeline state told the reader nothing they
could act on. Unavailable Track values use the explicit availability vocabulary rather than a
dash or fabricated zero; report actions do not render until a persisted audit/report exists.

Overview metric labels and values are separate roles. **Citation share** uses the shared surface
heading treatment and KPI value ladder as the other persisted Overview metrics; it never creates
a route-local display scale by styling the label and value as one oversized sentence.

AI Visibility uses three tabs—Trends, Mentions & Citations, and Query Fanout—with
Trends as the default and no parallel Overview surface. It carries no project
switcher of its own; the authenticated shell's ProjectSwitcher owns project
context.

- The Trends metric row is **exactly the five computed metrics** (Visibility
  Score, SOV mention, SOV response, brand mentions, owned citations). Sentiment
  and average position are never computed (decision B-2), so they are disclosed
  as **Not measured** in their rankings-table columns and are **not** stat cards — two
  permanently blank tiles pushed the row past the five-metric cap and read as
  broken.
- A trend chart renders only with at least two points. One run plots one dot;
  a full empty axis under a banner that already says there is no movement is
  noise. The same rule collapses the start-of-range ranking comparison until a
  second run exists.
- The two evidence tabs are **ruled rows, not nested cards**. An execution is a
  row inside the tab's one card — never a filled, bordered box holding a third
  layer of boxes around its citations or queries. Task/analysis/artifact ids are
  audit trail, so they live behind one collapsed **Provenance** disclosure per
  row rather than as raw truncated UUIDs across the primary surface.

#### The insight object

The product model is _acquire evidence → understand → detect gaps → create
opportunities → improve → verify → recommend next_. The reusable unit that model
produces is not a dashboard card — it is an **insight**, and it is the single most
important component in the system.

```text
┌─────────────────────────────────────────────────────────┐
│ HIGH PRIORITY                              SITE          │
│                                                          │
│ 47 product pages have weak buying-intent coverage        │
│                                                          │
│ Evidence                                                 │
│ 47 pages · /products/* · detected 2h ago                 │
│                                                          │
│ Why this matters                                         │
│ Pack expects purchase questions on product detail roles  │
│                                                          │
│ Potential impact                         High            │
│                                                          │
│ [View evidence]                         [Resolve →]      │
└─────────────────────────────────────────────────────────┘
```

Required anatomy, in this order:

1. **Priority** and **source layer** — the layer chip is how the user learns which
   system found this without reading the body.
2. **Claim** — one sentence, specific, quantified where a count exists.
3. **Evidence** — scope, selector, and observation time. Always resolves to
   persisted evidence.
4. **Why this matters** — grounded in a pack expectation, a demand signal, or a
   contradiction. Never a causal claim, never an invented benchmark.
5. **Potential impact** — from the deterministic priority formula, not a model.
6. **Two actions** — inspect, and act.

Rules:

- One insight component, used identically in Analyze, Act, Track, and the Growth
  Agent sheet. A station that invents its own finding card breaks coherence.
- The same insight in two places is the same server ID and the same cache identity.
- An insight with no resolvable evidence does not render.
- Coverage and unknown states use their text labels; an insight never implies
  completeness it does not have.
- Insights are ranked by the deterministic formula. The agent may group and explain
  them; it does not reorder them.
- On dense summary surfaces (such as the Command Center Overview), the 'Why this matters'
  section is omitted via `hideWhyThisMatters` to reduce vertical clutter while keeping priority,
  claim, evidence, potential impact, and actions directly visible.

### Marketing and auth

Marketing is editorial rather than dense, and renders the light editorial
system: a page opens on a white centred Geist hero with the rotating engine
roster on the first screen itself (or, on subpages, a white opener above a
hairline), and selected body sections use the quiet `surface` band. The footer
resolves back to white paper. The
product UI is part of the story: the landing page keeps the real workspace
canvas as its product beat, so the page shows the actual instrument rather
than a rebuilt fake. A page
is a vertical stack of full-width sections with content in a centred container.
Use the recipe: optional eyebrow, heading, short lead, evidence/media or a
focused grid, then at most one primary CTA per band — a band anchors one
action, and secondary intents live in the nav or another band. Eyebrows are
rationed (at most one per three sections, hero included); a section's position
on the page already categorises it, so most sections need no label.
- Give sections breathing room on the global rhythm rather than route-local values.
- Prefer asymmetric text-and-media compositions, a proof ledger, or a concise grid
  over a wall of feature cards. The product UI is the "photography": a real
  workspace canvas carries the visual weight, never a
  rebuilt fake screenshot. The hero itself stays text-only: value proposition
  and one action. The operating loop uses open numbered stages separated by
  quiet structure, with the stage label naming the step.
- Keep body copy around 60–70 characters wide and use one H1 per page.
- The marketing navigation keeps a Log in link at every width and the Book a demo CTA from
  `sm` up; on phones the demo CTA moves into the full-screen menu sheet,
  pinned with the account links.
- Auth uses the website type ladder and shared focus treatment; the form remains
  the primary task. Auth and onboarding use the same ground and the same paper
  as the app: the flow bar and the sticky action bar sit on the ground with no
  fill and no rule of their own, and the task column is an `.app-pane`. A group
  inside that pane is not a box — space and its title separate it, the same rule
  that forbids a Card inside a Card. Onboarding adds three-step progress.
- Onboarding review makes the category, buyer type, market scope, owned domains,
  and competitors directly confirmable. Prompt generation begins only after the
  user confirms the visible structured ICP facts.
- Website and app copy, data, feature claims, and workflow behaviour are outside
  this pass. Product previews may change layout, typography, colour, border,
  radius, or elevation only; their strings and scripted content stay unchanged.

## Component recipes

### Controls

Buttons use the 6px control-radius role with no decorative inset border in the
authenticated application; app button sizes are 30px compact, 34px default,
and 40px large on desktop, with 44px targets on touch.
Website and marketing primary buttons use the shared 6px control radius
(`min-h-[2.75rem]`, 44px touch target) filled solid with the brand blue —
the same `primary` action role the app uses, walking one rung deeper on hover.
Secondary, neutral, ghost,
and danger remain shared semantic variants. Every control has a direct label, a
visible focus ring — the control's own border turns accent and one soft glow
attaches to it (no panel gap, no second floating ring) — immediate pressed
feedback, and
at least a 44px touch target.

Inputs use the semantic input and border roles. Labels sit with their control,
helper text explains constraints, and errors give a recovery instruction. Never
use placeholder text as the only label. Authentication and onboarding fields and
large flow buttons use the same shared control radius; a composed input exposes one
focus ring on its shared frame rather than a second outline on its native input.

### Panels, badges, and evidence

Elevation is shared between marketing and the app. Structural sections remain
open on the canvas or use a tonal well; semantic object cards use a white fill
with subtle directional bottom-weighted elevation (`--shadow-card`). Stronger
all-side shadows are reserved for floating surfaces such as menus,
drawers, dialogs, the command palette, and toasts. Badges
pair a text label with their state mark; a colour, dot, or icon is never the sole
signal. Evidence rows identify source, measurement context, and the action that
opens the persisted record. Empty and loading states preserve layout and explain
what is missing with the explicit availability vocabulary; a standalone dash is
never an empty-state label.

### Navigation and overlays

The marketing nav floats transparent over the hero and becomes a frosted white on
scroll, with no shadow. The app sidebar uses a quiet accent-soft pill for the active
location and a neutral pill on hover; the label and icon retain sufficient contrast
without translation or a leading rail.
Menus and custom listboxes use `shadow-elevated`, the semantic overlay-radius role, the shared
menu panel/item recipes, and a short system-curve entrance. Single-select filters use
radio menu items so the current value is visible without relying on colour.
Tooltips use the elevated rung and the 10px overlay-radius role; dialogs and drawers use
`shadow-modal-value` with the same overlay-radius role. Drawers are right-side modal contextual
sheets owned by `components/ui/drawer.tsx`. Their scrim dims and locks the page;
outside click, Escape, or the close control dismisses them, and focus returns to
the trigger. Controlled dialogs follow the same focus-return contract. Dialog and
drawer owners also provide modal padding and footer separation; consumers do not
recreate that chrome. Feature components never import Radix directly.

Tabs remain the underline treatment for navigation between views and for one
mutually exclusive data table within a surface (for example, Top pages and Top
queries). They provide keyboard navigation and preserve the selected tab's
focus. Segmented controls use one bordered-track recipe for compact single-select
changes within a view. Filter chips are the shared pill treatment for independent
or multi-select filters; they live in `components/ui`, not a feature directory.
The complete authenticated capability and ownership map lives in
[`ui-component-system.md`](ui-component-system.md). HeroUI is a reference for
state completeness, not an installed dependency.

Changing a chart interval retains the previous analytical content while the new
persisted projection loads. Mark the analytical region busy and show compact
loading feedback; do not replace it with a skeleton or let its labels describe
data that has not arrived.

## Motion and accessibility

Authenticated routes do not load the Motion runtime; their sanctioned feedback
uses the shared CSS interaction rules. Marketing owns its lazy Motion provider
for the few editorial scenes that require it. Pointer-opened menus use a barely visible 150–180ms origin-aware fade/shift.
Keyboard-opened command interfaces are immediate. Drawers use a short 220–260ms
right-side transition that remains interruptible. Press feedback starts on
pointer-down. Beyond that, a small, deliberate set of explanatory motions is
sanctioned, each one calm and reduced-motion-safe:

- the rotating answer-engine wordmarks and the product-window walkthrough;
- scroll **reveal** entrances (GSAP) that fade and rise a small distance and never
  hide server-rendered content after hydration;
- master-detail selection continuity and measured domain-owned expansion.
- onboarding research results resolving beneath the factual activity list with
  one 220ms fade-and-rise sequence and 60ms staggering.

Authenticated route content and tab indicators update immediately. Do not fade
either surface: navigation opacity transitions create a visible flash during
fast route and query-state changes.

Every one of these stops under `prefers-reduced-motion: reduce`: CSS animations and
transitions are neutralised globally, the SMIL pipeline dots are hidden, and the
GSAP reveals do not run. WCAG 2.1 AA is the minimum. Focus is always visible via
the accent border plus its attached glow; state is never colour-only;
forced-colours and print remain usable.

## Review checklist

Before merging a visual change, verify:

- It uses semantic global tokens and an existing primitive where one applies.
- Website and focused-flow type use documented content roles with a 14px body
  baseline; every surface uses the Geist family and semantic role weights.
- Marketing renders the light editorial system: a white root and hero, quiet
  `surface` bands, a light footer, and the real product canvas kept as the
  landing's product beat. One primary CTA per band; brand blue owns primary
  actions on every surface; no atmosphere wash, dark teal/indigo band, grain,
  or decorative icon-tile family is introduced; functional colour appears only
  in the app and inside faithful product previews.
- Chrome stands on the `canvas` ground and content on `.app-pane` paper, on every
  one of product, authentication, and onboarding. Inside paper the neutral ladder
  holds: `surface` (`#F7F9FC`) for structure/wells and `surface-2` (`#EEF1F5`)
  for hover and selected state. Sections separate with a hairline rule and space, not with a
  box around their contents; the ground/paper seam separates with tone and
  radius, never a rule.
- Controls use 6px, semantic objects use 8px, and overlays use 10px — one
  ladder on every surface, with no per-surface redeclaration of a role.
- Text names a role from `textRole`; no call site writes a font weight.
- Vertical rhythm comes from a `Stack` or a container `gap`, never a child `mt-*`.
- A bordered, filled, padded box inside a card or section is `panelClasses`.
  Shadows appear only on floating surfaces.
- Any new motion is calm and stops under `prefers-reduced-motion`.
- Text, focus, status, loading, error, empty, keyboard, touch, reduced-motion,
  forced-colours, and mobile states remain usable.
- No website or app factual copy, data, claims, or workflow behaviour changes without explicit approval.
- App data absence uses an explicit semantic label; observed zero remains distinct and authored
  prose punctuation is unaffected.

The focused flow introduces no new colour family, gradient, decorative glow,
nested card, or competitor mutation. Brand blue owns the primary action and also owns
the current step and selected-answer state without changing font weight. The
transaction flow and all explicit confirmation gates remain unchanged.
- Repository-owned static, test, and appropriate visual commands pass. External
  or manual quality tools are never acceptance gates unless a deterministic
  repository command owns them.
