# Marketing design refresh — Geist/Instrument type system, dark close, reference parity

> Active plan for the public marketing surface. Approved by the product owner on
> 2026-09-06. This file is the reference point for the redesign; implementation
> proceeds in the phases below, each independently shippable.

## Resolved decisions

- **Display face:** Public and focused-flow display roles use **Instrument
  Serif**. It is a 400-only face, so its 700 display treatment is deliberately
  browser-synthesised.
- **Body/UI face:** **Geist Variable** (`wght 100–900`) carries public and
  focused-flow body, labels, nav, and the `mono`/tabular role. The authenticated
  product uses Geist exclusively, including product headings. The retired
  Remus and Uncut assets have no runtime references.
- **Accent:** terracotta stays for now. The crimson swap is a later, larger
  decision.
- **Page arc:** bands deepen down the page and the marketing surface closes on
  the deep-teal CTA band, followed by the light footer. The teal token rebind
  owns inverse text and actions; no component hand-picks dark colours or adds
  a rounded shoulder.
- **Product canvas (SeeIt):** structure and copy stay as shipped (Direction A
  canvas). Only *effects* are added: hue-bloomed ambient ground, cast shadow,
  bottom bleed fade, quiet row hover, coloured delta pills inside the
  illustrative ledger.
- **Motion:** GSAP + ScrollTrigger are removed. Reveals become CSS
  `animation-timeline: view()` longhands behind `@supports` and
  `no-preference` guards — content is SSR-visible and never hidden where the
  timeline is unsupported. Stagger shifts `animation-range`, never
  `animation-delay`. The animation **shorthand is banned** for scroll timelines
  (minifier folds `animation-timeline` into it and the animation dies); use
  longhands only. `motion/react` (LazyMotion) stays for the nav.
- **Hues:** no hue-tinted sections (there are no product sections to colour).
  Hue appears only inside the product canvas effects and as quiet tints in
  cards — never as an action colour, never tacky.
- **Topbar:** desktop dropdown restyled to the ai.cube27 header — white 20px
  panel with layered shadow, items on 14px-radius rows with band-fill hover,
  option names in black (foreground) display type at 500, promise line muted,
  rotating chevron, pill hover fill on triggers; mobile menu becomes a
  full-viewport sheet. Keyboard and focus handling preserved.
- **Out of scope:** crimson accent swap, hue-tinted full sections, product
  canvas restructure.

## Phases

1. **Type foundation** — Geist + Instrument `next/font/local` declarations;
   Geist owns the product and all body/UI roles, while Instrument Serif owns
   public and focused-flow display roles. The legacy Remus/Uncut assets and
   variables are removed; `docs/design.md` owns the current role ladder.
2. **Motion debt** — CSS reveal engine replaces `gsap-reveal-initializer`;
   hero entrance and animated price ported off GSAP; `gsap`/`@gsap/react`
   removed; LazyMotion retained.
3. **Teal close** — the `teal` section tone and one-place teal token rebind;
   FinalCta closes on teal and the footer resolves to light paper.
4. **Topbar + dropdown** — reference parity per the decisions above.
5. **Product canvas effects** — blooms, cast shadow, bleed, hovers, delta
   colours; no structural or copy changes.
6. **Page sweep** — solutions, enterprise, pricing, compare (+detail), faq,
   blog (+post), legal (ai-policy/cookies), docs/mcp: band arcs, quiet button
   variant, 50px marketing pill, draw-in underline TextLink with `stretch`
   card links, 10/14/20 radius ladder, `page-hero`/`trust-strip` restyle.
7. **Governance + validation** — design.md sections (fonts, tracking, bands,
   dark rebind, motion); `check.ps1`, `test.ps1`, `pnpm build`; visual passes
   desktop + mobile across all marketing routes.

## Notes

- `docs/design.md`'s typography-table size column predates this plan and is
  known-drifty; the weight column was corrected to 500 during the 2026-09-06
  landing work. Reconcile sizes during phase 7.
- The marketing band ramp introduces tones beyond paper/sunken; `docs/design.md`
  §Colour must be updated in the same slice that ships them.
- Reference values (ai.cube27): tracking display −0.045em / h2 −0.034em /
  h3 −0.028em / h4 −0.02em / lead −0.018em / body −0.011em; radius 10/14/20/28;
  shadows `0 2px 8px 6%` + `0 24px 56px −20px 28%`; dropdown item hover on the
  band tint.
