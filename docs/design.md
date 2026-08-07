# CiteLadder Design System

> Canonical visual and interaction contract for marketing, authentication, and
> the authenticated application. This is the only design-system document.

## Direction and identity

CiteLadder is a light-only, evidence-led enterprise system. It should feel calm,
precise, and engineered. It began from a Tesla-style restraint and has settled
into a refined, Untitled-UI-influenced light system: one chromatic accent,
generous whitespace, crisp micro-shadows over hairline borders, and a few
deliberate, quiet motion treatments.

- **Name and domain:** CiteLadder, `citeladder.com`.
- **Voice:** direct, confident, specific. One idea per sentence. Prefer evidence
  and outcomes over generic AI language.
- **Typography:** Manrope for display headings, Public Sans for UI, body, and
  data. Weights 400–600, normal tracking (a tight display headline may use
  `tracking-tight`). Section headings are 32px; the hero headline scales
  responsively up to 48px, which is the display ceiling.
- **Accent:** a single Electric Blue (`#3E6AE1`) for primary actions, selection,
  links, and focus. It is the only chromatic colour on the marketing surface; the
  hero closing clause may render it as an accent-token gradient.
- **Composition:** state before features. Product pages prioritise current state,
  movement, next action, then evidence. Marketing is more editorial but uses the
  same tokens, type, and restraint.

There is no dark theme, marketing token namespace, or route-local palette.

## Source of truth and implementation rules

`frontend/app/globals.css` is the sole owner of global tokens, the font binding,
shared geometry, and global interaction rules. Components consume its semantic
Tailwind utilities and CSS custom properties.

- Do not add `@theme`, a raw hex colour, a shared control recipe, or an
  unregistered animation outside `globals.css`.
- Do not create a marketing token namespace. Marketing scenes and product screens
  use the same surface, type, status, elevation, and motion tokens.
- Prefer existing primitives in `frontend/components/ui/` and
  `frontend/components/marketing/` before making a new one.
- `pnpm check:policy` guards raw colours outside the owner, stray `@theme` blocks,
  legacy identifiers, and the file line budgets.

## Colour

Tokens are semantic; components use the role, not a colour value.

| Role | Token family | Use |
|---|---|---|
| Canvas and surfaces | `background` (Untitled UI Gray-50 #f9fafb), `background-alt` (#f2f4f7), `panel` (white), `well`, `sidebar` | Clean light tiers — crisp panels with high legibility and contrast |
| Text | `foreground` (#101828), `secondary` (#344054), `muted` (#475467), `subtle` (#667085), `inverse` | Untitled UI 10-step Gray reading ramp |
| Borders | `border` (#e4e7ec), `border-subtle` (#f2f4f7), `border-strong` (#d0d5dd) | Crisp hairlines for subtle separation |
| Primary action | `accent-*` | Electric-blue (`#3E6AE1`) CTAs, selection, links, focus (UNCHANGED) |
| Status | `success-*`, `warning-*`, `danger-*`, `info-*`, `neutral-bg` | App only; always paired with text or an icon |
| Evidence and scores | `citation-*`, `run-*`, `score-*`, `series-*`, `chart-*` | Persisted evidence, audit status, score bands, and charts |

The accent is Electric Blue: `#3E6AE1` at rest (UNCHANGED), darkened on hover and press. Its
subtle fill and border are pale-blue tints; `accent-text` is a darker blue so
accent-coloured text clears WCAG AA on white. The canvas is Gray 50 (`#f9fafb`),
working surfaces are white, and ink is Carbon Ink (`#101828`).

**Marketing is monochrome-plus-blue.** It uses only white, the ink ramp, and the
one blue — no status, score, or category colour. **The authenticated app keeps
the functional families** (status, score bands, run states, citation types, and
the categorical chart series, whose first series is the brand blue), because a
data view has to stay legible at a glance. Status colour never carries meaning
alone; it is always paired with a label or icon.

## Type, data, and geometry

Two families: Manrope for display headings (`font-display`), Public Sans for UI,
body, and data (`font-sans`). Weights run 400–600. Metrics, dates, ranks, and
percentages use tabular numerals, never a monospace face.

The scale clusters low and caps at 48px. `text-sm` (14px) is the reading
baseline; `text-2xl` (32px) is the section heading; the hero headline scales
`text-3xl` → `text-4xl` → `text-5xl` (40 → 44 → 48px) across breakpoints, and 48px
is the ceiling. Every one of those sizes is a `--text-*` token in `globals.css`;
no page invents an off-scale size.

| Context | Desktop | Touch / compact |
|---|---:|---:|
| Top bar | 48px | 52px |
| Sidebar rail | 224px | mobile drawer |
| Content gutter | 20px | 16px |
| Navigation / control row | 32px | 44px minimum target |
| Primary CTA | 40px height | 44px minimum target |
| Table row | 36px | labelled record |

The content area caps at 1383px. Standard cards use 16px internal padding and gap.
The radius scale is 4px (`xs`), 6px (`sm`, controls/buttons), 8px (`md`), 12px
(`lg`, standard cards), 16px (`xl`), and 20px (`2xl`, feature panels); a full
radius is reserved for badges, dots, and toggles. Elevation is Untitled-UI
micro-shadows layered over hairline borders (`shadow-card` and up), never a heavy
drop. Marketing sections breathe on a generous rhythm (`--section-y-*`, 120px
desktop).

## Layout and content composition

### Application

- Use sections, ledgers, tables, and split workspaces as page architecture. Cards
  support a section; they do not replace one. Avoid nested decorative cards.
- A command-centre view uses a movement-and-actions split: project state first, a
  dominant movement chart beside a ranked action queue, then a proof ledger.
- Recommendations show impact, deterministic priority factors, affected scope,
  status, and links to persisted evidence. Do not invent confidence, effort,
  ownership, or causality.
- Mobile retains every critical action. Tables become labelled records; filters
  and evidence use full-height sheets.

### Marketing and auth

Marketing is editorial rather than dense, while staying recognisably part of the
product. A page is a vertical stack of full-width sections with content in a
centred container. Use the recipe: eyebrow, heading, short lead, evidence/media or
focused grid, then an optional CTA.

- Give sections breathing room on the global rhythm rather than route-local values.
- Prefer asymmetric text-and-media compositions, a proof ledger, or a concise grid
  over a wall of feature cards. The product UI is the "photography": a real
  workspace canvas carries the visual weight.
- Keep body copy around 60–70 characters wide and use one H1 per page.
- Auth uses the same palette and focus treatment; the form remains the primary task.

## Component recipes

### Controls

Buttons are `rounded-sm` (6px) rectangles, never pills. Primary is the blue fill
with a white label; secondary is a white fill with a hairline and a Graphite
label; neutral and ghost stay quiet so a screen has one obvious action; danger is
reserved for destructive actions. Hover shifts colour, border, and the micro-shadow
over the universal 330ms curve. Every control has a direct label, a visible focus
ring (an opaque accent halo, ≥3:1), and at least a 44px touch target.

Inputs use the semantic input and border roles. Labels sit with their control,
helper text explains constraints, and errors give a recovery instruction. Never
use placeholder text as the only label.

### Panels, badges, and evidence

Panels are white or semantic-surface fills carried by a hairline border and a
crisp micro-shadow. Interactive cards may raise a step on hover — a deeper shadow
and a small rise (`hover:-translate-y-0.5`) — as the one sanctioned lift. Badges
pair a text label with their state mark; a colour, dot, or icon is never the sole
signal. Evidence rows identify source, measurement context, and the action that
opens the persisted record. Empty and loading states preserve layout and explain
what is missing.

### Navigation and overlays

The marketing nav floats transparent over the hero and becomes a frosted white on
scroll, with no shadow. The app sidebar makes the active location obvious through a
blue fill, a leading blue rail, and a Carbon-Dark label — not through weight.
Menus, tooltips, dialogs, and drawers use the overlay elevation rung, maintain
focus, close predictably, and return focus to their trigger.

## Motion and accessibility

State changes use one 330ms `cubic-bezier(0.5, 0, 0, 0.75)` curve, with a 250ms
micro for feedback. Beyond that, a small, deliberate set of ambient and
storytelling motions is sanctioned, each one calm and each one reduced-motion-safe:

- the marketing **atmosphere** — two very-low-opacity accent auras drifting behind
  the public surface;
- the **architecture pipeline** diagram (platform section) — accent dots flowing
  along conduit paths;
- the rotating answer-engine wordmarks and the product-window walkthrough;
- scroll **reveal** entrances (GSAP) that fade and rise a small distance and never
  hide server-rendered content after hydration;
- the interactive-card hover lift.

Every one of these stops under `prefers-reduced-motion: reduce`: CSS animations and
transitions are neutralised globally, the SMIL pipeline dots are hidden, and the
GSAP reveals do not run. WCAG 2.1 AA is the minimum. Focus is always visible via an
opaque accent halo; state is never colour-only; forced-colours and print remain
usable.

## Review checklist

Before merging a visual change, verify:

- It uses semantic global tokens and an existing primitive where one applies.
- Type stays within weights 400–600 and at or below the 48px ceiling, using the
  `--text-*` token sizes.
- Marketing stays monochrome-plus-blue; functional colour appears only in the app.
- Elevation uses the micro-shadow tokens; radius uses the 4 / 6 / 8 / 12 / 16 / 20
  scale.
- Any new motion is calm and stops under `prefers-reduced-motion`.
- Text, focus, status, loading, error, empty, keyboard, touch, reduced-motion,
  forced-colours, and mobile states remain usable.
- Focused tests, `pnpm check:policy`, and the appropriate build or visual checks
  pass.
