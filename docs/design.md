# CiteLadder design

The signed-in app's visual reference: tokens, layouts and one entry per
component family. The app follows the look the owner approved
([AR](decisions.md#app-design-ar-owner-2026-11-20-unless-dated)): HeroUI's
tokens, surfaces and controls on CiteLadder's corner radii, an inset content
panel on light paper, white cards with the soft card shadow.

**Scope.** Tokens live in
[`globals.css`](../frontend/apps/app/src/globals.css). The app binds its own
values in `:root:not([data-public-surface])` and its dark twin; the website
and docs (`[data-public-surface]`, `components/marketing`,
`components/content`) keep the system values above those blocks and are out of
scope here. App code uses the app's role names, never a website role
(`paper`, `line`, `ink-secondary`, the `-soft` fills).

**Checks.** `pnpm check:policy` keeps three rules: no literal colours outside
`globals.css`, WCAG AA contrast of token pairs (text 4.5:1, marks 3:1, both
themes), and no Radix import outside `components/ui`. The same script reports
breaks of the [composition rules](#composition) as a warning that never fails CI
(AR-25); everything else here is held by review.

## Tokens

Values live in [`globals.css`](../frontend/apps/app/src/globals.css): HeroUI's
zinc neutrals and shadows in both themes (AR-1).

| Token            | Use                                                     |
| ---------------- | ------------------------------------------------------- |
| `ground`         | window and sidebar                                      |
| `page`           | the inset content panel's paper                         |
| `panel`          | cards, overlays, controls on the paper                  |
| `raised`         | secondary buttons, menus                                |
| `raised-2`       | hover and press fill, disabled field                    |
| `well`           | fields in a surface, quoted material, table group rows  |
| `state-hover`    | row and quiet-control hover                             |
| `state-selected` | tags, keyboard hints, value tokens                      |
| `state-fill`     | controls in a surface, segmented tray, rail current row |
| `rule`           | every hairline                                          |
| `control-line`   | checkbox and radio edge, draft edge                     |
| `ink`, `ink-2`   | text; secondary text and icons                          |
| `accent`         | "you, here" and focus                                   |
| `primary`        | every action fill, white text                           |
| `shadow-card`    | page-level cards and controls on the paper; none in dark |

Older role names bind onto the table so call sites keep working: `chrome` is
`ground`, `surface` is `panel`, `chart-grid` is `rule`, `state-pressed` is `state-selected`, `on-ink` is
`panel`. Status colours (`positive`, `negative`, `warning`, `info` and their
`-wash` fills), `accent-text`, `accent-wash` and the data series keep their
values in `globals.css`. A status colour appears only beside a glyph and a
word, never as a large fill. Two exceptions (owner, 2026-11-22): a Site health
page score, printed in `negative` below 50 and `warning` below 80, and
Perception › Brand's sentiment donut and attribute bars (AR-19). Data: `data-you` is the accent, `data-rival-1`
to `-4` ink then cool hues in rank order, `data-other` the grouped rest.

## Type

Sans (Google Sans) for words and numbers alike, numbers in its tabular
figures (dates, counts, prices, URLs too). Mono (Geist Mono) only for literal
code: API keys, code blocks, raw IDs and keyboard hints. Weights 400 and 500 only; the app's dark asks for every weight 50 lighter
(350 and 450: light text on dark reads heavier), but the sans face starts at 400, so regular sans text is 400 in both themes and only 450 and the mono and display faces draw lighter. Emphasis is 500, never
colour. Sizes are rem so they follow the reader's text size.

| Role            | Size / line | Weight                  |
| --------------- | ----------- | ----------------------- |
| body, label     | 14 / 20     | 400, label 500          |
| caption         | 12 / 16     | 400                     |
| heading         | 16 / 24     | 500                     |
| page title      | 14 / 20     | 500, in the page header |
| figure (metric) | 20 / 28     | 500, tabular            |

The roles are the closed set in
[`typography.tsx`](../frontend/components/ui/typography.tsx); a call site names
the job, never a size.

## Spacing, size and shape

- **Spacing:** 2, 4, 8, 12, 16, 24, 32, 48 only.
- **Controls:** 36 high (HeroUI's medium); 44 below 900px or under a coarse pointer, and on
  sign-in, account and setup pages (the website's height, `control-lg`).
  Icons 14 in `ink-2` (Tabler, the `Icon` atom), centred on and no taller than
  the 14px text beside them; empty-state tiles and website wells draw larger.
  Every target is at least 24×24.
- **Radii** stay CiteLadder's, not HeroUI's (AR-1): tag 5 (`rounded-mark`),
  control and menu 8 (`rounded-control`), card 10 (`rounded-card`), overlay 14
  (`rounded-overlay`); `full` only for avatars, dots and switch tracks.

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
  then the metric strip, then cards 20 apart (`--page-section-gap`) with no
  rule between them; a section's head is inside its card (AR-24). Links carry no underline at rest,
  only on hover and focus. Narrow pages centre the body in their column (AR-9; 1040:
  Overview, Projects, Issues, Actions, Agent, Settings, Agent context; 720:
  Billing, Pricing, Runs, and the Site Health page detail and Action detail
  pages, AR-22).
- **Toolbar**, above the content it scopes: segmented control, search, filter
  buttons, then right-aligned the muted count and one action, 8 apart. A
  page-wide toolbar is the strip under the tabs, with no rule.
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

- **Pages pass content, never geometry.** No primitive takes `className`; no
  page adds padding, margin, border, fill, radius or shadow around one; no
  globals rule depends on what contains what. A primitive that needs its
  depth reads `SurfaceContext` (`useOnPage()`), never a CSS ancestor. The one
  exception is the control face per ground (Buttons above).
- **Depth.** `Section`, `PanelFrame`, `Drawer`, `Dialog` and `DraftSheet`
  provide `surface`. On the paper a `Section` is a card (`panel`, card radius
  and shadow, padded `--panel-inset` 16); inside a surface it is flat (no
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
  `--panel-inset` on their own edges, so row text lines up with the title.
  A bleed that is the card's first or last slot meets that edge; otherwise it
  draws one hairline on top, the only rule a card draws. It must be a direct
  child of the section (tab wrappers in a surface pass through). Nothing else
  uses negative margins. On the paper a bleed, strip, table or `StateBlock`
  with no section around it wraps itself in one.
- **Page body.** A `SectionStack` of page-level `Section`s, `AppGrid`s of them
  and self-wrapping primitives, `--page-section-gap` apart; only headings, the
  page toolbar and a `Notice` sit on the paper (AR-22).
- **Overlays.** A drawer or dialog body is a surface at `--modal-padding` (24):
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
  into one scoped rule set (`columnRules`): `flex` columns share the spare
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
  `state-fill` grey with no shadow. App rules key on the `ui-button-<variant>`
  class `buttonClasses()` emits, so a link styled as a button matches. Quiet:
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
