# CiteLadder design

The signed-in app's visual reference: tokens, layouts and one entry per
component family. The app follows the Linear-style look the owner approved
([app redesign](plans/app-redesign.md), AR-1 to AR-11): quiet greys, hairline
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
| `ground`         | `#08090a`                | `#f4f5f7`          | window and sidebar                   |
| `panel`          | `#0f1011`                | `#ffffff`          | the inset content panel              |
| `raised`         | `#151618`                | `#f7f8f9`          | secondary buttons, table head, menus |
| `raised-2`       | `#1c1d20`                | `#eef0f2`          | hover on raised, avatar              |
| `state-hover`    | `rgb(255 255 255 / 4%)`  | `rgb(0 0 0 / 3%)`  | row and quiet-control hover          |
| `state-selected` | `rgb(255 255 255 / 7%)`  | `rgb(0 0 0 / 6%)`  | current nav row, selected segment    |
| `rule`           | `rgb(255 255 255 / 8%)`  | `rgb(0 0 0 / 8%)`  | every hairline (the spec's `line`)   |
| `control-line`   | `rgb(255 255 255 / 12%)` | `rgb(0 0 0 / 12%)` | focused field edge (`line-strong`)   |
| `ink`            | `#f7f8f8`                | `#111214`          | text                                 |
| `ink-2`          | `#8a8f98`                | `#62666d`          | secondary text, icons                |
| `accent`         | `#ff6a33`                | `#e8501a`          | "you, here" only                     |

Older role names bind onto the table so call sites keep working: `chrome` is
`ground`, `surface` is `panel`, `well` is `raised`, `control-edge` and
`chart-grid` are `rule`, `state-pressed` is `state-selected`, `on-ink` is
`panel`. Status colours (`positive`, `negative`, `warning`, `info` and their
`-wash` fills), `accent-text`, `accent-wash` and the data series keep their
values in `globals.css`. A status colour appears only beside a glyph and a
word, never as a large fill. Data: `data-you` is the accent, `data-rival-1`
to `-4` ink then cool hues in rank order, `data-other` the grouped rest.

## Type

Sans (Spline Sans) for words; mono (Geist Mono) for numbers, dates, URLs and
counts. Weights 400 and 500 only, in both themes; emphasis is 500, never
colour. Sizes are rem so they follow the reader's text size.

| Role            | Size / line | Weight                  |
| --------------- | ----------- | ----------------------- |
| body, label     | 14 / 20     | 400, label 500          |
| caption         | 12 / 16     | 400                     |
| heading         | 16 / 24     | 500                     |
| page title      | 14 / 20     | 500, in the page header |
| figure (metric) | 20 / 28     | 500, mono               |

The roles are the closed set in
[`typography.tsx`](../frontend/components/ui/typography.tsx); a call site names
the job, never a size.

## Spacing, size and shape

- **Spacing:** 2, 4, 8, 12, 16, 24, 32, 48 only.
- **Controls:** 28 high; 44 below 900px or under a coarse pointer. Icons 16 in
  `ink-2`. Every target is at least 24×24.
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
the word "You") and here (the current nav item, tab and step, as a 2px mark
with `aria-current` or `aria-selected`), and the live rung. Never an action,
status, link, focus ring or decoration.

**Nothing moves on interaction.** Pagination, tabs, filters, sorting, loading
and empty states keep their footprint; a pending button keeps its width.

**One loading state per page load.** `FirstFrame` (and `index.html`'s boot
frame) owns what is drawn first: a shell route draws the shell and its
skeleton, a flow route its plain ground. Data on screen stays while it
refreshes.

**Accessibility.** WCAG AA in both themes; meaning never by colour alone; one
2px `focus` ring, never removed; all motion stops under
`prefers-reduced-motion`.

## Standard layouts

Pages are placed into these layouts, never arranged by hand (AR-10).

- **Shell.** Sidebar 224 on `ground`, 8 padding: header row (workspace
  switcher, settings icon, collapse toggle), the Dashboard | Agent segmented
  control, 28-high nav rows (current row on `state-selected` with a 2px accent
  mark), 12px group labels, foot with Integrations and the account. The main
  column is the inset panel: 8 from the window edges (none on the sidebar
  side), `rule` edge, radius 8, `panel` fill, scrolling inside itself.
- **Page header**, 44 high with a `rule`: the page title as a breadcrumb
  (section icon, section › page), then secondary actions, at most one primary
  action, Search ⌘K and Ask agent at the right edge.
- **Tab strip**, 36 high with a `rule`; tabs 20 apart, the current one
  underlined in accent.
- **Body.** 24 side padding (16 below 760px), 20 above, 24 below: status line,
  then the metric strip, then sections 24 apart; a section's head sits 12
  above its body. Narrow pages centre the body in their column (1040:
  Overview, Projects, Issues, Actions, page detail, Agent, Billing; 720:
  Settings, Runs, Agent context); the header and tab rules still span the
  panel.
- **Toolbar**, above the content it scopes: segmented control, search, filter
  buttons, then right-aligned the muted count and one action, 8 apart.
- **Metric strip:** one `rule`-framed strip, radius 8, cells divided by
  hairlines, cell padding 10 by 16, 12px label over the value. Never cards;
  no meters, rings or bars inside a cell (AR-3).
- **Table:** `rule` frame, radius 8; head 32 on `raised`, 12px at 500; rows
  40, one line each, hairline dividers, `state-hover` fill; secondary text
  inline after the primary in `ink-2`; numbers right-aligned in mono; foot 40
  with the count and an icon pager. The first column takes the spare width,
  the others hug their content (AR-4).
- **Settings layout** (Settings, Agent context, Billing): specified in wave 3.

## Components

One entry per family; wave 2 fills each from the layouts above.

- **Buttons.** 28, radius 6. Secondary: `raised` with a `rule` edge. Quiet:
  transparent, `state-hover` fill. Primary: `ink` fill, `panel`-coloured
  text, at most one per view. Danger: secondary with negative text.
- **Inputs.** 28, `rule` edge on `panel`, `control-line` edge plus the focus
  ring when focused, 16px leading icon.
- **Segmented control.** `rule` frame, 2px inset, 24-high segments, the
  selected one on `state-selected`.
- **Tags and status.** Tag: 20 high, radius 4, `rule` edge, 12px `ink-2`.
  Status pill: radius full, 6px coloured dot, 12px at 500.
- **Navigation.** To be specified in wave 2.
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
  `panel`). A framed thing inside a container drops its own edge.
- **Lists and rows.** A list row matches a table row: 40 high, hairlines
  between rows, `state-hover` when it opens something.
- **Overlays** (dialogs, drawers, command palette). `panel` with a `rule`
  edge at radius 12 and the sheet shadow; header and body padded 24, the
  footer 12 by 24 under a hairline.
- **States.** Loading draws the final geometry (a table its head over block
  rows, a strip its cells). Empty and error sit quietly inside the frame of
  the content they replace. A notice is a `rule`-edged strip with the
  tone's 6px dot and the tone's word for screen readers, never a fill.
- **Charts.** Your series is the accent, drawn last; a missing period is a
  gap, never a zero. Series colours come from one map by identity
  (`SERIES_STROKE`, `SERIES_FILL`); position-coloured charts map onto it.
