# Website Design System

> The design system for the **public website** — every `(marketing)` route and the logged-out
> auth screens. This document is the authority for the site's visual language; the app has its
> own system in [`design.md`](design.md) and the two are deliberately independent.
>
> Implemented in `frontend/app/(marketing)/marketing-theme.css` (tokens),
> `marketing-cta.css` (the icon-button recipe), `marketing-motion.css` (keyframes and scroll
> timelines), and the primitives in `frontend/components/marketing/primitives/`.
>
> **Font families are intentionally not specified here.** The site keeps the two faces it
> already ships — Apfel Grotezk for display/headings, Inter for body and UI. Everything else
> — scale, weight, spacing, color, elevation, motion — is fixed by this document.
>
> **The top bar is out of scope.** `components/marketing/chrome/nav.tsx` keeps its existing
> construction; §6 records what it does rather than prescribing a change.

---

## 0. Design Principles

1. **Layered surfaces.** Interactive elements are built as a translucent outer "ring" wrapping
   a solid inner core. This is the signature of the system — buttons, badges, and feature cards
   all use it.
2. **Generous vertical rhythm.** Sections breathe at 200px. Density comes from tight internal
   gaps (10–20px), never from cramped sections.
3. **One accent, used sparingly.** A blue gradient carries all primary action. Everything else
   is neutral gray-blue.
4. **Motion settles, never flies.** Every entrance is a 20px rise with a fade. No scale, no
   rotation, no bounce.
5. **Concentric radii.** Nested corners always step down: 100px pills → 30px cards → 20px inner
   → 12px nested.
6. **Body text is never pure black.** Headings are near-black, body copy is a desaturated slate.

---

## 1. Color

All values live in the `@theme` block of `marketing-theme.css` under the `--color-mkt-*`
namespace. Hex is authored **only** there; components consume the generated Tailwind utilities.

### Primary

| Role | Value | Token |
|---|---|---|
| Primary Blue | `rgb(59, 130, 246)` `#3B82F6` | `--color-mkt-primary` |
| Vivid Indigo Blue | `rgb(64, 106, 228)` `#406AE4` — **ships as `#3A61D6`, see below** | `--color-mkt-indigo` |
| Light Sky Blue | `rgb(82, 144, 244)` `#5290F4` | `--color-mkt-sky-blue` |
| Soft Royal Blue (glow) | `rgba(58, 119, 229, 0.5)` | `--color-mkt-glow` |

> **Deviation — `--color-mkt-indigo` ships one step darker than the spec.** The spec's
> `#406AE4` is 4.77:1 on white, but this token is the one blue that carries **text**, and links
> also sit on the two tint fills, where it lands at 4.20:1 (sunken) and 4.26:1 (frost) — below
> AA. `#3A61D6` clears all three (5.44 / 4.79 / 4.85). `#406AE4` still ships **verbatim** where
> the spec actually uses it: the second stop of the accent gradient, as
> `--color-mkt-gradient-to`.

### Neutrals

| Role | Value | Token |
|---|---|---|
| White | `rgb(255, 255, 255)` | `--color-mkt-paper`, `--color-mkt-surface` |
| Jet Black (headings) | `rgb(29, 29, 29)` | `--color-mkt-ink` |
| Charcoal Black | `rgb(50, 50, 50)` | `--color-mkt-charcoal` |
| Black | `rgb(0, 0, 0)` | `--color-mkt-black` |
| Slate Gray (body copy) | `rgb(77, 88, 95)` | `--color-mkt-ink-soft` |
| Soft Silver | `rgb(186, 186, 186)` | `--color-mkt-silver` |
| Mist Blue | `rgb(221, 229, 237)` | `--color-mkt-mist` |
| Light Gray Blue | `rgb(237, 241, 244)` | `--color-mkt-surface-sunk` |
| Frost White | `rgb(226, 245, 255)` | `--color-mkt-frost` |

### Alpha utilities

Used for glass surfaces, hairlines, and scrims.

```
white-70   rgba(255,255,255,0.7)     black-80   rgba(0,0,0,0.8)
white-50   rgba(255,255,255,0.5)     black-30   rgba(0,0,0,0.3)
white-30   rgba(255,255,255,0.3)     black-20   rgba(0,0,0,0.2)
white-10   rgba(255,255,255,0.1)     black-10   rgba(0,0,0,0.1)
jet-50     rgba(29,29,29,0.5)        mist-70    rgba(221,229,237,0.7)
transparent rgba(255,255,255,0)
```

### Semantic — the mark/text split

A hue that works as a **fill** is not automatically legible as **text**. Every semantic hue
therefore ships in two forms: the **mark** (≥ 3:1, dots, bars, borders, icons and tiles only)
and the **`-text` sibling** (≥ 4.5:1, safe for copy). This is the one place this system adds
to the spec, and it adds nothing visual — the spec already restricts semantic hues to "alert
cards and status badges, paired with the solid version on the border or icon", which is the
mark role. The `-text` sibling exists so a label inside such a card has something legal to use.

| Role | Mark (≥ 3:1) | Text (≥ 4.5:1) | Tint |
|---|---|---|---|
| Success | `rgb(16, 185, 129)` `#10B981` | `#0B6E4F` (6.25:1) | 10% / 20% / 30% |
| Success soft | `rgb(138, 227, 137)` `#8AE389` | — | — |
| Error | `rgb(245, 28, 35)` `#F51C23` | `#B31217` (6.96:1) | 5% / 30% |
| Error soft | `rgb(255, 13, 13)` `#FF0D0D` | — | — |
| Warning | `rgb(255, 139, 6)` `#FF8B06` | `#8A4B02` (6.80:1) | — |
| Warning soft | `rgb(253, 187, 110)` `#FDBB6E` | — | — |
| Accent Coral | `rgb(242, 135, 120)` `#F28778` | — | — |
| Accent Green | `rgb(11, 207, 45)` `#0BCF2D` | — | — |

Primary Blue `#3B82F6` is 3.68:1 on white — a **mark**, which is exactly how the system uses
it (gradient fills, borders, glows, never body copy). Where blue must carry text, use
`--color-mkt-indigo` (5.44:1 as shipped) or darker.

> **Deviation — Success and Warning ship below the 3:1 mark bar.** `#10B981` is 2.54:1 on
> white and `#FF8B06` is 2.35:1, so both fall short of the ≥ 3:1 stated above. They ship
> anyway, and the gate (`app/globals.test.ts`, `PROOF_MARK_ROLES`) deliberately excludes them:
> the spec uses these two as saturated brand fills for status dots and progress bars, which
> always sit beside their own text label, so no information depends on the swatch alone.
> Retuning two published brand values would protect a contrast nothing reads. Error `#F51C23`
> and Primary `#3B82F6` are gated at 3:1 as stated. The rule that actually protects legibility
> here is the `-text` sibling — asserted for all three hues, and what every label uses.

### Gradients

```
accent-gradient   linear-gradient(110deg, #3B82F6 0%, #406AE4 100%)
dark-gradient     linear-gradient(110deg, #323232 0%, #000000 100%)
fade-down         linear-gradient(180deg, transparent 0%, #FFFFFF 100%)
fade-right        linear-gradient(90deg,  #FFFFFF 0%, transparent 100%)
fade-left         linear-gradient(270deg, #FFFFFF 0%, transparent 100%)
```

> **Deviation — the accent gradient's light stop ships as `#2563EB`, not `#3B82F6`.** Every
> pill on this surface carries a **white** label at 15px/600, below the large-text exemption,
> and `#3B82F6` gives white only 3.68:1. `#2563EB` is the same blue family at 5.17:1, so the
> label holds across the whole sweep rather than only at the darker end. `#3B82F6` keeps its
> job as a mark (borders, glows, dots), where 3:1 is the right bar. Both stops are named
> tokens — `--color-mkt-gradient-from` / `--color-mkt-gradient-to` — which the gradient
> consumes via `var()` so the legibility gate and the rendered sweep cannot drift apart.

The `fade-*` gradients are edge masks for marquees and overflowing content — always solid
page-background on the closed edge, transparent on the open edge.

### Application rules

- Page background: White. Alternate sections may use Light Gray Blue for separation, never a
  new hue.
- Headings: Jet Black. Body: Slate Gray. On dark or gradient surfaces: White.
- Hairlines and dividers: `black-10`. On dark surfaces: `white-10` or `white-30`.
- Accent gradient appears only on: primary CTA, active nav state, one highlighted element per
  section (a featured pricing tier, a selected step). Never as a section background.
- Semantic tints (5–30%) are for alert cards and status badges only, paired with the solid
  version on the border or icon.

---

## 2. Typography

The two faces already shipped are kept: **Apfel Grotezk** for display/headings (weight 600,
tight negative tracking) and **Inter** for body, labels and UI (500 / 600 / 700).

### Heading scale

| Style | Desktop (≥1200) | Tablet (≥810) | Mobile (<810) | Tracking | Line height |
|---|---|---|---|---|---|
| Display XL | 100px | 60px | 40px | −1.4px | 1.0 |
| Display 404 | 200px | 120px | 80px | −1.4px | 0.7 |
| H1 | 72px | 54px | 44px | −1.4px | 1.2 |
| H2 | 48px | 44px | 34px | −1px | 1.2 |
| H3 | 40px | 36px | 32px | −1px | 1.2 |
| H4 | 32px | 30px | 24px | 0 | 1.2 |
| H5 | 28px | 28px | 20px | 0 | 1.2 |
| H6 | 24px | 22px | 20px | 0 | 1.2 |

All headings: weight 600, start-aligned (Display 404 centered), paragraph spacing 40.

### Compact heading ladder

For dense sections, sidebars, and card titles — same family and weight, smaller steps:

| Style | Desktop | Tablet | Mobile |
|---|---|---|---|
| H2 SM | 32px | 30px | 26px |
| H3 SM | 32px | 28px | 24px |
| H4 SM | 30px | 26px | 22px |
| Heading SM | 22px | 22px | 20px |

### Body & UI scale

| Style | Desktop | Tablet | Mobile | Weight | Notes |
|---|---|---|---|---|---|
| Text Lead | 20px | 20px | 18px | 500 | section intros |
| Body | 18px | 18px | 16px | 500 | default paragraph |
| Text CMS | 18px | 18px | 16px | 500 | balanced wrapping on |
| Text Button | 18px | 18px | 16px | 600 | button labels |
| Text Nav | 16px | 16px | 16px | 600 | nav links |
| Text SM | 16px | 16px | 15px | 500 | supporting copy |
| Text XS | 14px | 14px | 14px | 500 | captions, meta |
| Text XS Bold | 14px | 14px | 14px | 600 | eyebrows, labels |
| Text XL Display | 86px | 72px | 60px | 700 | uppercase, 0.72 leading |

All body styles: line height 1.3, tracking 0, start-aligned. Paragraph spacing 10 for body,
20 for UI styles.

### Typography rules

- Only one H1 per page.
- Headings get balanced text wrapping. Body paragraphs cap at ~60–70 characters.
- Never mix more than three sizes in a single section.
- Eyebrow labels (Text XS Bold) sit above H2s at 10–14px distance.
- Text XL Display is uppercase with near-collapsed leading (0.72) — full-bleed statement
  moments only, one per page maximum.
- **The rung owns the weight.** Every `--text-mkt-*` step declares its own `--font-weight`, so
  markup never writes a weight utility beside a type token. Machine-enforced by
  `scripts/check-frontend-architecture.mjs`, which also bans raw Tailwind size utilities
  (`text-lg`, `text-[28px]`) anywhere on the marketing surface.

---

## 3. Spacing & Layout

### Scale

Use only these values: `6, 10, 14, 20, 30, 40, 50, 70, 80, 100, 120, 194, 200`

`80` and `120` are the mobile and tablet rungs of the responsive section rhythm
(200 → 120 → 80) below. They are section padding, so they belong on the ladder rather than
in an arbitrary bracket. `scripts/check-mkt-scale.mjs` enforces exactly this set.

### Page structure

Every page is a single vertical stack of full-width sections with **zero gap** between them.
Section padding creates all separation.

```
Page (vertical stack, gap 0, height auto)
└─ Section (width 100%, vertical padding, no max-width)
   └─ Container (max-width 1260px, centered, padding 0 30px, gap 50px)
      └─ Content
```

**The Container is non-negotiable.** Every section's content sits in a 1260px max-width, 30px
horizontally padded, centered container. Sections themselves are full-bleed so backgrounds and
decorative elements can extend edge to edge.

### Section vertical padding

| Case | Padding | `<Section>` prop |
|---|---|---|
| Hero | `194px 0 200px` | `rhythm="hero"` |
| Standard section | `200px 0` | `rhythm="base"` |
| Section continuing into the next | `200px 0 0` | `rhythm="open"` |
| Section closing a run | `0 0 200px` | `rhythm="close"` |
| Tight / secondary section | `100px 0` | `rhythm="tight"` |
| Logo strip / marquee | gap 100px, no padding | `rhythm="none"` |

### Responsive rhythm

| | Desktop | Tablet | Mobile |
|---|---|---|---|
| Section padding | 200px | 120px | 80px |
| Container padding | 30px | 24px | 20px |
| Container gap | 50px | 40px | 30px |

### Internal gaps

- Container → children: `50px` (or `10px` when the section is a single dense block)
- Heading group (eyebrow + heading + lead): `10–20px`
- Card grid: `30px` both axes
- Inside a card: `20px`
- Button rows: `20px`, wrap enabled
- Tall feature stacks: `70px`

### Grids

- Card grids: 3 columns desktop → 2 tablet → 1 mobile, using a minimum column width so they
  reflow naturally rather than a hard column count
- Row height: fit to tallest item in the row; grid children fill their cell
- When a grid collapses to one column on mobile, convert it to a vertical stack

### Breakpoints

`1200px` (desktop) / `810px` (tablet) / `390px` (phone)

---

## 4. Radii, Borders, Elevation

### Radii

| Element | Value | Token |
|---|---|---|
| Pills, buttons, badges, avatars | `100px` (fully round) | `--radius-mkt-pill` |
| Large cards, media frames, panels | `30px` | `--radius-mkt-xl` |
| Standard cards | `20px` | `--radius-mkt-lg` |
| Nested elements inside cards | `12px` | `--radius-mkt-sm` |
| Icon circles | `50%` | — |

Always step down when nesting. Never place a 20px radius inside a 20px radius.

### Borders

- Default hairline: `1px solid rgba(0,0,0,0.1)`
- On dark or gradient surfaces: `1px solid rgba(255,255,255,0.3)` (outer) /
  `rgba(255,255,255,0.1)` (inner)
- Emphasis border: `1px solid` Mist Blue
- Only one border style per component — no dashed, no double.

### Shadows

```
soft      0 4px 8px  rgba(0,0,0,0.06)
card      0 8px 16px rgba(0,0,0,0.08)
accent    0 8px 16px rgba(58,119,229,0.5)
nav       0 4px 16px rgba(0,0,0,0.20)
inner-hi  inset  4px  4px 8px rgba(255,255,255,0.1)
inner-lo  inset -4px -4px 8px rgba(255,255,255,0.1)
```

The two inset shadows are always applied **together** on gradient surfaces — they produce the
soft interior sheen that defines the button and badge look. Colored surfaces get the matching
colored outer shadow (accent gradient → `accent`, dark gradient → `nav`).

### Glass surface recipe

```
fill:            rgba(255,255,255,0.1)
border:          1px solid rgba(255,255,255,0.3)
backdrop-filter: blur(5px)
radius:          100px (pill) or 30px (panel)
padding:         6px (when wrapping another element)
```

---

## 5. Components

### 5.1 Button (primary pattern)

**Structure:** outer glass ring → inner gradient pill → label.

```
Ring:  pill, padding 6px, fill white-10, border 1px white-30, backdrop blur 5px
Pill:  radius 100px, overflow hidden, border 1px white-10,
       fill accent-gradient,
       shadows: inner-hi, inner-lo, accent
       padding 12px 30px
Label: Text Button (18px / 600), White, no wrap
```

**Variants**

| Variant | Inner fill | Label | Ring |
|---|---|---|---|
| Primary | accent-gradient | White | yes |
| Dark | dark-gradient | White | yes, border White |
| Nav | dark-gradient | White, 14px/600 | no ring, padding `10px 24px` |
| Ghost | transparent | Jet Black | border `black-10`, no ring |

**Sizes:** Desktop `12px 30px` · Nav `10px 24px` · Phone `8px 20px`

**Props:** `label`, `link`, `open in new tab`, `variant`, `onClick`

### 5.2 Icon Button (signature interaction)

Same shell as Button, plus a travelling arrow badge. Owner: `marketing-cta.css`.

```
Pill padding:  12px 54px 12px 30px   (extra right space reserves the badge)
Badge A:       31px White circle, absolute, right 8px, vertically centered
               contains a 12px dark arrow, pointing right
Badge B:       identical, absolute at left -32px, rotate -45deg
               (hidden by the pill's clipping)
```

**Hover:** badges trade places while the label shifts.

```
Badge A:  right 8px → right -32px,  rotate 0 → 45deg
Badge B:  left -32px → left 8px,    rotate -45deg → 0
Pill:     padding → 12px 30px 12px 54px
Ease:     cubic-bezier(0.44, 0, 0.56, 1)   Duration: 0.4s
```

The result reads as a single arrow travelling *through* the button. Only one badge carries the
icon in the accessibility tree; both are `aria-hidden` and the label is never duplicated.

**Variants:** Default, Dark, Nav Button (24px badge, 14px label, padding `10px 40px 10px 24px`),
Right Icon (arrow starts left, exits right). Each has a Phone size: padding `8px 44px 8px 20px`,
badge 28px.

**Props:** `title`, `link`, `open in new tab`, `icon`, `variant`, `onClick`

### 5.3 Card

```
radius:   20px (30px for feature/large cards)
fill:     White (or Light Gray Blue on white sections)
border:   1px solid black-10
shadow:   card
padding:  30px  (50px for large feature cards)
gap:      20px
```

Content order: icon or media → title (H4 SM or Heading SM) → body (Text SM) → optional link.
Icon container: 48px circle, Frost White fill, accent-colored glyph, radius 50%.
**Hover:** lift `y: -4px`, deepen shadow one step, border → Mist Blue. No scale.

### 5.4 Badge / Pill label

```
radius:  100px
padding: 6px 14px
fill:    Frost White (neutral) or semantic tint at 10%
border:  1px solid black-10 or semantic solid at 30%
label:   Text XS Bold (14px / 600)
gap:     6px  (when paired with a 14px icon)
```

Semantic badges take the **mark** hue on the border and dot, and the **`-text` sibling** on the
label (§1). Every badge keeps its text label — color never carries meaning alone.

### 5.5 Eyebrow / Pre-title

Small uppercase-feeling label above section headings.

```
label:   Text XS Bold, Slate Gray
Optional: 6px accent dot or 14px icon, gap 10px
Distance to heading below: 10–20px
```

### 5.6 Navigation — **out of scope, recorded as-is**

The top bar is explicitly excluded from this system and keeps its current construction in
`components/marketing/chrome/nav.tsx`: a fixed 72px strip, logo left, center links, dropdown
panels on `shadow-modal-value`, and a mobile drawer animated with the shared settle curve. Its
CTA uses the Nav variant of the Icon Button (§5.2), which is the one place the two systems meet.

Should the bar ever be brought into this system, the target is: glass surface (white-10 fill,
white-30 border, blur 5px), radius 100px, `nav` shadow, Text Nav links, accent on the active
route.

### 5.7 Accordion / FAQ

```
Item:     radius 20px, fill White, border 1px black-10, padding 30px, gap 20px
Question: Heading SM (22px / 600), Jet Black
Answer:   Body (18px / 500), Slate Gray
Icon:     28px circle, plus (closed) → minus (open)
```

Two variants, Open and Closed; the whole header row toggles between them. Closed hides the
answer. Transition: spring physics (500 / 60 / 1).

### 5.8 Marquee / Logo strip

```
Section gap:  100px, no vertical padding
Row:          horizontal, gap 50px, ticker velocity 20
Hover:        slow to a crawl
Edges:        fade-right and fade-left gradient masks, ~120px wide
Logos:        monochrome Soft Silver, uniform optical height, not uniform box width
```

### 5.9 Form controls

```
Input:        radius 100px (single line) or 20px (textarea)
              fill White, border 1px black-10, padding 14px 20px
              text Body, placeholder Soft Silver
Focus:        border 1px Primary Blue, shadow accent at reduced spread
Checkbox:     20px, radius 6px, checked fill accent-gradient
Label:        Text XS Bold, 10px above the field
Submit:       Icon Button, Primary variant, full width on mobile
```

Every form needs pending / success / error states on the submit button — reuse the button
variants rather than inventing new visuals.

---

## 6. Motion

### Transitions

```
entrance    spring, duration 1s, bounce 0
state       spring physics — stiffness 500, damping 60, mass 1
micro       tween cubic-bezier(0.44, 0, 0.56, 1), 0.4s
```

Never use a linear ease. Never use bounce above 0.2.

### Entrances

Every section, card, and text block uses the **same** entrance:

```
opacity: 0 → 1
y:       20px → 0
transition: spring, 1s, bounce 0
threshold: 0
replay: false
```

No scale. No rotation. No blur. No horizontal movement.

- Above the fold → trigger **on mount**
- Below the fold → trigger **on entering viewport**, animate once

**Sequencing** — delay in 0.1s steps, capped at 0.5s:

```
eyebrow   0.1s
heading   0.1s
lead      0.2s
buttons   0.3s
media     0.4s
```

For repeated items (cards, rows, logos) use **stagger** on the parent instead of per-item
delays.

**Scroll reveals stay CSS-only**, driven by `animation-timeline: view()` inside an `@supports`
guard, with elements server-rendering in their finished state. This is a hard constraint: an
earlier JS implementation swapped the server-rendered node for an opacity-zero node after
hydration and made every route visibly flash. Never introduce motion here that content depends
on to become visible.

### Hover

| Element | Change |
|---|---|
| Icon button | arrow badge swap (see 5.2) |
| Card | `y: -4px`, shadow deepens, border → Mist Blue |
| Nav link | color → Jet Black |
| Logo | Soft Silver → full color |

All hovers: `0.4s` micro tween. Maximum two properties per element.

### Ambient

- Decorative blurred blobs behind the hero: slow mirrored loop, parallax ~110% scroll speed,
  always behind content at the lowest layer
- Marquees: ticker velocity 20, pause offscreen, slow on hover
- Nothing loops fast enough to compete with copy for attention

### Text motion

Word-by-word reveal is permitted on the **hero headline only**. All other text animates as a
single block.

### Accessibility

Respect reduced-motion preferences: disable transforms and tickers, keep opacity fades.

---

## 7. Page Composition

### Section recipe

```
eyebrow (Text XS Bold)
heading (H2)
lead paragraph (Text Lead, max ~65ch)
── 50px ──
content: grid of cards / media / steps
── 50px ──
optional CTA (Icon Button)
```

### Typical page order

1. **Hero** — H1, lead, two buttons (Primary + Ghost), decorative blurred blobs, padding
   `194px 0 200px`
2. **Logo strip** — marquee, gap 100px
3. **About / value** — alternating text + media, padding `200px 0 0`
4. **Capabilities** — card grid, 3 columns, padding `200px 0`
5. **Steps / how it works** — numbered horizontal steps, padding `0 0 200px`
6. **Integrations** — icon grid, padding `200px 0 100px`
7. **Testimonials** — card grid or carousel
8. **Pricing** — 3 tiers, middle tier highlighted with accent gradient
9. **FAQ** — accordion list
10. **CTA band** — dark-gradient panel, radius 30px, inset inside the container
11. **Footer** — multi-column links, social icons, legal row

### Anti-patterns

- No section without the 1260px container
- No arbitrary spacing values outside the scale
- No new colors outside the palette
- No accent gradient used as a large background
- No hover effect that scales an element
- No entrance animation with a distance greater than 20px
- No more than one Display XL or Text XL Display per page

---

## 8. What is machine-enforced

Guards exist for **properties that stay true across a redesign** — ratios, ordering, budgets,
structure. They deliberately do **not** freeze individual color or size values: retuning a hue
or a step is a design decision and must not require a test edit.

| Guard | What it holds |
|---|---|
| `app/globals.test.ts` §5 | every text role ≥ 4.5:1 on paper and on each band fill; every mark ≥ 3:1; every state hue has a `-text` sibling. Values are read live from the token file. |
| `scripts/check-design-tokens.mjs` | the token **name set** exists (a renamed `@theme` key silently drops utilities across the site) |
| `scripts/check-frontend-architecture.mjs` | line budgets per file owner; no raw Tailwind size utilities on the marketing surface; no weight utility beside a type rung; no app heading tokens leaking in |
| `scripts/check-mkt-scale.mjs` | the spacing ladder (§3) and shape scale (§4) — every `p`/`m`/`gap`/`rounded` utility must land on a rung, and arbitrary bracket values are rejected outside a narrow layout allowlist. It also asserts every `--text-mkt-*` rung is registered with tailwind-merge in `lib/utils.ts`: an unregistered rung is classified as a colour and **silently deleted** wherever a text colour sits beside it. |
| `scripts/check-token-escapes.mjs` | no raw hex in components — hex lives only in the theme files |

If a new section needs CSS in the theme file, it needs a **primitive** instead. That is the
rule the line budgets exist to force; when a genuinely new *concern* arrives, give it an owner
rather than raising a ceiling.
