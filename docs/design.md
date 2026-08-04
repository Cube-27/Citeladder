# CiteLadder Design System

> Canonical visual and interaction contract for marketing, authentication, and
> the authenticated application. This is the only design-system document.

## Direction and identity

CiteLadder is a light-only, evidence-led enterprise system. It should feel
calm, precise, and operational: identify what answer engines say, understand
the evidence, resolve gaps, and measure the result.

- **Name and domain:** CiteLadder, `citeladder.com`.
- **Voice:** direct, confident, and specific. Prefer evidence and outcomes over
  generic AI language. Do not imply product-feed management.
- **Typography:** Geist for UI, body copy, data, and navigation; self-hosted
  Apfel Grotezk for display and headings.
- **Mark:** a one-colour citation/progression symbol that remains legible at
  16px. It may use enterprise teal or a monochrome treatment; it is never a
  literal ladder or magnifier.
- **Composition:** state before features. Product pages prioritise current
  state, movement, next action, then evidence. Marketing is more editorial but
  uses the same system.

There is no dark theme, marketing theme, legacy design-system namespace, or
route-local palette.

## Source of truth and implementation rules

`frontend/app/globals.css` is the sole owner of global tokens, font faces,
shared geometry, and global interaction rules. Components consume its semantic
Tailwind utilities and CSS custom properties.

- Do not add `@theme`, a raw hex colour, a shared control recipe, or an
  unregistered animation outside `globals.css`.
- Do not create a marketing token namespace. Marketing scenes and product
  screens use the same surface, type, status, elevation, and motion tokens.
- Prefer existing primitives in `frontend/components/ui/` and
  `frontend/components/marketing/` before making a new one. A reusable concern
  needs an explicit owner, not page-local CSS.
- `pnpm check:policy` guards legacy brand/theme identifiers, raw colours outside
  the owner, and duplicate `@theme` blocks.

## Tokens

Tokens are semantic; components use the role, not a colour value.

| Role | Token family | Use |
|---|---|---|
| Canvas and surfaces | `background`, `background-alt`, `panel`, `elevated`, `well`, `sidebar` | Page, section, card, inset, and rail hierarchy |
| Text | `foreground`, `secondary`, `muted`, `subtle`, `inverse` | Reading hierarchy and inverse surfaces |
| Borders | `border`, `border-subtle`, `border-strong` | Structure and interactive affordance |
| Primary action | `accent-*` | Teal CTAs, selection, links, and focus-adjacent states |
| Status | `success-*`, `warning-*`, `danger-*`, `info-*`, `neutral-bg` | State only; always pair it with text or an icon |
| Evidence and scores | `citation-*`, `run-*`, `score-*`, `series-*`, `chart-*` | Persisted evidence, audit status, score bands, and charts |

The accent is enterprise teal: `#006D77` at rest, `#005A63` on hover, and
`#00444B` when pressed. Its subtle fill is `#E6F4F3`, border is `#A8DADC`, and
visible focus is `#007F87`. The canvas is a cool near-white, working surfaces
are white, and ink is cool near-black. Status colours never carry meaning alone.

Charts identify metric, unit, time range, measurement context, and provenance.
The brand is the first series. Show at most five categorical series together;
aggregate remaining series deliberately.

## Type, data, and geometry

The global type scale is `2xs`, `xs`, `sm`, `base`, `lg`, `xl`, `2xl`, and
`3xl`; `heading-sm` is reserved for compact headings. Use Apfel Grotezk for
headings and Geist for all other text. Metrics, dates, ranks, and percentages
use tabular numerals, never monospace.

| Context | Desktop | Touch / compact |
|---|---:|---:|
| Top bar | 48px | 52px |
| Sidebar rail | 224px | mobile drawer |
| Content gutter | 20px | 16px |
| Navigation row | 32px | 44px minimum target |
| Standard control | 32px | 44px minimum target |
| Table row | 36px | labelled record |

The content area caps at 1440px. Standard cards use 16px internal padding and
gap. Dense layouts gain clarity from aligned rows and labels, not illegible text.

Radius roles are fixed: 2px indicators, 4px compact controls, 6px controls,
and 8px panels. A full radius is reserved for avatars and binary toggles. Use
`shadow-card` for standard panels, `shadow-card-hover` for interactive panels,
and `shadow-modal-value` for menus, tooltips, drawers, and dialogs.

## Layout and content composition

### Application

- Use sections, ledgers, tables, and split workspaces as page architecture.
  Cards support a section; they do not replace one. Avoid nested decorative
  cards.
- A command-centre view uses a movement-and-actions split: project state first,
  a dominant movement chart beside a ranked action queue, then a non-causal
  proof ledger.
- Recommendations show impact, deterministic priority factors, affected scope,
  status, and links to persisted evidence. Do not invent confidence, effort,
  ownership, or causality.
- Mobile retains every critical action. Tables become labelled records; filters
  and evidence use full-height sheets; ordered lists expose up/down controls
  where drag-and-drop is unavailable.

### Marketing and auth

Marketing is editorial rather than dense, while staying recognisably part of
the product. A normal page is a vertical stack of full-width sections with
content in a centered container. Use the recipe: eyebrow, heading, short lead,
evidence/media or focused grid, then an optional CTA.

- Give sections breathing room; use the global spacing rhythm rather than
  route-local magic values.
- Prefer asymmetric text-and-evidence compositions, a proof ledger, or a concise
  three-column grid over a wall of feature cards.
- Keep body copy around 60–70 characters wide and use one H1 per page.
- Auth uses the same palette and focus treatment. On wide screens the brand
  panel may sit beside the form, but the form remains the primary task.

## Component recipes

### Controls

Controls have direct labels, visible focus, semantic states, and at least a
44px touch target. Buttons use accent for primary actions, neutral structural
treatments for secondary actions, and danger only for destructive actions.
Pending, success, and error states reuse the existing variants.

Inputs use the semantic input and border roles. Labels sit with their control,
helper text explains constraints, and errors give a recovery instruction. Never
use placeholder text as the only label.

### Panels, badges, and evidence

Panels are white or semantic-surface fills with a clear border and the correct
elevation rung. Interactive panels may raise slightly and deepen their shadow,
but never scale. Badges pair a text label with their state mark; a colour, dot,
or icon cannot be the sole signal.

Evidence rows identify source, measurement context, and the action that opens
the persisted record. Empty and loading states preserve layout and explain what
is missing or still being measured.

### Navigation and overlays

Navigation makes the active location obvious without turning every item into a
card. Menus, tooltips, dialogs, and drawers use the modal elevation rung,
maintain focus, close predictably, and return focus to their trigger. The
command palette is a dedicated top-bar action, not a second navigation model.

## Motion and accessibility

Motion communicates feedback or state: 120ms feedback, 180ms state changes,
and 260ms drawers or route continuity using one ease-out curve. Content remains
usable in its finished state without animation.

- No looping decoration, rotating copy/logos, cursor spotlights, glass, glow,
  or gradients. Marketing may use one entrance and one product-demo treatment
  when they clarify the message.
- Entrances may fade and rise a small distance; they never scale, spin, or hide
  server-rendered content after hydration.
- `prefers-reduced-motion` removes transforms and nonessential movement while
  retaining all content and controls.
- WCAG 2.1 AA is the minimum. Focus is always visible; state is never
  colour-only; forced-colours and print remain usable.

## Review checklist

Before merging a visual change, verify:

- It uses semantic global tokens and an existing primitive where one applies.
- It establishes state, next action, and evidence before secondary detail.
- Text, focus, status, loading, error, empty, keyboard, touch, reduced-motion,
  forced-colours, and mobile states remain usable.
- Visualisations state their context and provenance; recommendations make no
  unsupported causal claim.
- Focused tests, `pnpm check:policy`, and the appropriate build or visual checks
  pass.
