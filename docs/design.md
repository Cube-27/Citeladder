# CiteLadder design

The signed-in app's visual reference: tokens, layouts and one entry per
component family. The app follows the look the owner approved
([AR](decisions.md#app-design-ar-owner-2026-11-20-unless-dated)): HeroUI's
tokens, surfaces and controls on CiteLadder's corner radii, an inset content
panel on light paper, white cards with the soft card shadow.

**Scope.** Tokens live in two layers. A `--ramp-*` block holds every literal
colour once, named by hue and lightness; nothing but a role reads a ramp step.
Roles alias ramp steps, and each surface and theme re-points the same role
names. [`globals.css`](../frontend/apps/app/src/globals.css) holds the shared
and app tokens (the app in `:root:not([data-public-surface])` and its dark
twin). [`public-surface.css`](../frontend/apps/app/src/public-surface.css)
holds the website and docs blocks (`[data-public-surface]`,
`[data-marketing-surface]`, the landing-page product screens) and the ramp
steps only they read. Only the marketing and docs entries import it, so the
app's eager CSS never carries them. A new colour is a ramp step plus a role,
never a literal at the call site; a website-only colour goes in
`public-surface.css`.

## Design values

Every design value comes from a role token (AR-26): colour, type (size, line
height, weight, tracking), spacing, size, radius, shadow, z-index, opacity and
motion. A raw value, or a token class put straight on an element by a page,
lets a later design change miss that page, so the page drifts. Atomic order:
role tokens (the colour layers above and the type ladders below), then the
primitives in `components/ui`, which alone turn roles into classes, then
screens, which compose primitives and pass content. A new look, even one used
once, adds a role token (and a primitive prop if a screen needs to choose it);
it never adds a raw value.

The lint enforces this and fails CI (`vp lint`; config in
[`vp-shared-config.ts`](../frontend/vp-shared-config.ts)):

- **`shadcn/*`** ([`@shadcn/lint`](https://github.com/shadcn-ui/lint)):
  no palette colours, no arbitrary values (class constants included), no
  inline styles beyond a literal object of custom properties (the rule's
  default; no option is enabled), no classes the theme cannot generate, no unreadable or
  restyling `className` on a `components/ui` primitive. Each subdomain's
  theme is the `components.json` nearest the file.
- **`design/*`** (the [local plugin](../frontend/scripts/design-lint/plugin.mjs)):
  `plain-element` (outside `components/ui`, a plain element's `className`
  carries layout structure only: no spacing, size, colour, type, shape, effect
  or motion class, no `*Classes()` helper, nothing
  unreadable), `reset-survivor` (`leading-<n>`, `text-<role>/<n>`, `z-<n>`,
  `opacity-<n>`, `duration-<n>`, `delay-<n>`), `colour-literal` (a hex or
  colour function in any string), `monochrome-colour` (`white`/`black`),
  `surface-variant` (a `[[data-public-surface]_&]:` variant outside
  `components/ui`), `raw-media` (outside `components/ui` and the website, an
  `<img>` or a sized `<svg>`: logos and engine marks render through
  `BrandMark`, sized from the icon roles and never taller than their line, so
  a mark cannot set a row's height) and `astro-class` (value classes in Astro
  markup).

There is no suppressions file and no baseline: a finding is fixed at its
source, by a role token or a primitive prop. No
inline `oxlint-disable` may name a `design/` or `shadcn/` rule (the comment
check rejects it). A fixture in `frontend/scripts/design-lint/canary` must trip
every rule (`scripts/frontend/design-lint.test.mjs`).

`pnpm check:policy` adds WCAG AA contrast of token pairs (every
`--text-color-*` role on the grounds of its palette at 4.5:1, marks 3:1, both
themes), the app's Tailwind `@source` list and the CSS value rule
([`design-system-css-values.mjs`](../frontend/scripts/design-system-css-values.mjs)),
and reports breaks of the [composition rules](#composition) as a warning that
never fails CI (AR-25). The CSS value rule reads every `.css` file and Astro
`<style>`, `globals.css` rule blocks included: outside `@theme`, custom
property declarations, `@keyframes` and `@font-face`, a colour, type, z-index,
motion, shadow, spacing or border-width value holds no hex, colour function,
`px`/`rem`/`em`/`ms`/`s` length or bare z-index, weight or line-height
number. Tokens, keywords, `0`, unitless multipliers, percentages and gradient
stops pass; `forced-colors` and `prefers-reduced-motion` blocks are exempt.

The website (marketing and docs) composes the same primitives, and its own
blocks are `cl-*` classes whose CSS, in the side sheets the marketing and docs
entries import or an Astro `<style>`, reads role tokens. A variant is a data attribute or a lookup map of
whole class names, never a class built from a template. In that CSS a
declaration holds a token, a keyword, `0`, an opacity toggle, a percentage,
`fr` or container and viewport units, a gradient stop or angle, or a unitless
multiplier; anything else is a token. A dimension one block alone uses is a
token in the `:root` block at the top of that block's sheet.

## Tokens

Values live in [`globals.css`](../frontend/apps/app/src/globals.css): HeroUI's
zinc neutrals and shadows in both themes (AR-1).

| Token                    | Use                                                      |
| ------------------------ | -------------------------------------------------------- |
| `ground`                 | window and sidebar                                       |
| `page`                   | the inset content panel's paper                          |
| `panel`                  | cards, overlays, controls on the paper                   |
| `raised`                 | secondary buttons, menus                                 |
| `raised-2`               | hover and press fill, disabled field                     |
| `well`                   | fields in a surface, quoted material, table group rows   |
| `state-hover`            | row and quiet-control hover                              |
| `state-selected`         | tags, keyboard hints, value tokens                       |
| `state-fill`             | controls in a surface, segmented tray, rail current row  |
| `rule`                   | every hairline                                           |
| `control-line`           | checkbox and radio edge, draft edge                      |
| `ink`, `ink-2`           | text; secondary text and icons                           |
| `ink-placeholder`        | field placeholders, 4.5:1 on `well`                      |
| `mark-ink`, `mark-ink-2` | a fill, edge or shadow drawn in the ink colour           |
| `accent`                 | "you, here" and focus                                    |
| `primary`                | every action fill, white text                            |
| `shadow-card`            | page-level cards and controls on the paper; none in dark |

Text colours live in `--text-color-*` (`ink`, `ink-2`, `ink-placeholder`,
`accent-text`, `on-ink`, `on-primary`, `nav-ink`), so `text-ink` exists and
`bg-ink` does not; SVG text reads them through `--fill-*`. Three roles keep a
distinct value only on the website: `rule-strong`, `chart-grid` and
`state-pressed` (the app binds them to `control-line`, `rule` and
`state-selected`). Status colours (`positive`, `negative`, `warning`, `info` and their
`-wash` fills), `accent-text`, `accent-wash` and the data series keep their
values in `globals.css`. A status colour appears only beside a glyph and a
word, never as a large fill. Two exceptions (owner, 2026-11-22): a Site health
page score, printed in `negative` below 50 and `warning` below 80, and
Perception › Brand's sentiment donut and attribute bars (AR-19). Data: `data-you` is the accent, `data-rival-1`
to `-4` ink then cool hues in rank order, `data-other` the grouped rest.

## Type

Sans (Google Sans) for words and numbers alike, numbers in its tabular
figures (dates, counts, prices, URLs too); the website sets its metric figures
in mono. Mono (Geist Mono) only for literal
code: API keys, code blocks, raw IDs and keyboard hints. Weights 400 and 500 only; the app's dark asks for every weight 50 lighter
(350 and 450: light text on dark reads heavier), but the sans face starts at 400, so regular sans text is 400 in both themes and only 450 and the mono and display faces draw lighter. Emphasis is 500, never
colour. Sizes are rem so they follow the reader's text size.

Every size and line height derives from one base and one step per subdomain:
the app's base is 14 and the website's is 16, both with a 2px step (owner,
2026-11-26). A role's size is the base plus whole steps, and its line height is
the size plus whole steps, so a change to the base moves every role together.
The one exception is docs' `code` (13/22), half a step below `body`, and
docs' `data` line height that follows it. The app ladder lives in
[`app-type.css`](../frontend/apps/app/src/app-type.css), shared by the app and
the MCP app. The website ladder lives in
[`site-type.css`](../frontend/apps/marketing/src/site-type.css), shared by
marketing and docs: its `@theme` holds the docs values and one
`[data-marketing-surface]` block holds every marketing difference, so no other
sheet re-points a website role. A theme alias resolves on `:root`, so that block
declares the line height of every size it re-points, and any alias whose source
it changes. Each ladder file sets its own `--type-base` and `--type-step` in
`:root`; entry stylesheets never do.
A role name means the same job on both ladders: `body` is UI text at 14 on both,
and the website's 16px reading copy is `site-body`. Weights come only from
`--weight-regular` and `--weight-medium`; the app's dark theme re-points those
two. `font-emphasis` and `font-plain` are the only weight utilities. Tailwind's
default weight, leading and tracking scales are switched off.

| App role        | Size / line | Weight                  |
| --------------- | ----------- | ----------------------- |
| body, label     | 14 / 20     | 400, label 500          |
| caption, code   | 12 / 16     | 400                     |
| heading         | 16 / 24     | 500                     |
| prose           | 16 / 26     | 400                     |
| title, page title | 20 / 28   | 400, page title 500     |
| figure (metric) | 20 / 28     | 500, tabular            |

A screen names the job through `<Text variant tone>` in
[`typography.tsx`](../frontend/components/ui/typography.tsx); a primitive uses
the matching `text-<role>` utility; neither names a size, weight or line height. A `text-<role>`
utility sets size, line height, weight and tracking only; the face and the ink
come from `font-*` and `text-<ink>` beside it. A face that differs by subdomain
is a face role each ladder sets: `font-figure` is sans in the app and mono on
the website. `code` is a utility only in the app; the website keeps its size as
the `--text-code` variable in `site-type.css` for code blocks (13 on docs, 14 on
marketing).

## Spacing, size and shape

- **Spacing and size:** named `--spacing-*` roles in the `@theme` of
  `globals.css` (`gap-section`, `p-card`, `px-gutter`, `min-h-control-md`,
  `h-row`…), one name per role, re-pointed per subdomain and breakpoint where
  the value differs. A role that must resolve under a re-pointing ancestor
  (the sidebar width) goes in `@theme inline`. Inside a primitive, steps of
  the 4px scale are allowed; a screen never picks a step. Grid templates are
  `grid-cols-<role>` roles, rendered by `Columns template`. App CSS reads
  `var(--spacing)` multiples and `--rule-width` for border widths.
- **Website spacing and size:**
  [`site-space.css`](../frontend/apps/marketing/src/site-space.css) derives
  `--site-space-<n>` from the website's base (a quarter of it per step), so a
  base change moves spacing with type, the gutter (`--site-gutter`) and the nav
  height (`--nav-height`) included. It also names the hairline (`--site-rule`),
  the 44 target, the underline offsets, the shared reading measures
  (`--site-measure-*`), the marketing block radii (`--site-radius-*`, fixed px)
  and the grain. A step or measure only one block uses is a token at the top of
  that block's sheet, not a shared step.
- **Motion, layering and opacity:** `duration-<role>` (fast 120, close 160,
  open 200, press 250, slide 300, plus reveal, pulse, sweep and the stagger
  steps), `ease-<role>`, `z-<role>` (base, raised, sticky, float, overlay,
  modal, toast) and `opacity-<role>` (disabled 50, muted 80, dim 70, ghost, hover).
  `cn` knows every role, so a caller can still override one.
- **Controls:** 36 high (HeroUI's medium); 44 below 900px or under a coarse pointer, and on
  sign-in, account and setup pages (the website's height, `control-lg`).
  Icons 14 in `ink-2` (Tabler, the `Icon` atom), centred on and no taller than
  the 14px text beside them; empty-state tiles and website wells draw larger.
  Every target is at least 24×24.
- **Radii** stay CiteLadder's, not HeroUI's (AR-1): tag 5 (`rounded-mark`),
  control and menu 8 (`rounded-control`), card 10 (`rounded-card`), overlay 14
  (`rounded-overlay`), and 4 for a part inside a frame (`rounded-inner`);
  `full` only for avatars, dots and switch tracks. On the website and docs
  mark, inner, control, card and overlay are 2, 4, 6, 8 and 12. CSS reads these
  roles, never the `xs`–`lg` scale; marketing blocks add the
  `--site-radius-*` roles above.

## Kept rules

**The line language.** How a thing is drawn is a finding:

- **Solid** is observed: a persisted measurement or a person's decision.
- **Dashed** is drafted by a model and not yet accepted; accepting it turns
  the edge solid.
- **Absent** is one em dash `—` in `ink-2`; the kind of absence (Not measured,
  Not run yet, Not set, Not connected, Unavailable, Not applicable, Too few,
  None, owned by `availabilityLabels` in `lib/format.ts`) is its tooltip and
  accessible name.
- A real zero is a printed `0` in full ink, never greyed; the one exception is a zero issue count in the Site health pages table, printed in `ink-2` (owner, 2026-11-22).

**The accent means "you, here".** It marks you (your brand's row, series and
the word "You") and here (the current nav item and step, as a 2px mark
with `aria-current` or `aria-selected`), the live rung, and where keyboard
and input focus is (AR-13). Never an action, status, link or decoration.

**Nothing moves on interaction.** Pagination, tabs, filters, sorting, loading
and empty states keep their footprint; a pending button keeps its width.

**One loading state per page load.** `FirstFrame` (and `index.html`'s boot
frame) owns what is drawn first: a shell route draws the shell and its
skeleton, a flow route its plain ground. Data on screen stays while it
refreshes.

**Accessibility.** WCAG AA in both themes; meaning never by colour alone; one
`focus` ring, never removed: a 2px accent ring 2px outside the control,
drawn inward where a frame clips it; it holds 3:1 on every fill; all motion stops under
`prefers-reduced-motion`.

## Standard layouts

Pages are placed into these layouts, never arranged by hand (AR-10).

- **Shell.** Sidebar 224 on `ground` (200 below 1280), 8 padding: header row
  as tall as the page header (workspace switcher, settings icon), the
  Dashboard | Agent segmented control, 32-high nav rows (current row on a
  `nav-current-fill` pill with the card shadow, and a 2px accent mark), 12px group labels, foot with Integrations (the collapse toggle at
  its end) and the account (AR-8). The main column is the inset panel: 8 from the window
  edges (none on the sidebar side), a `rule` edge at half strength, card radius,
  `page` fill, the page's only scroller: the window never scrolls and nothing
  shows below the panel (owner, 2026-11-23). Scrollbars are the browser's thin
  bar, shown on hover. Dragging the sidebar's edge draws no line. Below 900 the panel fills the
  window and the header's menu button opens the sidebar in a drawer.
- **Page header**, 48 high, on `page` with a `rule` hairline under it across
  the panel, its two ends padded 24 from the panel edges on every page
  whatever the page width (owner, 2026-11-22): the page title as a breadcrumb
  (section › page; a record adds its collection, and its name
  is the h1 above the strips), then secondary actions, at most one primary
  action, Search ⌘K and Ask agent at the right edge. The section is the nav
  group holding the current row, Agent, or Workspace; below 900 only the
  page shows.
- **Tab strip**, 40 high: underline tabs on a `rule` baseline that runs only
  between the page paddings; the current tab is `ink` over a 2px `ink`
  underline (`tab-line`), the rest `ink-2`. The
  tab strip and the toolbar under it stick below the page header with 12 of
  `page` above and below them.
- **Body.** 24 side padding (16 below 760px), 24 below; the title, tab
  strip, toolbar and content sit 12 apart, the same gap as a table's
  toolbar above its table (owner, 2026-11-22): status line,
  then the metric strip, then cards 20 apart (`gap-section`) with no
  rule between them; a section's head is inside its card (AR-24). Links carry no underline at rest,
  only on hover and focus. Narrow pages centre the body in their column (AR-9; 1040:
  Overview, Projects, Issues, Actions, Agent, Settings, Agent context; 720:
  Billing, Pricing, Runs, and the Site Health page detail and Action detail
  pages, AR-22).
- **Toolbar**, above the content it scopes: segmented control, search, filter
  buttons, then right-aligned the muted count and one action, 8 apart. A
  page-wide toolbar (`FilterBar`) is the strip under the tabs, with no rule,
  and takes no search (`PageFrame` `filters` is `FilterBarProps`, which has
  none): a search narrows one table, so it lives in that
  table's `TableToolbar` (`DataTable toolbar`). A `DataTable` head is one row:
  title at the start, then the view, search and filters, and its actions
  (`actions` and `toolbar.actions` together) at the end. It wraps only when
  the content does not fit; a card never has a row holding only an action or
  only a search (owner, 2026-11-27). An export is `ExportAction`:
  `scope="page"` in the page header actions, `scope="table"` in the table
  toolbar.
- **Metric strip:** a bleed slot of a card (on the paper it brings its own
  card), cells divided by hairlines, padded 12 by the card inset, 12px label
  over the value. Never one card per figure;
  no meters, rings or bars inside a cell (AR-3). The one table with a bar in a
  cell is Perception › Brand's attributes table (AR-19).
- **Table:** a `DataTable` is always a `Section` (a card on the paper, flat in
  a surface) whose rows bleed to the card's edges; no tray and no inner card.
  Head band 36 on `table-head-ground`, 12px at 500, a 16-high `rule` tick
  between columns; cells padded 12 inline and 8 block, the first and last
  cell padded to the card inset so cell text lines up with the title and
  actions; rows 44, one line each, hairline dividers, `state-hover` fill; secondary text
  inline after the primary in `ink-2`; numbers right-aligned in tabular
  figures; foot 40 with the count and an icon pager. The first column takes the spare width,
  the others hug their content (AR-4).
- **Settings layout** (Settings, Agent context, Billing, Pricing): the
  route's column holds a stack of group cards 20 apart. Settings and Agent context list their sections in a sticky 192 rail
  of sidebar rows on the column's left (`TabRail`), never a tab strip; the
  current section sits 24 beside it, at most 720 wide (Business map takes
  the rest of the column), so the header and rail never move (AR-9). A
  section stacks its groups the same way. A
  group (`SettingsGroup`) is a `Section` card: its header (subheading, a
  status 8 after it, an optional one-line 12px `ink-2` caption 4 below, the
  group's one action right-aligned on the heading's line), then its body 16
  below. The body is a bleed list (`SettingRows`) of setting rows with a
  hairline between them; or, for a list of things
  (members, keys, connections, invoices, offerings), a `DataTable`. Notices
  about a group sit between its head and its body. A row (`SettingRow`) is
  padded 12 by 16, at least 52 high: a 14/500 label with an optional 12px
  `ink-2` help line under it at the left; at the right its value in `ink-2`
  or its control (switch, select, button). A text field (`SettingField`) sits
  under its label across the row; a short choice (`inline`) stays at the
  right. Immediate controls save on change; a form that needs Save puts one
  primary Save in the frame's foot, right-aligned, disabled until something
  changed. Destructive actions (cancel plan, leave workspace, delete
  project) are danger buttons in the page's last group, never primary. Plan
  cards are the layout's only row of cards (`CardGroup` heading over a
  `CardRow` of equal `Section`s, one per line below 640), prices in tabular
  figures, the current plan a `Section accent` (a 2px accent rule along its
  top) with the words "Current plan". A model's suggestion keeps the dashed
  draft edge.

## Composition

One closed set of primitives in
[`section.tsx`](../frontend/components/ui/section.tsx) and
[`section.css`](../frontend/components/ui/section.css), modelled on HeroUI's
Card (owner, 2026-11-26: the same bug should show on every page, so no screen
draws its own geometry). Every visible thing in the app's main column, drawers
and dialogs is one of them; [`section.test.tsx`](../frontend/components/ui/section.test.tsx)
holds the depth rules.

- **Pages pass content, never geometry.** A primitive exposes typed props
  (`Stack`/`Inline` `gap`, `align`, `justify`, `wrap`; `Stack` `pad`;
  `Columns template`; `Text` `wrap`, `box`, `align` and `tone`; `tone` on `Icon` and
  the link components). Template chrome (page width, heading row, tab and
  filter bands, thread and setup frames) lives in
  [`page-chrome.tsx`](../frontend/components/ui/page-chrome.tsx) and
  [`flow-frame.tsx`](../frontend/components/ui/flow-frame.tsx), which boot
  screens import, and in `flow-chrome.tsx` and `record-chrome.tsx`, which
  only lazy routes import: a module a boot file imports ships whole in the
  eager bundle. Templates compose them and hold no classes. `Stack` and `Inline` take
  typed props only, with no `className`; restyling any other primitive
  through `className` is a lint finding.
  No page adds padding, margin, border, fill, radius or shadow around one; no
  globals rule depends on what contains what. A primitive that needs its
  depth reads `SurfaceContext` (`useOnPage()`), never a CSS ancestor. A
  surface sets the control face tokens on itself (Buttons below); controls
  only read them.
- **Depth.** `Section`, `PanelFrame`, `Drawer`, `Dialog` and `DraftSheet`
  provide `surface`. On the paper a `Section` is a card (`panel`, card radius
  and shadow, padded `panel-inset` 16); inside a surface it is flat (no
  fill, padding, radius or shadow) and its title takes the subheading role. A
  card can never draw inside a card.
- **Slots.** `Section` > `SectionHeader` (title, description, `actions`) >
  `SectionToolbar` (`FilterBar` or tabs) > `SectionContent` (at the inset;
  `fill` takes the card's spare height) > `SectionBleed` > `SectionFooter`,
  16 apart. The header lives inside the card (AR-24); `actions` holds buttons,
  links and a status, never a filter or tabs, and a value-setting control goes
  in the toolbar when there is one.
- **Bleed.** `SectionBleed` is the one full-width slot: tables, `FigureStrip`,
  `SettingRows`, `LedgerList` and other row lists run edge to edge and pad
  `panel-inset` on their own edges, so row text lines up with the title.
  A bleed that is the card's first or last slot meets that edge; otherwise it
  draws one hairline on top, the only rule a card draws. It must be a direct
  child of the section (tab wrappers in a surface pass through). Nothing else
  uses negative margins. On the paper a bleed, strip, table or `StateBlock`
  with no section around it wraps itself in one.
- **Page body.** A `SectionStack` of page-level `Section`s, `AppGrid`s of them
  and self-wrapping primitives, `gap-section` apart; only headings, the
  page toolbar and a `Notice` sit on the paper (AR-22).
- **Overlays.** A drawer or dialog body is a surface at `spacing-modal` (24):
  its sections are flat and 24 apart, tables bleed to its edges. Fields
  inside group in one `Stack gap="workspace"`; nothing else wraps the body.
  Overlay styling keys on `data-overlay`, never `[role=dialog]`.
- **Never:** a card inside a card, a hand-written card face (`wellClasses` is
  only for quoted or raw material), a table, strip or list inside
  `SectionContent`, a `FilterBar` or tabs in header `actions`, `-mx`/`-my`
  outside `SectionBleed`.

## Components

- **Tables.** Geometry as in Standard layouts. A page declares each
  column's kind and width role, never a pixel width; `DataTable` turns them
  into data attributes on the table frame (`data-c<n>`), read by the static
  position rules in `components/ui/generated/data-table-positions.css`
  (16 positions; `pnpm gen:table-positions` rewrites it, and a test fails
  when it is stale): `flex` columns share the spare
  width and cut their text, every other role hugs its content above a small
  floor, so no gap opens between columns. When the floors do not fit, `low`
  columns hide, the last first; below that the table scrolls with the first
  column pinned. Every row is one line; secondary text follows the primary
  inline (`TableCellLines`). Below 768px no column is sticky and cell text
  wraps instead of truncating (`table-phone.css`). The foot band sits inside the frame.
- **Metric strip** (`FigureStrip`). One row (AR-3): cells share it equally and
  never wrap; below 160px a cell's label takes two lines, and below 128px the
  strip scrolls sideways. Each cell draws its
  divider on its start edge and the frame clips the outer one. The geometry
  census fails a strip whose cells sit at different tops. A score is a printed
  figure.
- **URLs** (`UrlText`, `UrlCutParts`). A URL is cut in the middle (AR-23): the
  last path segment stays whole when short, otherwise the last 28 characters
  stay, and the full URL shows in the tooltip.
- **Containers.** See [Composition](#composition): the card is `Section`, and
  nothing else draws a card in the app.
- **Lists and rows.** A list row matches a table row: 44 high, hairlines
  between rows, `state-hover` when it opens something.
- **Overlays** (dialogs, drawers, command palette). `panel` with no edge,
  radius 14 and the sheet shadow; header and body padded 24, the
  footer 12 by 24 under a hairline.
- **States.** Loading draws the final geometry (a table its head over block
  rows, a strip its cells). Empty and error sit quietly inside the frame of
  the content they replace; an empty state directly on the paper, an empty
  table included, is drawn as a card. A notice is a line of text with no frame
  (owner, 2026-11-21): the tone's 6px dot and the tone's word for screen
  readers, never a fill.
- **Charts.** A chart on the paper is a `panel` card, a one-period list
  included. Your series is the accent, drawn last; a missing period is a
  gap, never a zero. Series colours come from one map by identity
  (`SERIES_STROKE`, `SERIES_FILL`); position-coloured charts map onto it.
- **Buttons** ([`button.tsx`](../frontend/components/ui/button.tsx)). 36,
  radius 8; 14px icons in `ink-2` on a secondary. Secondary, filter chip,
  select trigger and field share one face per ground: on the paper `raised`
  with the field shadow, inside a surface (card, overlay, well, menu) the
  `state-fill` grey with no shadow. Each surface sets `--control-face`,
  `--control-face-hover` and `--control-face-shadow` on its own element; the
  secondary button reads them (`bg-control-face`, `shadow-control-face`), so a
  link styled as a button (`Button asChild`) matches. Quiet:
  transparent, `ink`, `state-hover` fill. Primary: `primary` fill (the deep accent),
  white text, at most one per view. Danger: secondary with negative text; filled only to confirm in a
  dialog (`danger-confirm`). One disabled look for every variant. The
  website keeps its layered `.face`.
- **Inputs** ([`input.tsx`](../frontend/components/ui/input.tsx)). 36, the
  control face above with no edge at rest (`well` inside a surface); focused,
  an accent edge inside the focus ring; invalid, a negative edge that stays
  when focused. Disabled controls draw at 50%. 14px leading icon. Checkbox and radio
  are `panel` with a `control-line` edge, the one edged control, and a `primary` fill when on; the switch is a `primary`
  track when on, as is a picked calendar day and the setup stepper. Several short values ([`ValuesInput`](../frontend/components/ui/chip-input.tsx))
  are 24-high tokens on `state-selected`, a suggestion dashed with one accept
  tick per field, then the add field; Enter (and a comma in a grid cell) adds,
  Tab leaves. A grid cell drops the edge until focused. A share of a whole
  ([`SplitBar`](../frontend/components/ui/split-bar.tsx)) is a bar of light tints
  of the cool series hues, parted by `panel` gaps as tall as the bar that
  are its sliders, 5% steps, a dot legend in the full hues under it.
- **Selects and menus.** A select or filter trigger is a secondary button's
  face (`TRIGGER_BOX`); a typed combobox is an input. Menus, listboxes and
  tooltips are `raised` with the pop shadow, radius 8, 28-high rows on
  `state-hover`; a select's list is at least its trigger's width.
- **Tabs and segmented control** ([`tabs.tsx`](../frontend/components/ui/tabs.tsx)).
  Tabs are underline tabs padded 16 at 500, the current one `ink` over a 2px
  `ink` line, the rest `ink-2`. A panel's tabs are the slot under its header,
  their baseline across the card; never above the card or in its actions.
  Segmented control (and the sidebar's Dashboard | Agent): a `state-fill`
  tray one control high, padded 4, with no edge, 28-high segments, the selected one a
  `nav-current-fill` pill with the card shadow.
- **Tags and status.** Tag: 20 high, radius 5, `state-selected` fill, no edge, 12px at 500 in `ink`; a
  draft is dashed; Kbd and composer chips share the face. Status
  (`StatusMark`): the tone's 6px dot and a 12px word at 500 in `ink`, 20
  high, no frame (owner, 2026-11-21); a live state draws the spinner.
  Priority's bars alone sit in a pill (radius full, `rule` edge).
- **Navigation.** Sidebar rows: 14px icon, label, 8 apart, radius 8, `ink`
  at rest and `state-hover` on hover; a group label folds its rows and a
  folded group still shows the current row. Collapsed (⌘\ or the toggle,
  remembered per browser) the sidebar is a 56 rail of 40 buttons, one per
  group, each opening a flyout; the toggle stays in the foot, straight above
  the account.
