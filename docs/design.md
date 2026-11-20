---
version: alpha
name: CiteLadder
description: >-
  Paper and ink with one mark. A compact, technical product app and an
  editorial website on one token file, in light and dark.
---

# CiteLadder Design System

The design system's reference, in the [DESIGN.md](https://github.com/google-labs-code/design.md)
format: tokens, then the rules for using them. It states what holds today. The
token blocks are generated from the product's CSS
(`node frontend/scripts/audit-design-tokens.mjs --write`) and checked by
`pnpm check:policy`; never edit them by hand.

**Two surfaces, one token file.** [`globals.css`](../frontend/apps/app/src/globals.css)
serves the app, the website and the docs. The generated blocks list the
system's values, which the website and docs render. The app binds its own
values in `:root:not([data-public-surface])` and its dark twin, so the app
rules below hold only there. On the app, the website's role names (`paper`,
`line`, `ink-secondary`, the `-soft` fills) alias the app's roles
so a shared rule still renders in the app's palette, but app code never uses
them, never imports a website-only atom, and a change to a shared atom leaves
`components/marketing` and `components/content` as they were. The policy
checks in `frontend/scripts/design-system-*.mjs` enforce the first two.

## Overview

CiteLadder looks like a working paper that measures itself: how a thing is
drawn says how far to trust it, the ladder is the unit of progress, and the
one colour marks you.

- **The app** is compact and even, tuned for a 982×800 window. Every route
  uses one template from `components/templates/`, so a person learns one
  anatomy and nothing varies by page except the content.
- **The website and docs** are editorial: large display headings, generous
  reading measure, depth from pictures rather than from boxes and shadows.
- **Both** follow the reader's system theme (light or dark) and meet WCAG
  AA. Meaning is never carried by colour alone, and all motion stops under
  `prefers-reduced-motion`.

**The line language (app).** How a thing is drawn is a finding, so these
are contracts, never decoration:

- **Solid** is observed: a persisted measurement or a decision a person made.
- **Dashed** (`edge-draft`, the `draft` Tag, DraftSheet) is drafted: written
  by a model and not yet accepted. Accepting it sets the ink: the dashed edge
  turns solid over 200ms.
- **Absent** is the Absence dash `—` in `ink-2`; a chart's gap is a `well` band.
- **No line** is not applicable.
- A real zero is a printed `0` in full ink: a measurement, never greyed.

**The accent means "you, here".** It marks _you_ (your brand: your row, your
series, the word "You") and _here_ (the current navigation item, tab and
step, as a 2px `--mark-width` accent mark with `aria-current` or
`aria-selected`), and the live rung. It is never an action, a status, a
priority, a link, the focus ring or decoration; a screen with no "you" and no
"here" in view shows no accent.

## Colors

<!-- generated:tokens:start -->

```yaml
colors:
  accent: '#e8501a' # dark '#ff6a33'
  accent-ink: '#b53a0c' # dark '#ff9466'
  accent-soft: '#ffe6da' # dark '#3b1a0c'
  accent-text: '#b53a0c' # dark '#ff9466'
  accent-wash: '#ffe6da' # dark '#3b1a0c'
  brand-google-blue: '#4285f4' # dark '#4285f4'
  brand-google-green: '#34a853' # dark '#34a853'
  brand-google-red: '#ea4335' # dark '#ea4335'
  brand-google-yellow: '#fbbc05' # dark '#fbbc05'
  button-edge: '#d8d5ce' # dark '#343230'
  button-from: '#ffffff' # dark '#282725'
  button-to: '#f0eee8' # dark '#211f1e'
  chart-grid: '#ececec' # dark '#262626'
  chrome: '#f4f4f4' # dark '#0a0a0a'
  control-edge: '#e5e5e5' # dark '#2a2a2a'
  control-fill: '#ffffff' # dark '#151515'
  control-line: '#858585' # dark '#747474'
  data-other: '#c2c2c2' # dark '#4a4a4a'
  data-rival-1: '#111111' # dark '#f4f4f4'
  data-rival-2: '#2f6f9f' # dark '#2f6f9f'
  data-rival-3: '#4b3a8a' # dark '#4b3a8a'
  data-rival-4: '#1f7d73' # dark '#1f7d73'
  data-you: '#e8501a' # dark '#ff6a33'
  focus: '#111111' # dark '#f4f4f4'
  ground: '#f4f4f4' # dark '#0a0a0a'
  info: '#1f5fbf' # dark '#7fb0ff'
  info-soft: '#e3edfc' # dark '#14243d'
  info-wash: '#e3edfc' # dark '#14243d'
  ink: '#111111' # dark '#f4f4f4'
  ink-2: '#525252' # dark '#a6a6a6'
  ink-hover: '#2a2a2a' # dark '#d6d6d6'
  ink-muted: '#525252' # dark '#a6a6a6'
  ink-secondary: '#525252' # dark '#a6a6a6'
  line: '#e5e5e5' # dark '#2a2a2a'
  line-control: '#858585' # dark '#747474'
  line-strong: '#d4d4d4' # dark '#3a3a3a'
  negative: '#c4122f' # dark '#ff7387'
  negative-soft: '#ffe2e6' # dark '#3d0e16'
  negative-wash: '#ffe2e6' # dark '#3d0e16'
  on-ink: '#ffffff' # dark '#111111'
  on-primary: '#ffffff' # dark '#ffffff'
  paper: '#f4f4f4' # dark '#0a0a0a'
  positive: '#0b6e69' # dark '#4fd1c5'
  positive-soft: '#d6f2ef' # dark '#0e2e2b'
  positive-wash: '#d6f2ef' # dark '#0e2e2b'
  primary-edge: '#822300' # dark '#812500'
  primary-from: '#c03d0b' # dark '#be3f01'
  primary-to: '#a53204' # dark '#a43300'
  raised: '#ffffff' # dark '#151515'
  rule: '#e5e5e5' # dark '#2a2a2a'
  scrim: 'rgb(17 17 17 / 32%)' # dark 'rgb(0 0 0 / 64%)'
  stage-lilac: '#dfd6f7' # dark '#231b3d'
  stage-mint: '#cdeedf' # dark '#0f2a26'
  stage-peach: '#fcdac6' # dark '#2f1b22'
  stage-sky: '#d2e2f8' # dark '#13223d'
  state-hover: 'rgb(17 17 17 / 6%)' # dark 'rgb(244 244 244 / 6%)'
  state-pressed: 'rgb(17 17 17 / 8%)' # dark 'rgb(244 244 244 / 8%)'
  state-selected: 'rgb(17 17 17 / 10%)' # dark 'rgb(244 244 244 / 10%)'
  surface: '#ffffff' # dark '#151515'
  surface-sunken: '#ececec' # dark '#1e1e1e'
  thumb: '#ffffff' # dark '#151515'
  warning: '#8a5000' # dark '#f5b84a'
  warning-soft: '#fff0d1' # dark '#3a2a0a'
  warning-wash: '#fff0d1' # dark '#3a2a0a'
  well: '#ececec' # dark '#1e1e1e'
```

<!-- generated:tokens:end -->

- **App roles.** Fills: `ground` (the page; in the shell, one colour with
  `surface`), `chrome` (the sidebar, a step lighter than the ground),
  `surface` (slips, fields), `raised` (sheets), `well` (sunken material, a chart's gap band,
  the selected state) and `control-fill` (search fields, operable tags).
  Lines: `rule` (dividers between rows
  inside a surface and on chrome edges), `control-edge` (the soft edge of a
  labelled control or clickable card), `control-line` (a quiet grey: text fields,
  checkboxes, radios, dashed draft edges). Text: `ink` for what is read first
  (and an inverted tile's fill, labelled `on-ink`), `ink-2` for what
  supports it; there is no third grey. Dark is designed, not inverted:
  the ground is the owner's warm near-black `#131211` in the app and on the
  website (owner, 2026-11-20; the docs keep theirs), with neutral greys
  above it (values in `globals.css`), each layer at least 1.05 lighter than
  the one beneath.
  The shell keeps our structure: the chrome is lighter than the ground,
  never a darker frame around an inset page. In the shell, cards, table bodies
  and control fills take the page's ground in both themes (owner, 2026-11-19);
  overlays keep their lighter fills.
- **States are ink overlays:** hover `state-hover`, pressed `state-pressed`
  (light 6% and 10%, dark 4% and 8%); selected is the `well` tint plus a
  mark that is not colour (the checked control, a check glyph).
- **Status:** `positive`, `negative` (crimson, far from the accent's hue),
  `warning` (ochre) and `info`, each with a `-wash`. They appear only in a
  StatusMark, a Delta, a Notice or a validation message, always beside a glyph
  and a word, and never as a large fill.
- **Data:** `data-you` is the accent; `data-rival-1` to `-4` are ink then
  cool hues, in rank order (never orange, red, amber or green); `data-other`
  is the grouped rest.
- **Contrast is checked, not assumed.**
  [`design-system-contrast.mjs`](../frontend/scripts/design-system-contrast.mjs)
  holds text at 4.5:1 on every fill and under the hover and pressed tints,
  marks, boundaries and series at 3:1, and you and the rivals apart without
  full colour vision, in the website's and the app's palettes, both themes.
- **Website and docs:** `paper` is the ground, `surface` the container,
  `surface-sunken` the inset; `line`, `line-strong` and `line-control`
  the edges. Charts use the app's series roles (`data-you`, `data-rival-*`).
  The `stage-*` tints are for editorial illustrations only, never a page
  fill, panel or card.

## Typography

<!-- generated:type:start -->

```yaml
typography:
  type-body: { fontSize: 14px, lineHeight: 20px }
  type-caption: { fontSize: 12px, lineHeight: 16px }
  type-control: { fontSize: 14px, lineHeight: 20px }
  type-data-sm: { fontSize: 12px, lineHeight: 16px }
  type-display: { fontSize: 28px, lineHeight: 36px }
  type-eyebrow: { fontSize: 12px, lineHeight: 16px }
  type-figure: { fontSize: 24px, lineHeight: 32px }
  type-figure-xl: { fontSize: 40px, lineHeight: 44px }
  type-heading: { fontSize: 16px, lineHeight: 24px }
  type-label: { fontSize: 14px, lineHeight: 20px }
  type-page-title: { fontSize: 20px, lineHeight: 28px }
  type-prose: { fontSize: 16px, lineHeight: 26px }
  type-screen-label: { fontSize: 12px, lineHeight: 16px }
  type-subheading: { fontSize: 14px, lineHeight: 20px }
  type-title: { fontSize: 22px, lineHeight: 28px }
  cl-body: { fontSize: 16px, lineHeight: 26px }
  cl-fcard-title: { fontSize: 20px, lineHeight: 24px }
  cl-lead: { fontSize: 18px, lineHeight: 30px }
  cl-lhero-title: { fontSize: 48px, lineHeight: 52px }
  cl-note: { fontSize: 14px, lineHeight: 20px }
  cl-phero-title: { fontSize: 48px, lineHeight: 52px }
  cl-shead-title: { fontSize: 32px, lineHeight: 40px }
```

<!-- generated:type:end -->

- **Mono is measured, sans is said, display names places.** The mono face
  sets what the system measured or recorded: numbers, dates, URLs, ids,
  counts, changes, column heads, absence words; never a sentence. The sans
  face sets labels, prose and descriptions. In the app the display face sets
  only page, dialog and flow titles (`title`, `display`); on the website it
  sets headings from 32px at 400.
- **The app's roles** are the closed set in
  [`typography.tsx`](../frontend/components/ui/typography.tsx) (`textRole`),
  with their recipes in `globals.css`; a call site names the job, never a
  size. The app binds `title` to 20/28 at 400 and every metric `figure` to
  20/28, not the block's website values. The website's `type-page-title`, `-control`, `-eyebrow` and
  `-delta` are website-only.
- **App sizes:** 12, 13, 14, 16, 20, 24, 28 and 40 only, each with one line
  height; 12 is the floor. Weights 400 and 500, never 600 (350 and 450 in
  the app's dark, where light text reads heavier). Emphasis inside text is
  500, never colour. At most one `figure-xl` per page.
- **Website sizes:** 12 · 14 · 16 · 18 · 20 · 24 · 32 · 48, plus the home
  title's 60 (owner, 2026-11-19), normally no more than three on a page,
  nothing heavier than 500. Phones step headings down the same scale (title
  32, section 24, feature 20); a stat is 24. Prose holds to 65ch.
- **Sizes are rem.** Type tokens are declared in rem (the px here ÷ 16), so
  they follow the reader's text size; spacing stays px, and controls take
  their height as a minimum so larger text grows them.

## Layout

<!-- generated:controls:start -->

```yaml
spacing:
  container-site: 1320px
  container-app: 1440px
  container-answer: 1080px
  container-thread: 1040px
  container-prose: 720px
  container-narrow: 560px
  container-form: 640px
  container-flow: 480px
  control-sm: 28px
  control-md: 32px
  control-lg: 48px
  control-coarse: 32px
  nav-height: 64px
  sidebar-width: 248px
  table-row-height: 44px
  table-header-height: 32px
```

<!-- generated:controls:end -->

The block lists the system's values. The app binds its own: controls 28
(`control-md`, owner 2026-11-19) and 44 (`control-lg`, flow pages); below 900px or under a
coarse pointer every primary target is 44. Table rows are 44 (56 for a value
over its caption).
Tags are 24 and live in running content (cells, facts, sheets), never in a
row of controls. Navigation rows are 32 (44 in the drawer): links, not controls.

The app's spacing is one scale (2, 4, 8, 12, 16, 24, 32, 48, 64) used as
roles, so a page passes a role and never a number:

| Value | Between                                                                     |
| ----- | --------------------------------------------------------------------------- |
| 4     | an icon and its label, a label and its control, a field and its help        |
| 8     | controls that act together (`compact-gap`)                                  |
| 12    | control and cell padding across                                             |
| 16    | inside a slip, sheet or figure cell; form rows; a section head and its body |
| 24    | flow, setup and auth gutters from 900px; the chrome and the content         |
| 32    | the main column's gutter from 900px (16 below); sections and their rule     |
| 48    | blocks on a flow page                                                       |

The space inside a group is at most half the space to the next group. The
rhythm belongs to Section, the template and the grid: a page never sets a
vertical gap.

**Page anatomy**, identical on every shell page. The top strips are the same
height on every page and each closes on a hairline across the whole main
column, a narrow page's included: rules span the width, only content is
inset (owner, 2026-11-18). The tab and filter strips stick under the
masthead on `ground`, rules included (owner, 2026-11-19). `PageFrame` draws
them; a page sets none.

1. **Masthead** (48, sticky), as wide as the main column on every page: the
   menu button below 900px, the back link on a record and the page title,
   starting on the page column's left edge; then the page's secondary
   actions and at most one primary action, then search (Ctrl K) and Ask
   agent at the column's right edge, the same x on every page and page width
   (owner, 2026-11-19). Filters and search fields never sit in it.
2. **Tab strip** (optional): as high as the filter strip (owner,
   2026-11-18), the tabs filling it with their labels centred, so the
   current tab's underline sits on the strip's rule. Tabs come before
   filters because a tab changes the filters and the strip above it must
   not change (owner, 2026-11-18).
3. **Filter strip** (optional, the first strip on a page without tabs): 8
   around 28 controls (44 high, owner 2026-11-19), 8 apart, on one line:
   search, filter chips, **Filters** and the chips of what is set in it,
   Clear, then at the end the muted meta (the data window, "Latest run · 18
   Nov 09:12" in the one short form, the count or a live note), cut before
   the strip wraps, and one action. A view switch (Prompts' Active |
   Archived) leads the same line and the rest sits right-aligned after it
   (owner, 2026-11-19). Controls that do not fit wrap as whole units; below
   900px the search takes the first line and the rest flow after it.
4. **Sections**, 16 below the strips, a `rule` between neighbouring page
   sections with 32 on each side (owner, 2026-11-18): one across the main
   column between stacked sections, one down each column gap of a grid's
   row of sections, never a second. Only a `Section` or a grid of them on
   the page counts; lists grouped inside a page (Actions' status groups)
   and sections inside a section or card draw none. A FigureStrip on the
   page itself is full-bleed like the strips, its first text on the content
   edge.

The sidebar's Dashboard | Agent row under its 48 switcher cell is one strip
high, the switch centred, so its rule continues the page's first strip's
rule on one line on every page.

Order is by likelihood of use: the most likely action comes first, left to
right and top to bottom. A control sits in the row of the thing it acts on:
the filter bar when it scopes the page, a table's toolbar when it scopes one
table, a section's head when it changes how that section draws.

**Width.** Content fills the main column inside its gutter, so collapsing the
sidebar grows it, except on reading pages: Overview, the Agent chat, Billing,
Issues, Actions and Skills sit in the centred `container-thread` column the Agent
thread uses, so their side space matches the chat's (owner, 2026-11-16), and
Settings and Context, pages of rows, in the narrower `container-prose`
(owner, 2026-11-19). Only the masthead's title follows the column; its search
and Ask agent stay at the main column's edge. A route opts in with
`width: 'narrow'` or `'compact'` in
[`app-routes.ts`](../frontend/lib/navigation/app-routes.ts) and `PageFrame`
applies it; a workbench (a chat's page document) still fills the column.
Reading columns, forms and flows take `container-prose`, `container-form` and
`container-flow`. The template, not the page, picks.
No page scrolls sideways down to 320px: a wide table scrolls inside its own
frame with its first column pinned.

**Breakpoints.** From `rail:` (900px) the sidebar is a labelled column the
reader may drag or collapse to a rail
([`lib/sidebar-width.ts`](../frontend/lib/sidebar-width.ts)). Below 900px
the sidebar is a left drawer behind the masthead's menu button. A
component's internals stop stacking at `desktop:` (981px). In the main column
grids measure the column instead of the viewport (`column-split`,
`column-wide`), so a wider sidebar stacks them.

**Nothing moves on interaction.** Pagination, tabs, filters, sorting, loading
and empty states keep their footprint: a table with views (`reserveRows`) keeps
its tallest view's height (plain space, never blank rows) and its pager in
every view and state, except Issues, which ends at its last row (owner,
2026-11-19: no empty space under a short view), a section that appears after a read or a condition
reserves its settled height from the first frame, a count holds its widest
value's width, and a pending button keeps its width. A press may scale a
control in place; it never moves its neighbours. A page the window scrolls
ends in `--page-end-space` (a third of the viewport), so content shrinking near the bottom never pulls the scroll.

**One loading state per page load.** What is drawn before a page has one owner
(`FirstFrame`, from the route manifest's `shell` flag; `index.html`'s boot
frame makes the same choice). A shell route draws the shell and its page's
skeleton; a flow route outside the shell (sign-in, sign-up, setup, the
workspace chooser, an invitation) keeps its plain ground, with no sidebar,
masthead or loading card, until its own card arrives. Each wait hands over
once and never remounts a loader; a frame drawn for a screen that never comes
reads as a flicker (#524, #551). A workspace gate still answering holds the
content slot, so a workspace switch keeps the shell mounted. Data already on
screen stays rendered while it refreshes.

## Elevation & Depth

- **Content sits on the surface; boxes are earned (owner, 2026-11-18).** In
  the signed-in shell the page is one surface: the ground and `surface` are
  one colour in both themes. The page header and the filter row each close
  on a hairline; the lede is text; sections are a heading, a one-line
  description and their content straight on the surface, with no box or
  padding box around them; a `rule` divides neighbouring sections (Page
  anatomy). An empty state, a figure row and an explainer are never boxed.
- **What keeps a container.** Every table, in a container or not, is a
  **Table shell** (owner, 2026-11-19, after HeroUI's table): a `well` shell
  at `rounded-overlay` holds the column names, unruled, and the rows sit on an
  inset `surface` panel at `rounded-card`, 4 in from the shell's sides and
  foot; its title, tabs, filters and actions sit on the surface above it. A
  **Frame** (a `rule` edge at `rounded-card`, no fill, no shadow) holds a
  plotted chart (its key inside) or a box of rows; Overview widgets are page
  sections, unboxed (owner, 2026-11-19). A **Slip** (`surface`, a `rule` edge,
  `rounded-card`, `shadow-card`) is one object you can act on: a clickable
  card (`IconCard`, which takes the `control-edge`), a plan or add-on with its
  buttons. A **Well** (`well`, radius 6) holds quoted or raw material. A
  **Sheet** (`raised`, a hairline, radius 8 or 12, `shadow-pop` or
  `shadow-sheet`) is anything that floats: dialogs, drawers, popovers, menus;
  a modal sheet also sits on the `scrim`. The Agent composer keeps its card.
  A `framed` Section is the opt-in frame for any other block that earns one.
- **Boxes are at most two deep** and a slip never holds a slip; inside a
  container a chart draws no second frame. To separate a group, use
  space and a heading; never wrap a section in a box.
- **Every sheet keeps two separation cues in each theme:** the hairline and
  the shadow in light, the lighter `raised` fill and the hairline in dark.
- **The website and docs are flat.** Panels are one flat neutral fill
  with no border or shadow; a product image's screen is edged by a `line`
  hairline ring. Buttons take the layered face below but no press nudge.

## Shapes

<!-- generated:radii:start -->

```yaml
rounded:
  2xs: 2px
  xs: 2px
  mark: 2px
  sm: 4px
  md: 6px
  control: 6px
  lg: 8px
  card: 8px
  overlay: 12px
  full: 9999px
```

<!-- generated:radii:end -->

- **The app's radii:** `rounded-mark` 2 (tags, checkboxes, rung marks),
  `rounded-control` 6 (controls, fields, slips, wells), `rounded-card` 8
  (cards, tables and small overlays), `rounded-overlay` 12 (dialogs,
  drawers, the command palette, flow cards) and `rounded-full` (avatars,
  switch tracks, dots). The `2xs` to `lg` names are the website's.
- **The website** keeps 2 to 8 for controls and chips; its surfaces are 4 for
  an inner card or popup, 12 for a card and 16 for a product-image panel.

## Components

Atoms have one form, defined once and composed everywhere; a page never sets
its own spacing, size or radius on them.

- **Buttons:** a look follows the kind of action, never the page. Primary
  (accent fill) is the one action a view exists for, and lives only in the
  masthead's primary slot or last in a sheet or form footer. Every other
  action is secondary (white, near-black in dark, `control-edge`), quiet (no
  edge), danger, or a link. Controls in one row share one height. Website
  calls to action are these same buttons (owner, 2026-11-19): rounded,
  sentence case, the sans face, no trailing glyph but an external link's
  arrow, one 44 height on a page and in the phone sheet.
- **The layered face** (owner, 2026-11-20: "just to have a subtle 3d
  effect"): every primary, secondary and danger button, filter and select
  trigger, and the selected segment of a switch, in the app, website, login
  and onboarding, takes a faint top-to-bottom gradient, a soft low shadow and
  a barely-there lit top edge (`.face` in `globals.css`: shared `--face-*` properties, one rule per state, and `shadow-button`).
  No heavy bevel. App borders stay as they were; on the website a secondary
  takes the soft `button-edge` hairline and the primary a `primary-edge` a step
  darker than its fill (owner, 2026-11-20). The primary fill is the accent
  deepened (`primary-from`, `primary-to`) so white text holds 4.5:1 at its
  lightest point, hover included; the accent itself is unchanged. Hover
  lifts the primary a touch lighter and tints the others; a press drops the
  shadow and darkens; disabled is flat. Danger keeps the flat top colour
  with the same depth: its crimson label fails 4.5:1 on the gradient's foot
  under the hover and press tints. The owner's reference images are the
  spec for the website (gradient, edge, lit top edge, low shadow). Quiet buttons (icon-only ones
  included), links, read-only status chips and badges stay flat.
- **Website touch targets** (owner, 2026-11-19): under a coarse pointer
  every website control is a 44 target (shared buttons through
  `control-coarse`, small icons and text links by a hit area, their drawn
  size kept); everywhere, every link and button is at least 24 tall.
  Hover effects sit under `(hover: hover) and (pointer: fine)`.
- **Fields** (input, textarea): `surface`, a 1px `control-line` edge, label
  above and help below; search and select fields take `control-fill` and
  `control-edge`. No edge in the app is ever near-white or near-black: every
  line is a quiet grey. Focused, an app field keeps its own edge and takes a
  soft blurred `ink-2` glow over it, never a second ring. Invalid, its edge
  is `negative` and the error sentence below carries a glyph and is linked by
  `aria-describedby`; focus keeps that crimson edge. Website fields instead
  thicken their edge to a 2px `focus` line in a 3px halo.
- **Tag** (24, radius 4): a solid `control-edge` means you can operate
  it (a record link, a removable filter); a static tag has a `well` fill and
  no edge; a draft tag is dashed.
- **StatusMark** is the only way to show a status, priority or severity: a
  glyph and a word, with an optional tone.
- **Tabs** are text with no hairline of their own; the current one carries
  the accent mark, and a page tab strip's rule is its band's (owner,
  2026-11-19). A **segmented switch** (a view, a range) has no underline: its
  segments sit on a `well` track and the current one is a `surface` pill
  (owner, 2026-11-19) at the same weight, so switching never changes its width. A count follows the label in brackets, in the mono face:
  "All signals (107)".
- **Setting rows** (`SettingRows`, owner 2026-11-19, after a reference
  account page): Settings and Context are rows divided by `rule` lines, the
  name and a muted line at the left, the value in `ink-2` or the control at
  the right; a form field's control takes one 320 column there, and long
  text (a description, a list) goes under its name across the row.
- **Filter chips** (owner, 2026-11-18): a chip is sized to its value and
  prints the value only; the filter's name is its tooltip and its menu's
  heading, the menu marks the default option and offers "Reset to …" once
  set. Its width follows its value, so the row is left-aligned and nothing
  else moves. The five frequent filters (period or measurement, engines,
  market, branded prompts, topic) are icon chips, icon only at their
  default; a row shows at most four, in the page's order
  (`components/ui/filter-bar.tsx`). The rest share **Filters**: a count of
  those set, a list of name and value with a submenu each, and each set one
  after the button as a removable value chip; a lone other filter is its own
  chip unless the page's placement puts it in Filters. A page fixes which
  filters sit in the row and which in Filters, so setting, pooling or hiding
  one never recomposes the row. **Clear** appears once anything is set. While the period chip shows
  only its icon, the data window is the row's end text.
- **Tables** (DataTable): a column is declared once with its kind, which sets
  the head's and the cells' alignment, face, format and truncation together.
  Heads are `caption-strong` in sentence case, numerals tabular and
  right-aligned, rows sit on hairlines
  and tint on hover only when pressing them does something. Your row carries
  the accent mark.
- **FigureStrip:** key figures as one flat row on the surface, never cards
  (owner 2026-11-18): hairlines above and below, thin dividers between equal
  cells, columns from the count, each cell a muted label with its hint over
  the value and its inline delta, values on one baseline.
- **Progress:** RungMeter for a 0 to 100 score or a quota, RungTrail for
  steps. A score may also be a ScoreRing, a part of a whole a PartDonut, and a
  level a bar Meter, where the app draws them today; no other rings, donuts
  or progress bars.
- **The live rung** (Spinner) is the only "working" mark: one rung pulsing
  its opacity, shown only after 300ms and held still under reduced motion.
  No arcs or a lone spinner on an empty page. A loading placeholder is
  block-shaped, and one soft band of light sweeps across its blocks; under
  reduced motion the blocks stay still.
- **Notice** is the one inline message (glyph, sentence, optional action);
  **StateBlock** holds a read's loading, empty and error states in one
  footprint, names the failed subject with one Retry, and appears once per
  region.
- **Links** in a list, table or card underline on hover and focus; a link
  inside a sentence keeps its underline.
- **Charts** in the app are Recharts in HeroUI's chart style (owner,
  2026-11-19; `chart-tooltip.tsx` holds the shared look): monotone areas with a
  gradient fill, a faint dashed horizontal grid, no axis or tick lines, round
  y steps, a tooltip card on hover and the arrow keys, donuts with rounded,
  gapped segments. The website keeps its stepped charts. Your series is the
  accent and drawn last. A missing period is a gap under a `well` band, never
  a zero and never interpolated. Charts carry a written description and a
  table for assistive tech.
- **Focus** is one ring on every interactive element but an app field (which
  glows, above), in both themes: 2px solid `focus` (ink), 2px out. Never removed, never the
  accent. After a pointer press only text fields keep it
  (`input-modality.ts`); inside a clipped row it is drawn 2px in.
- **Targets** are at least 24×24 everywhere.

**Data states.** Use the state actually known; never a fabricated zero. An
observed zero is a Value: `0` in full ink. The kinds of absence and their
words have one owner, `availabilityLabels` in `lib/format.ts`:

| Word               | Meaning                                        |
| ------------------ | ---------------------------------------------- |
| **Not measured**   | No measurement exists                          |
| **Not run yet**    | The workflow has not started                   |
| **Not set**        | A user-configurable fact is missing            |
| **Not connected**  | The source that would supply it is not set up  |
| **Unavailable**    | The evidence or provider cannot supply a value |
| **Not applicable** | The field does not apply                       |
| **Too few**        | Below the minimum a reading needs              |
| **None**           | Observed, and there is nothing to list         |

**Value** prints every measured value, and **Absence** every missing one, in
the same line box. Any absent value in a value position (table cell, figure,
badge, meter, chart key) is one muted em dash `—` in `ink-2`, whatever its
kind. The word, or a more specific reason, is its tooltip and accessible
name, so the kinds stay distinct for anyone who asks (owner 2026-11-18). The
reason: a word repeated at every missing figure crowds out the real figures
and reads as noise (#112). Words stay only for states the reader can act on
("Not connected" beside its Connect action, "Disabled", "Beyond the plan
limit", "Not included") and for sentence-level empty states, which say it in
plain words. Excluded is a tag with the word struck through. A stale value is
`ink-2` with its "as of" date; a conflicting one carries a `≠` in the warning
tone. A state shared by a section or column is said once, on its header.

## Do's and Don'ts

- **Do** add what a page lacks to the system first (one component, both
  themes), then use it.
- **Don't** set a size, weight, colour or radius the tokens don't have, or
  use a website role name in app code.
- **Don't** change factual copy, data, feature claims or confirmation steps as
  part of visual work.
