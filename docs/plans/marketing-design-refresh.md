# Marketing design refresh — Remus type system, dark close, reference parity

> Active plan for the public marketing surface. Approved by the product owner on
> 2026-09-06. This file is the reference point for the redesign; implementation
> proceeds in the phases below, each independently shippable.

## Resolved decisions

- **Display face:** Uncut Sans stays. Its variable file was declared without a
  `weight` descriptor, so every 500/600 heading was browser-synthesised bold —
  the "broken typography" report. Fixed by declaring the real range (300–700).
- **Body/UI face:** Inter is replaced by **Remus Variable** (TeX Gyre Heros
  lineage, `wght 400–700`), copied from the ai.cube27 project. Uncut Sans
  remains the only display face; Remus carries body, labels, nav, and the
  `mono`/tabular role. No third family, no italics.
- **Accent:** terracotta stays for now. The crimson swap is a later, larger
  decision.
- **Page arc:** bands deepen down the page and the marketing surface **closes
  on a dark band** — FinalCta and footer on a dark ground (`#16161a`, lighter
  than black) with a 28px rounded top shoulder, using a one-place dark token
  rebind (`.on-dark` pattern), never hand-picked dark colours at call sites.
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
- **Out of scope:** crimson accent swap, single-family font swap, hue-tinted
  full sections, product canvas restructure.

## Phases

1. **Type foundation** — weight-range fix; Remus asset + `next/font/local`
   declaration; `--font-inter` → Remus everywhere (`globals.css`,
   `website-type.css`, component references); tracking ramp per role
   (body −0.011em, lead −0.018em, small/feature −0.02em, section −0.028em,
   page/hero −0.035…−0.045em); design.md typography section rewritten.
2. **Motion debt** — CSS reveal engine replaces `gsap-reveal-initializer`;
   hero entrance and animated price ported off GSAP; `gsap`/`@gsap/react`
   removed; LazyMotion retained.
3. **Dark close** — `deep`/`dark` section tones, dark token rebind,
   `accent-dark`, FinalCta + footer on dark with 28px shoulders.
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
