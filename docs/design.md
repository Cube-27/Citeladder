# CiteLadder Design System

> Canonical visual and interaction contract for marketing, authentication, and
> the authenticated application. This is the only design-system document.

## Direction and identity

CiteLadder is a light-only, evidence-led enterprise system. It should feel calm,
precise, and engineered — technology that does not need to announce itself. The
system is derived from Tesla's: radical subtraction, near-zero UI decoration, one
chromatic accent, and whitespace used as a luxury signal.

- **Name and domain:** CiteLadder, `citeladder.com`.
- **Voice:** direct, confident, specific. One idea per sentence. Prefer evidence
  and outcomes over generic AI language.
- **Typography:** Public Sans for everything — display, UI, body, and data. Only
  two weights (400 and 500), normal letter-spacing at every level, and a 40px
  display ceiling.
- **Accent:** a single Electric Blue (`#3E6AE1`) for primary actions, selection,
  links, and focus. It is the only chromatic colour on the marketing surface.
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
| Canvas and surfaces | `background` (Light Ash), `background-alt`, `panel` (white), `well`, `sidebar` | Two light tiers only — cards separate by tone and spacing, not shadow |
| Text | `foreground`, `secondary`, `muted`, `subtle`, `inverse` | Carbon → Graphite → Pewter → Silver Fog reading ramp |
| Borders | `border`, `border-subtle`, `border-strong` | Sparingly — a hairline where tone alone is not enough |
| Primary action | `accent-*` | Electric-blue CTAs, selection, links, focus |
| Status | `success-*`, `warning-*`, `danger-*`, `info-*`, `neutral-bg` | App only; always paired with text or an icon |
| Evidence and scores | `citation-*`, `run-*`, `score-*`, `series-*`, `chart-*` | Persisted evidence, audit status, score bands, and charts |

The accent is Electric Blue: `#3E6AE1` at rest, darkened on hover and press. Its
subtle fill and border are pale-blue tints; `accent-text` is a darker blue so
accent-coloured text clears WCAG AA on white. The canvas is Light Ash (`#f4f4f4`),
working surfaces are white, and ink is Carbon Dark (`#171a20`).

**Marketing is monochrome-plus-blue.** It uses only white, the ink ramp, and the
one blue — no status, score, or category colour. **The authenticated app keeps
the functional families** (status, score bands, run states, citation types, and
the categorical chart series, whose first series is the brand blue), because a
data view has to stay legible at a glance. Status colour never carries meaning
alone; it is always paired with a label or icon.

## Type, data, and geometry

One typeface (Public Sans), two weights (400 body, 500 display and UI), normal
letter-spacing everywhere. Metrics, dates, ranks, and percentages use tabular
numerals, never a monospace face.

The scale caps at 40px and clusters low. `text-sm` (14px) is the reading
baseline; `text-2xl` (28px) is the section heading; `text-3xl` (40px) is the hero
ceiling and is never exceeded. `text-4xl`/`text-5xl` are forbidden. Heading weight
and tracking come from the base rule in `globals.css`; markup sets only the size
rung, so type never drifts page to page.

| Context | Desktop | Touch / compact |
|---|---:|---:|
| Top bar | 48px | 52px |
| Sidebar rail | 224px | mobile drawer |
| Content gutter | 20px | 16px |
| Navigation / control row | 32px | 44px minimum target |
| Primary CTA | 40px height | 44px minimum target |
| Table row | 36px | labelled record |

The content area caps at 1383px. Standard cards use 16px internal padding and gap.
Radius roles are fixed and few: 0 by default, 4px for controls and buttons, 12px
for cards and panels; a full radius is reserved for badges and toggles. Elevation
is essentially none — `shadow-card` is flat, and only overlays (menus, dialogs,
tooltips, the command palette) float on a restrained shadow. Marketing sections
breathe on a generous rhythm (`--section-y-*`, 120px desktop).

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

Buttons are 4px-radius rectangles, never pills. Primary is the blue fill with a
white label; secondary is a white fill with a Pale-Silver hairline and a Graphite
label; neutral and ghost stay quiet so a screen has one obvious action; danger is
reserved for destructive actions. Hover moves colour and border only — never scale
or translate — over the universal 330ms curve. Every control has a direct label,
visible focus, and at least a 44px touch target.

Inputs use the semantic input and border roles. Labels sit with their control,
helper text explains constraints, and errors give a recovery instruction. Never
use placeholder text as the only label.

### Panels, badges, and evidence

Panels are white or semantic-surface fills, flat, separated by tone, spacing, and
a faint hairline rather than a shadow. Badges pair a text label with their state
mark; a colour, dot, or icon is never the sole signal. Evidence rows identify
source, measurement context, and the action that opens the persisted record.
Empty and loading states preserve layout and explain what is missing.

### Navigation and overlays

The marketing nav floats transparent over the hero and becomes a frosted white on
scroll, with no shadow. The app sidebar makes the active location obvious through a
blue fill, a leading blue rail, and a Carbon-Dark label — not through weight.
Menus, tooltips, dialogs, and drawers use the overlay elevation rung, maintain
focus, close predictably, and return focus to their trigger.

## Motion and accessibility

Motion is a single language: one 330ms `cubic-bezier(0.5, 0, 0, 0.75)` curve for
state changes, with a 250ms micro for feedback. Interactions are colour-only — no
scale, spin, glow, gradient, or looping decoration. Two motion treatments are kept
because they clarify rather than decorate: the rotating answer-engine wordmarks and
the product-window walkthrough. Entrances may fade and rise a small distance; they
never hide server-rendered content after hydration.

- `prefers-reduced-motion` removes transforms and non-essential movement while
  retaining all content and controls.
- WCAG 2.1 AA is the minimum. Focus is always visible; state is never colour-only;
  forced-colours and print remain usable.

## Review checklist

Before merging a visual change, verify:

- It uses semantic global tokens and an existing primitive where one applies.
- Type stays at weight 400/500, normal tracking, and at or below the 40px ceiling.
- Marketing stays monochrome-plus-blue; functional colour appears only in the app.
- Elevation stays flat except sanctioned overlays; radius is 0 / 4 / 12.
- Text, focus, status, loading, error, empty, keyboard, touch, reduced-motion,
  forced-colours, and mobile states remain usable.
- Focused tests, `pnpm check:policy`, and the appropriate build or visual checks
  pass.
