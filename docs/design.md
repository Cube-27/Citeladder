# CiteLadder design

The signed-in app's visual reference: tokens, layouts and one entry per
component family. The app follows the Linear-style look the owner approved
([AR-1 to AR-17](decisions.md#app-design-ar-owner-2026-11-20-unless-dated)): quiet greys, hairline
borders, an inset content panel, compact controls.

**Scope.** Tokens live in
[`globals.css`](../frontend/apps/app/src/globals.css). The app binds its own
values in `:root:not([data-public-surface])` and its dark twin; the website
and docs (`[data-public-surface]`, `components/marketing`,
`components/content`) keep the system values above those blocks and are out of
scope here. App code uses the app's role names, never a website role
(`paper`, `line`, `ink-secondary`, the `-soft` fills).

**Checks.** `pnpm check:policy` keeps three rules: no literal colours outside
`globals.css`, WCAG AA contrast of token pairs (text 4.5:1, marks 3:1, both
themes), and no Radix import outside `components/ui`. Everything else here is
held by review.

## Tokens

| Token            | Dark                     | Light              | Use                                  |
| ---------------- | ------------------------ | ------------------ | ------------------------------------ |
| `ground`         | `#0a0a0c`                | `#f2f2f4`          | window and sidebar                   |
| `panel`          | `#151516`                | `#ffffff`          | the inset content panel              |
| `raised`         | `#1e1e1f`                | `#ffffff`          | secondary buttons, menus             |
| `raised-2`       | `#2b2b2c`                | `#eef0f2`          | hover on raised, avatar              |
| `state-hover`    | `rgb(255 255 255 / 4%)`  | `rgb(0 0 0 / 3%)`  | row and quiet-control hover          |
| `state-selected` | `rgb(255 255 255 / 7%)`  | `rgb(0 0 0 / 6%)`  | selected segment, dark current row   |
| `rule`           | `rgb(255 255 255 / 8%)`  | `rgb(0 0 0 / 8%)`  | every hairline (the spec's `line`)   |
| `control-line`   | `rgb(255 255 255 / 12%)` | `rgb(0 0 0 / 12%)` | hovered field edge (`line-strong`)   |
| `ink`            | `#ececec`                | `#1d1d1d`          | text                                 |
| `ink-2`          | `#979798`                | `#5f636a`          | secondary text, icons                |
| `accent`         | `#ff6a33`                | `#e8501a`          | "you, here" and focus                |
| `primary`        | deep accent              | deep accent        | every action fill, white text        |

Older role names bind onto the table so call sites keep working: `chrome` is
`ground`, `surface` is `panel`, `well` is `#f7f8f9` in light (`raised` in
dark), `control-edge` and
`chart-grid` are `rule`, `state-pressed` is `state-selected`, `on-ink` is
`panel`. Status colours (`positive`, `negative`, `warning`, `info` and their
`-wash` fills), `accent-text`, `accent-wash` and the data series keep their
values in `globals.css`. A status colour appears only beside a glyph and a
word, never as a large fill. Data: `data-you` is the accent, `data-rival-1`
to `-4` ink then cool hues in rank order, `data-other` the grouped rest.

## Type

Sans (Spline Sans) for words and numbers alike, numbers in its tabular
figures (dates, counts, prices, URLs too). Mono (Geist Mono) only for literal
code: API keys, code blocks, raw IDs and keyboard hints. Weights 400 and 500 only; the app's dark draws every weight 50 lighter
(350 and 450: light text on dark reads heavier). Emphasis is 500, never
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
- **Controls:** 28 high; 44 below 900px or under a coarse pointer, and on
  sign-in, account and setup pages (the website's height, `control-lg`).
  Icons 14 in `ink-2` (Tabler, the `Icon` atom), centred on and no taller than
  the 14px text beside them; empty-state tiles and website wells draw larger.
  Every target is at least 24×24.
- **Radii:** tag 4 (`rounded-mark`), control 6 (`rounded-control`), panel,
  table and strip 8 (`rounded-card`), overlay 12 (`rounded-overlay`); `full`
  only for avatars, dots and switch tracks.

## Kept rules

**The line language.** How a thing is drawn is a finding:

- **Solid** is observed: a persisted measurement or a person's decision.
- **Dashed** is drafted by a model and not yet accepted; accepting it turns
  the edge solid.
- **Absent** is one em dash `—` in `ink-2`; the kind of absence (Not measured,
  Not run yet, Not set, Not connected, Unavailable, Not applicable, Too few,
  None, owned by `availabilityLabels` in `lib/format.ts`) is its tooltip and
  accessible name.
- A real zero is a printed `0` in full ink, never greyed.

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
`focus` ring, never removed: a 1px accent edge with a soft accent glow (3px
at 24%), drawn inward where a frame clips it; the edge holds 3:1 on every
fill; all motion stops under
`prefers-reduced-motion`.

## Standard layouts

Pages are placed into these layouts, never arranged by hand (AR-10).

- **Shell.** Sidebar 224 on `ground` (200 below 1280), 8 padding: header row
  as tall as the page header (workspace switcher, settings icon), the
  Dashboard | Agent segmented control, 28-high nav rows (current row on a
  `#e7e7ea` pill in light, `state-selected` in dark, with a 2px accent
  mark), 12px group labels, foot with Integrations (the collapse toggle at
  its end) and the account (AR-8). The main column is the inset panel: 8 from the window
  edges (none on the sidebar side), `rule` edge, radius 8,
  `panel` fill, the page's only scroller. Below 900 the panel fills the
  window and the header's menu button opens the sidebar in a drawer.
- **Page header**, 44 high, no rule under it (owner, 2026-11-22: no
  panel-wide divider lines): the page title as a breadcrumb
  (section › page; a record adds its collection, and its name
  is the h1 above the strips), then secondary actions, at most one primary
  action, Search ⌘K and Ask agent at the right edge. The section is the nav
  group holding the current row, Agent, or Workspace; below 900 only the
  page shows.
- **Tab strip** (owner, 2026-11-22), 40 high: folder tabs on a `rule`
  baseline that runs only between the page paddings; the current tab is
  framed in `rule` on three sides with a 6 radius on top and opens onto
  the content below. It is the only horizontal line a page draws.
- **Body.** 24 side padding (16 below 760px), 24 below; the title, tab
  strip, toolbar and content sit 12 apart, the same gap as a table's
  toolbar above its table (owner, 2026-11-22): status line,
  then the metric strip, then sections 24 apart with no rule between them;
  a section's head sits 12 above its body. Links carry no underline at rest,
  only on hover and focus. Narrow pages centre the body in their column (AR-9; 1040:
  Overview, Projects, Issues, Actions, page detail, Agent, Settings, Agent
  context; 720: Billing, Pricing, Runs).
- **Toolbar**, above the content it scopes: segmented control, search, filter
  buttons, then right-aligned the muted count and one action, 8 apart. A
  page-wide toolbar is the strip under the tabs, with no rule.
- **Metric strip:** one `rule`-framed strip, radius 8, cells divided by
  hairlines, cell padding 10 by 16, 12px label over the value. Never cards;
  no meters, rings or bars inside a cell (AR-3).
- **Table** (the HeroUI table, owner 2026-11-22): a `well` tray, radius 12,
  no edge, 4 padding at the sides and foot; head 36 on the tray, 12px at
  500, a 16-high `rule` tick between columns; the body a `panel` card,
  radius 8, cells padded 16; rows
  44, one line each, hairline dividers, `state-hover` fill; secondary text
  inline after the primary in `ink-2`; numbers right-aligned in tabular
  figures; foot 40 with the count and an icon pager. The first column takes the spare width,
  the others hug their content (AR-4).
- **Settings layout** (Settings, Agent context, Billing, Pricing): the
  route's column holds a stack of groups 32 apart, with no rule between
  them. Settings and Agent context list their sections in a sticky 192 rail
  of sidebar rows on the column's left (`TabRail`), never a tab strip; the
  current section sits 24 beside it, at most 720 wide (Business map takes
  the rest of the column), so the header and rail never move (AR-9). A
  section stacks its groups the same way. A
  group (`SettingsGroup`) is a heading (16/24 at 500, a status 8 after it), an
  optional one-line 12px `ink-2` caption 4 below, the group's one action
  right-aligned on the heading's line (secondary), then 12 below its body.
  The body is one `rule`-framed list (`SettingRows`: radius 8, `panel`) of
  setting rows with a hairline between them; or, for a list of things
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
  cards are the layout's only cards: one row of equal cards (one per line
  when they do not fit), prices in tabular figures, the current plan marked by a 2px
  accent rule along its top and the words "Current plan". A model's
  suggestion keeps the dashed draft edge.

## Components

One entry per family; wave 2 fills each from the layouts above.

- **Tables.** Geometry as in Standard layouts. A page declares each
  column's kind and width role, never a pixel width; `DataTable` turns them
  into one scoped rule set (`columnRules`): `flex` columns share the spare
  width and cut their text, every other role hugs its content above a small
  floor, so no gap opens between columns. When the floors do not fit, `low`
  columns hide, the last first; below that the table scrolls with the first
  column pinned. Every row is one line; secondary text follows the primary
  inline (`TableCellLines`). The foot band sits inside the frame.
- **Metric strip** (`FigureStrip`). Cells share a row equally and wrap into
  rows of equal cells; each cell draws its dividers on its start and top
  edge and the frame clips the outer ones, so a wrapped strip never doubles
  a line. A score is a printed figure.
- **Containers.** One section head (16/24 at 500, actions right, body 12
  below) and one framed surface (`SLIP_FACE`: `rule` edge, radius 8,
  `panel`). A framed thing inside a container drops its own edge. Inside the
  panel every framed surface (tables, strips, setting rows, cards, charts)
  is `panel` in both themes (a table is a `panel` body on its `well` tray),
  and so are the controls on it in light; only hover and selected fills, insets for quoted or raw material, and overlays take another fill.
- **Lists and rows.** A list row matches a table row: 40 high, hairlines
  between rows, `state-hover` when it opens something.
- **Overlays** (dialogs, drawers, command palette). `panel` with a `rule`
  edge at radius 12 and the sheet shadow; header and body padded 24, the
  footer 12 by 24 under a hairline.
- **States.** Loading draws the final geometry (a table its head over block
  rows, a strip its cells). Empty and error sit quietly inside the frame of
  the content they replace. A notice is a line of text with no frame
  (owner, 2026-11-21): the tone's 6px dot and the tone's word for screen
  readers, never a fill.
- **Charts.** Your series is the accent, drawn last; a missing period is a
  gap, never a zero. Series colours come from one map by identity
  (`SERIES_STROKE`, `SERIES_FILL`); position-coloured charts map onto it.
- **Buttons** ([`button.tsx`](../frontend/components/ui/button.tsx)). 28,
  radius 6, flat; 14px icons in `ink-2` on a secondary. Secondary: `raised`
  with a `rule` edge, `raised-2` on hover, press or open. Quiet: transparent,
  `state-hover` fill. Primary: `primary` fill (the deep accent),
  white text, at most one per view. Danger: secondary with negative text; filled only to confirm in a
  dialog (`danger-confirm`). One disabled look for every variant. The
  website keeps its layered `.face`.
- **Inputs** ([`input.tsx`](../frontend/components/ui/input.tsx)). 28, `rule`
  edge on `panel`, `control-line` on hover; focused, an accent edge and its
  glow; invalid, a negative edge and a negative glow. 14px leading icon. Checkbox and radio
  take the same edge and a `primary` fill when on; the switch is a `primary`
  track when on, as is a picked calendar day and the setup stepper. Several short values ([`ValuesInput`](../frontend/components/ui/chip-input.tsx))
  are 24-high tokens on `state-selected`, a suggestion dashed with one accept
  tick per field, then the add field; Enter (and a comma in a grid cell) adds,
  Tab leaves. A grid cell drops the edge until focused. A share of a whole
  ([`SplitBar`](../frontend/components/ui/split-bar.tsx)) is a bar of light tints
  of the cool series hues, parted by `panel` gaps as tall as the bar that
  are its sliders, 5% steps, a dot legend in the full hues under it.
- **Selects and menus.** A select or filter trigger is a secondary button's
  face (`TRIGGER_BOX`); a typed combobox is an input. Menus, listboxes and
  tooltips are `raised` with a `rule` edge, radius 8, 28-high rows on
  `state-hover`.
- **Tabs and segmented control** ([`tabs.tsx`](../frontend/components/ui/tabs.tsx)).
  Tabs are folder tabs padded 16, the current one `ink` in a `rule` frame
  open at the bottom, the rest `ink-2`.
  Segmented control: `rule` frame one control high, 2px inset, 24-high
  segments, the selected one on `state-selected`.
- **Tags and status.** Tag: 20 high, radius 4, `rule` edge, 12px `ink-2`; a
  draft is dashed; Kbd and composer chips share the face. Status
  (`StatusMark`): the tone's 6px dot and a 12px word at 500 in `ink`, 20
  high, no frame (owner, 2026-11-21); a live state draws the spinner.
  Priority's bars alone sit in a pill (radius full, `rule` edge).
- **Navigation.** Sidebar rows: 14px icon, label, 8 apart, radius 6, `ink`
  at rest and `state-hover` on hover; a group label folds its rows and a
  folded group still shows the current row. Collapsed (⌘\ or the toggle,
  remembered per browser) the sidebar is a 56 rail of 40 buttons, one per
  group, each opening a flyout; the toggle stays in the foot, straight above
  the account.
