---
version: alpha
name: CiteLadder
description: >-
  Monochrome with one accent. A compact, technical product app and an
  editorial website on one set of tokens, in light and dark.
---

# CiteLadder Design System

The design system's reference, in the [DESIGN.md](https://github.com/google-labs-code/design.md)
format: tokens, then the rules for using them. It states what holds today; the
owner's decisions behind it, and the page contracts they produced, are in
[design decisions](design-decisions.md). The token blocks are generated from
the product's CSS and checked by `pnpm check:policy`; never edit them by hand.

## Overview

CiteLadder looks like a precise instrument: black and white, one accent, dense
where people work and calm where they read.

- **The app** is compact and technical, closer to a code tool than a marketing
  dashboard. Every page has the same anatomy, so a person learns it once.
- **The website and docs** are editorial: large display headings, generous
  reading measure, depth from pictures rather than from boxes and shadows.
- **Both** follow the reader's system theme (light or dark) and meet WCAG 2.1
  AA. Meaning is never carried by colour alone, and all motion stops under
  `prefers-reduced-motion`.

## Colors

<!-- generated:tokens:start -->

```yaml
colors:
  accent: '#e8501a' # dark '#ff6a33'
  accent-ink: '#b53a0c' # dark '#ff9466'
  accent-soft: '#ffe6da' # dark '#3b1a0c'
  brand-google-blue: '#4285f4' # dark '#4285f4'
  brand-google-green: '#34a853' # dark '#34a853'
  brand-google-red: '#ea4335' # dark '#ea4335'
  brand-google-yellow: '#fbbc05' # dark '#fbbc05'
  chart-grid: '#ececec' # dark '#262626'
  data-1: '#e8501a' # dark '#ff6a33'
  data-2: '#111111' # dark '#f4f4f4'
  data-3: '#7a7a7a' # dark '#8c8c8c'
  data-other: '#c2c2c2' # dark '#4a4a4a'
  focus: '#111111' # dark '#f4f4f4'
  footer: '#151515' # dark '#151515'
  footer-ink: '#f4f4f4' # dark '#f4f4f4'
  footer-ink-muted: '#a6a6a6' # dark '#a6a6a6'
  footer-line: '#2a2a2a' # dark '#2a2a2a'
  info: '#1f5fbf' # dark '#7fb0ff'
  info-soft: '#e3edfc' # dark '#14243d'
  ink: '#111111' # dark '#f4f4f4'
  ink-hover: '#2a2a2a' # dark '#d6d6d6'
  ink-muted: '#525252' # dark '#a6a6a6'
  ink-secondary: '#525252' # dark '#a6a6a6'
  line: '#e5e5e5' # dark '#2a2a2a'
  line-control: '#858585' # dark '#747474'
  line-strong: '#d4d4d4' # dark '#3a3a3a'
  nav-glass: 'rgb(244 244 244 / 78%)' # dark 'rgb(30 30 30 / 78%)'
  negative: '#c4122f' # dark '#ff7387'
  negative-soft: '#ffe2e6' # dark '#3d0e16'
  on-accent: '#111111' # dark '#111111'
  on-ink: '#ffffff' # dark '#111111'
  paper: '#f4f4f4' # dark '#0a0a0a'
  positive: '#0b6e69' # dark '#4fd1c5'
  positive-soft: '#d6f2ef' # dark '#0e2e2b'
  scrim: 'rgb(17 17 17 / 32%)' # dark 'rgb(0 0 0 / 64%)'
  sidebar: '#f4f4f4' # dark '#0a0a0a'
  stage-lilac: '#dfd6f7' # dark '#231b3d'
  stage-mint: '#cdeedf' # dark '#0f2a26'
  stage-peach: '#fcdac6' # dark '#2f1b22'
  stage-sky: '#d2e2f8' # dark '#13223d'
  state-hover: 'rgb(17 17 17 / 6%)' # dark 'rgb(244 244 244 / 6%)'
  state-pressed: 'rgb(17 17 17 / 8%)' # dark 'rgb(244 244 244 / 8%)'
  state-selected: 'rgb(17 17 17 / 10%)' # dark 'rgb(244 244 244 / 10%)'
  surface: '#ffffff' # dark '#151515'
  surface-sunken: '#ececec' # dark '#1e1e1e'
  warning: '#8a5000' # dark '#f5b84a'
  warning-soft: '#fff0d1' # dark '#3a2a0a'
```

<!-- generated:tokens:end -->

- **Ink** carries every primary action, heading and figure. **Ink secondary**
  is the one grey for supporting text; `ink-muted` is its alias, so there is
  never a third grey.
- **The app rebinds a few values** (D58, D59): its ink is 10% lower in
  contrast (`#1c1c1c`, dark `#e8e8e8`), and its fills are a ladder with the
  sidebar on its own step. Light: paper `#fcfcfc`, sidebar `#fafafa`, surface
  `#ffffff`, sunken `#f4f4f5`, ink-secondary `#61616b`. Dark: sidebar
  `#0a0a0a`, paper `#111111`, surface `#1c1c1c`, sunken `#141414` (a well
  inside the card), line `rgb(255 255 255 / 8%)`, line-strong
  `rgb(255 255 255 / 14%)`, state-hover `rgb(244 244 244 / 4%)`, chart-grid
  `#2b2b2b`, ink-secondary `#9a9a9a`. The secondary ink is the lightest grey
  that holds 4.5:1 under every state overlay on every app fill. The website
  and docs keep the values above.
- **Accent** (Flare) is a mark, never a fill for actions: the logo's bars, the
  own-brand chart series, the current nav item's 2px bar, a dot, a link's ink
  (`accent-ink`). The primary button is ink, not accent.
- **Three fills, never deeper:** `paper` is the ground, `surface` the container
  (card, panel, table, every floating surface), `surface-sunken` the inset,
  used only inside a container. The app's sidebar sits on its own `sidebar`
  step beside the ground, and its selected row lifts to `surface`.
- **Reading text is ink:** words someone reads as the content (their own
  chat message, a prompt, a fact, a remediation, a quoted passage) take the
  primary ink at the body size; descriptions, captions, metadata and labels
  stay secondary.
- **States are ink overlays** over whatever fill is beneath: `state-hover`,
  `state-pressed`, `state-selected`, so the three always look different.
- **Edges:** `line` for every container edge and divider, `line-strong` for a
  rule on the sunken fill, `line-control` (3:1) only for marks with nothing
  inside them.
- **Status:** `positive`, `negative`, `warning`, `info`, each with a `-soft`
  fill. Red is reserved for errors and destructive actions.
- **Data:** `data-1` is the own brand (accent), `data-2` ink, `data-3` grey,
  `data-other` the rest.
- **Website only:** the `stage-*` tints colour panels and picture stages; the
  footer is dark in both themes on its own `footer-*` tokens.

## Typography

<!-- generated:type:start -->

```yaml
typography:
  type-badge: { fontSize: 12px, lineHeight: 16px }
  type-body: { fontSize: 14px, lineHeight: 20px }
  type-caption: { fontSize: 12px, lineHeight: 16px }
  type-code: { fontSize: 12px, lineHeight: 20px }
  type-control: { fontSize: 14px, lineHeight: 20px }
  type-delta: { fontSize: 12px, lineHeight: 16px }
  type-eyebrow: { fontSize: 12px, lineHeight: 16px }
  type-figure: { fontSize: 24px, lineHeight: 32px }
  type-figure-sm: { fontSize: 14px, lineHeight: 20px }
  type-item-title: { fontSize: 14px, lineHeight: 20px }
  type-label: { fontSize: 14px, lineHeight: 20px }
  type-page-title: { fontSize: 20px, lineHeight: 28px }
  type-section-title: { fontSize: 16px, lineHeight: 24px }
  cl-body: { fontSize: 16px, lineHeight: 26px }
  cl-fcard-title: { fontSize: 22px, lineHeight: 28px }
  cl-lead: { fontSize: 18px, lineHeight: 30px }
  cl-lhero-title: { fontSize: 80px, lineHeight: 86px }
  cl-note: { fontSize: 14px, lineHeight: 20px }
  cl-phero-title: { fontSize: 80px, lineHeight: 86px }
  cl-shead-title: { fontSize: 56px, lineHeight: 60px }
```

<!-- generated:type:end -->

- **Faces by role:** the sans face sets everything; the mono face sets data,
  code and short labels, never a sentence; the display face sets only the
  website's and docs' display headings, at 400. The app uses no display face.
- **Three text styles:**
  - _Heading_, 500 in ink: page, section, card, dialog and drawer titles, a
    metric's figure, buttons, the selected tab, segment or nav item.
  - _Primary_, 400 in ink: row and item titles, names, values, table cells,
    form labels.
  - _Secondary_, 400 in ink secondary: descriptions, value labels, column
    heads, captions, counts, hints, inactive tabs and nav.
- **Nothing is heavier than 500.**
- **App sizes:** 14 body and controls, 16 section and card titles, 12
  captions, badges and code, 20 for the page title (D58) and 24 only for a
  metric's figure.
- **Website sizes:** 12 · 14 · 16 · 18 · 22 · 28 · 56 · 80, and normally no
  more than three on a page. Nothing below 12px; prose holds to 65ch.

## Layout

<!-- generated:controls:start -->

```yaml
spacing:
  container-site: 1320px
  container-app: 1440px
  container-thread: 1040px
  container-prose: 720px
  container-narrow: 560px
  control-sm: 28px
  control-md: 32px
  control-lg: 48px
  nav-height: 64px
  sidebar-width: 248px
  nav-item-height: 32px
  menu-item-height: 32px
  badge-height-sm: 22px
  tab-height: 32px
  table-row-height: 44px
  table-header-height: 32px
```

<!-- generated:controls:end -->

Everything sits on a 4px grid. The app's spacing is a set of named
relationships, so a page passes a role and never a number:

| Role        | App value | Between                                                            |
| ----------- | --------- | ------------------------------------------------------------------ |
| `tight`     | 4         | the parts of one fact: a title and its meta, a label and its value |
| `item`      | 8         | atoms in one row: a badge and its text, buttons, filter controls   |
| `workspace` | 12        | blocks in one pane, and card to card                               |
| inset       | 16        | a card's, dialog's or drawer's padding                             |
| `section`   | 16        | the page-title rule to the control row                             |
| band        | 8         | the control row to the content                                     |

**Page anatomy.** Order is by likelihood of use: the most likely action comes
first, left to right and top to bottom.

1. **Header:** the title, its actions on the same row.
2. **Tabs.**
3. **Control row:** the view (one segmented control), search, **All filters**,
   then at the row's end the count or a live note, then one action (Export,
   Columns). Two or more filters share All filters; a lone filter is its own
   trigger ("Page kind: All page kinds"). A row of filters alone, with no
   view, search or action, joins the tab row right after the tabs, its live
   note at the far end (D60); with no tabs it follows the header's title
   (D58).
4. **Content.**

A control sits in the row of the thing it acts on: the page's control row when
it scopes the whole page, a table's toolbar when it scopes one table, a card's
header when it changes how that card draws.

**Page width.** A page is full width. Settings, Billing, Issues, Skills, Context,
Actions, Runs and New chat sit in one centred column at `container-thread`
under the full-width header, and the data-source setup card at
`container-prose`, so a row's action is never far from its text (D61).

**Breakpoints.** Components change at one breakpoint, 981px. The shell has
two more: below 900px the navigation is a drawer behind the header's menu
button, from 900px an icon rail, from 1280px the labelled sidebar. Metric
cards stay in one row from 981px; the control row wraps in its one order.

**Nothing moves on interaction.** Pagination, tabs, filters, sorting, loading
and empty states keep their footprint; a pending button keeps its label's box.

## Elevation & Depth

- **The app is flat.** Nothing at rest has a shadow: a card is `surface` with
  a `line` edge. Hierarchy comes from the three fills and the 1px edges.
- **Floating surfaces** (menus, select lists, popovers, dialogs, drawers,
  toasts, the command palette, chart tips) share one face: `surface`, a `line`
  edge and `shadow-float`.
- **The website gets depth from pictures.** Panels have no border or shadow
  and are told apart by tint; a product image is the one surface with a
  shadow (`shadow-pop`). The primary button is a raised key (`shadow-press`).

## Shapes

<!-- generated:radii:start -->

```yaml
rounded:
  2xs: 2px
  xs: 2px
  sm: 4px
  md: 6px
  lg: 8px
  xl: 8px
  full: 9999px
```

<!-- generated:radii:end -->

- **The app's corners are slight:** 2 to 8, and nothing rounder than 8.
- **Full round** only for avatars, status dots, switch tracks and count pills.
  A chip, citation pill, meter or progress track takes a small radius.
- **The website** keeps 2 to 8 for controls and chips; its surfaces are 4 for
  an inner card or popup, 12 for a card and 16 for a stage.

## Components

Atoms have one form, defined once and composed everywhere; a page never sets
its own spacing, size or radius on them.

- **Buttons:** primary is ink-filled, one per view; secondary and danger wear
  a field's soft edge. Controls are 32px tall (28 compact).
- **Fields** (input, search, select, textarea, checkbox and radio): a 1px
  `line` edge with a faint smudge, `line-strong` on hover, a 2px `focus` edge
  in a 3px halo when focused, `negative` when invalid.
- **Cards:** `surface` with a `line` edge and a 16 inset. A card header closes
  with a hairline across the full width.
- **Tabs, segments and chips** show a count after the label in brackets, in
  the secondary style: "All signals (107)". Never mono.
- **All filters:** one menu listing each filter with its value; options open in
  a submenu. The button counts the filters changed from their defaults. It
  appears only for two or more filters.
- **Tables** sort from their column headers. A row tints on hover only when
  pressing it does something. In its own card a table runs full-bleed.
- **Selectable lists** run full-bleed with no gap between rows; the selected
  row is a full-width overlay with the 2px accent bar.
- **Badges:** a status in its tone. A priority (High, Medium, Low) is an order,
  not a state: a bar glyph and its word, accent for High, neutral otherwise.
- **Links** in a list, table or card underline on hover and focus; a link
  inside a sentence keeps its underline.
- **Charts** are hidden from assistive tech and carry a written description. A
  missing point is a gap, never a zero.
- **Focus** is always visible: 2px of `focus`, offset 2px.

**Data states.** Use the state actually known; never punctuation alone or a
fabricated zero. An observed zero stays `0`.

| Label              | Meaning                                        |
| ------------------ | ---------------------------------------------- |
| **Not measured**   | No measurement exists                          |
| **Not run**        | The workflow has not started                   |
| **Not set**        | A user-configurable fact is missing            |
| **Unavailable**    | The evidence or provider cannot supply a value |
| **Not applicable** | The field does not apply                       |
| **Unknown**        | The system cannot determine the state          |

A missing value in a table is a muted en dash with the state as its accessible
name, never a blank cell. A state shared by a section or column is said once,
on its header. An empty table or chart tells first use, no results, loading
and error apart.

## Do's and Don'ts

- **Do** order controls from the most likely action to the least likely.
- **Do** add what a page lacks to the system first (one component, both
  themes), then use it.
- **Do** keep every state distinct: unknown, unavailable, zero and not
  applicable are different findings.
- **Don't** use the accent for buttons, fills or text emphasis.
- **Don't** put a shadow on anything at rest in the app, or nest a fill deeper
  than the sunken inset.
- **Don't** set a size, weight, colour or radius the tokens don't have.
- **Don't** change factual copy, data, feature claims or confirmation steps as
  part of visual work.
