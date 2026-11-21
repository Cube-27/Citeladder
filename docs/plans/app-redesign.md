# App redesign

Owner, 2026-11-20. Rebuild the signed-in app on one compact, consistent
component set and a few standard page layouts, then pass over every page. The
approved reference is the "Linear-style Site health / Pages" mockup (dark and
light), described in [design](../design.md). The website and docs
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
  [design](../design.md) stay; the accent also marks focus (AR-13). Owner,
  2026-11-20.
- **AR-6 Old design system.** Delete the design-system checks except three:
  no literal colours in app code, WCAG AA contrast of token pairs, and no
  direct Radix imports outside `components/ui`. Rewrite
  [design](../design.md) as a short reference of tokens, layouts and one entry
  per component; drop rulings it no longer needs. Owner, 2026-11-20.
- **AR-7 App only.** Website and docs keep their look; the app's tokens split
  from theirs so the app can change freely. Owner, 2026-11-20.
- **AR-8 Sidebar collapse.** Keep the icon rail; the collapse toggle sits in
  the sidebar foot, at the end of the Integrations row when expanded and on
  its own row in the rail. Owner, 2026-11-21.
- **AR-9 Widths.** Keep today's narrow pages (1040 column: Overview, Projects,
  Issues, Actions, page detail, Agent, Billing, and Agent context's Business
  map tab; 720 column: Settings, Runs, the other Agent context tabs). Side
  space is better than space in the middle. Owner, 2026-11-20.
- **AR-10 Layouts first.** Define standard page layouts, then place content in
  them; never arrange a page by hand. Settings and Agent context need a
  rework, not only new components; Actions mostly needs the new components.
  Owner, 2026-11-20.
- **AR-11 Code size.** A PR that grows the line count needs a reason; never
  pad or game line counts either way. Owner, 2026-11-20.
- **AR-12 Sign-in and setup.** Sign-in and the account pages keep their split
  screen with the product showcase and the form unboxed on the surface (no
  card), and setup keeps its own layout; both take the app's new look.
  Owner, 2026-11-20.
- **AR-13 Focus.** Focus rings use a subtle accent edge and glow instead of
  ink. Owner, 2026-11-20.
- **AR-14 No helper text.** No description under a group heading or field
  unless it carries information the label cannot (a limit, a count, an
  error). Owner, 2026-11-20.
- **AR-15 Business facts.** The Prompt Builder and Agent context's Business
  map both edit the business facts, with one shared offerings grid, and no
  third place does: Context's Company tab holds the target audience and no
  other Context tab edits offerings. Prompt Builder has its own sidebar row
  under Tracking and keeps its steps in a left rail. Owner, 2026-11-20.
- **AR-16 Shares as split bars.** Distribution shares and the intent mix are
  bars dragged in 5% steps that always total 100, not percentage fields.
  Owner, 2026-11-20.

## Visual spec and standard layouts

[Design](../design.md) owns the token values, type, spacing, radii, the
standard layouts and the component entries.

## Waves

Each workstream is one PR from its own `agent/` branch, built by a visible
cloud session; the orchestrator reviews and merges in order.

1. **Foundation**: the app token split and new values, the
   design-system check deletion (AR-6) and the rewritten
   [design](../design.md).
2. **Components and shell**, in parallel after wave 1: shell and page
   layouts; controls; data display and states.
3. **Pages**: Settings and Agent context rework, then every remaining page in
   groups, each checked in both themes at desktop and phone width.
