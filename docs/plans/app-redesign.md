# App redesign

Owner, 2026-11-20. Rebuild the signed-in app on one compact, consistent
component set and a few standard page layouts, then pass over every page. The
approved reference is the "Linear-style Site health / Pages" mockup (dark and
light), described in [Visual spec](#visual-spec) below. The website and docs
sites are out of scope.

## Owner decisions

- **AR-1 Look.** The app follows the approved Linear-style mockup: quiet
  greys, hairline borders, an inset content panel, compact controls. Owner,
  2026-11-20.
- **AR-2 Text.** Body and labels stay 14px; captions 12px; controls 28px.
  Owner, 2026-11-20.
- **AR-3 Metrics.** Page metrics sit in one long strip with hairline dividers
  between cells, never separate cards; no meters, rings or bars inside a
  metric cell. Owner, 2026-11-20.
- **AR-4 Tables.** The first column takes the spare width; the other columns
  hug their content, so no wide gap opens between columns (the mockup's gap
  between Type and Issues is the defect to avoid). Owner, 2026-11-20.
- **AR-5 Kept rules.** The line language (solid observed, dashed draft, `—`
  absent, printed `0`) and the accent meaning "you, here" from
  [design](../design.md) stay. Owner, 2026-11-20.
- **AR-6 Old design system.** Delete the design-system checks except three:
  no literal colours in app code, WCAG AA contrast of token pairs, and no
  direct Radix imports outside `components/ui`. Rewrite
  [design](../design.md) as a short reference of tokens, layouts and one entry
  per component; drop rulings it no longer needs. Owner, 2026-11-20.
- **AR-7 App only.** Website and docs keep their look; the app's tokens split
  from theirs so the app can change freely. Owner, 2026-11-20.
- **AR-8 Sidebar collapse.** Keep the icon rail; move the collapse toggle into
  the sidebar header beside the settings icon, in the same spot expanded and
  collapsed. Owner, 2026-11-20.
- **AR-9 Widths.** Keep today's narrow pages (1040 column: Overview, Projects,
  Issues, Actions, page detail, Agent, Billing; 720 column: Settings, Runs,
  Agent context). Side space is better than space in the middle. Owner,
  2026-11-20.
- **AR-10 Layouts first.** Define standard page layouts, then place content in
  them; never arrange a page by hand. Settings and Agent context need a
  rework, not only new components; Actions mostly needs the new components.
  Owner, 2026-11-20.
- **AR-11 Code size.** A PR that grows the line count needs a reason; never
  pad or game line counts either way. Owner, 2026-11-20.

## Visual spec

Values per theme are dark / light.

| Token | Dark | Light | Use |
|---|---|---|---|
| ground | `#08090a` | `#f4f5f7` | window and sidebar |
| panel | `#0f1011` | `#ffffff` | the inset content panel |
| raised | `#151618` | `#f7f8f9` | secondary buttons, table header, menus |
| raised-2 | `#1c1d20` | `#eef0f2` | hover on raised, avatar |
| hover | `rgb(255 255 255 / 4%)` | `rgb(0 0 0 / 3%)` | row and quiet-control hover |
| selected | `rgb(255 255 255 / 7%)` | `rgb(0 0 0 / 6%)` | current nav row, selected segment |
| line | `rgb(255 255 255 / 8%)` | `rgb(0 0 0 / 8%)` | every hairline |
| line-strong | `rgb(255 255 255 / 12%)` | `rgb(0 0 0 / 12%)` | focused field edge |
| ink | `#f7f8f8` | `#111214` | text |
| ink-2 | `#8a8f98` | `#62666d` | secondary text, icons |
| accent | `#ff6a33` | `#e8501a` | "you, here" only |

Status colours (positive, warning, negative, info and their soft fills) keep
their current values. Text 400 and 500 only. Mono (Geist Mono) for numbers,
dates, URLs and counts; sans (Spline Sans) for words.

- **Type:** body and label 14/20; caption 12/16; section heading 16/24 at 500;
  page title 14/20 at 500 in the header; metric value 20/28 mono 500.
- **Controls:** 28 high (44 below 900px or under a coarse pointer), radius 6,
  16px icons in `ink-2`. Secondary: `raised` with a `line` edge. Quiet:
  transparent, `hover` fill. Primary: `ink` fill, `panel`-coloured text, at
  most one per view. Danger: secondary with negative text.
- **Inputs:** 28, `line` edge on `panel`, `line-strong` edge plus focus ring
  when focused, 16px leading icon.
- **Segmented control:** `line` frame, 2px inset, 24-high segments, selected
  segment on `selected`.
- **Tags:** 20 high, radius 4, `line` edge, 12px `ink-2`. Status pill: radius
  full, 6px coloured dot, 12px at 500.
- **Radii:** tag 4, control 6, panel, table and strip 8, overlay 12.
- **Spacing:** 2, 4, 8, 12, 16, 24, 32, 48 only.

## Standard layouts

- **Shell.** Sidebar 224 on `ground`, 8 padding: header row (workspace
  switcher, settings icon, collapse toggle), the Dashboard | Agent segmented
  control, 28-high nav rows (current row on `selected` with a 2px accent mark),
  12px group labels, foot with Integrations and the account. The main column
  is the inset panel: 8 from the window edges (none on the sidebar side),
  `line` edge, radius 8, `panel` fill, scrolling inside itself.
- **Page header**, 44 high with a `line` rule: the page title as a breadcrumb
  (section icon, section › page), then secondary actions, at most one primary
  action, Search ⌘K and Ask agent at the right edge.
- **Tab strip**, 36 high with a `line` rule; tabs 20 apart, the current one
  underlined in accent.
- **Body.** 24 side padding (16 below 760px), 20 above, 24 below. Inside the
  body: status line, then the metric strip, then sections 24 apart; a
  section's head sits 12 above its body. Narrow pages centre the same body in
  their column; the header and tab rules still span the panel.
- **Toolbar**, above the content it scopes: segmented control, search, filter
  buttons, then right-aligned the muted count and one action, 8 apart.
- **Metric strip:** one `line`-framed strip, radius 8, cells divided by
  hairlines, cell padding 10 by 16, 12px label over the value.
- **Table:** `line` frame, radius 8; header 32 on `raised`, 12px at 500;
  rows 40, one line each, hairline dividers, `hover` fill; secondary text sits
  inline after the primary text in `ink-2`; numbers right-aligned in mono;
  footer 40 with the count and icon pager. AR-4 sets column widths.
- **Settings layout** (Settings, Agent context, Billing): to be specified in
  wave 3 from the components above.

## Waves

Each workstream is one PR from its own `agent/` branch, built by a visible
cloud session; the orchestrator reviews and merges in order.

1. **Foundation**: the app token split and new values, the design-system
   check deletion (AR-6), the rewritten [design](../design.md) carrying these
   decisions and the visual spec, then this plan's spec sections shrink to a
   link.
2. **Components and shell**, in parallel after wave 1: shell and page
   layouts; controls; data display and states.
3. **Pages**: Settings and Agent context rework, then every remaining page in
   groups, each checked in both themes at desktop and phone width.
