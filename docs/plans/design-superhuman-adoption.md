# Adopting Superhuman practices into Searchify's design

**Status: IMPLEMENTED** on `design/superhuman-adoption` · **Scope:** marketing site + app

> **What actually shipped**, and where reality diverged from the proposal below.
> Phases 1, 2, 3 and 6 landed as written. Phases 4 and 5 changed once the code
> was in front of me:
>
> - **Phase 2 forced a file split.** The scroll CSS pushed `marketing-theme.css`
>   past its 400-line budget, and that guard says in so many words *"do not
>   raise this number."* Motion moved to a new `marketing-motion.css` (budget
>   260) instead. Better outcome than the plan assumed — motion and tokens are
>   genuinely different concerns.
> - **Phase 4's payload claim is UNVERIFIED.** Both font configs produced
>   byte-identical build output here (`next/font` served Manrope from cache), so
>   the "measure it" step could not be completed. The variable font shipped with
>   an explicit revert instruction in `app/layout.tsx`. Check it on a real
>   deploy.
> - **Phase 5 was wrong as written and was narrowed.** It proposed making cards
>   border-only. `components/ui/card.tsx` documents why that fails: light-mode
>   panel `#FFFFFF` and base `#F7F8FA` differ so little that the shadow is the
>   only thing making surfaces read as layered. Removing it flattens the app.
>   What shipped is the *real* defect — every `--shadow-N` carried a `0 0 0 1px`
>   ring that double-drew the border every card already has. Rings dropped in
>   light mode; **dark mode keeps its ring deliberately** (there it is a warm
>   light catchlight with no border duplicating it).
>
> Verified: 108 test files / 1003 tests pass, `tsc` and `eslint` clean, all
> three architecture guards pass, production build compiles.

Reference: [`nexu-io/open-design` → `design-systems/superhuman`](https://github.com/nexu-io/open-design/tree/main/design-systems/superhuman)
(`DESIGN.md`, `tokens.css`), demo build at [design-demos/superhuman-landing.html](../../design-demos/superhuman-landing.html).

Searchify already has a coherent creative system ("Proof": paper `#f5f5f0`, ink
`#151715`, proof blue `#1668e8`) with machine-enforced contrast and a documented
rationale for nearly every value. **This plan does not touch the palette or the
brand.** It borrows the four things Superhuman does better than us — display
type discipline, scroll choreography, elevation restraint, and keyboard-first
velocity — and leaves everything else alone.

---

## Constraints that shape every phase

These are hard and already enforced in CI; read them before writing code.

| Guard | Rule | Headroom today |
|---|---|---|
| `scripts/check-frontend-architecture.mjs` | `marketing-theme.css` ≤ 400 lines | **374 → 26 lines spare** |
| same | `app/globals.css` ≤ 1020 lines | **1005 → 15 lines spare** |
| `scripts/check-design-tokens.mjs` | no raw hex in `.ts`/`.tsx` | — |
| `app/globals.test.ts` | every documented text/surface pair ≥ 4.5:1, both themes | — |

Phase 2 is the only phase that adds CSS to `marketing-theme.css`, and it fits in
the 26-line budget with ~8 to spare. If a later phase needs more, raise the
budget in the guard deliberately rather than by accident.

Also non-negotiable, from [`reveal.tsx`](../../frontend/components/marketing/primitives/reveal.tsx):

> *"Earlier versions swapped a server-rendered div for an opacity-zero motion
> node after hydration, making every route visibly flash."*

Whatever we do about scroll animation **must not reintroduce a hydration swap.**
That constraint drives the entire Phase 2 approach.

---

## Phase 1 — Fix the display scale (the headline complaint)

**Files:** `frontend/app/(marketing)/marketing-theme.css` (token block only)
**Component changes:** none · **Risk:** very low · **Effort:** ~30 min

You're right that headlines are too big. Here are the actual numbers.

| Token | Today | Renders | Superhuman equivalent |
|---|---|---|---|
| `--text-mkt-d1` | `clamp(2.75rem, 5.2vw, 4.5rem)` | **44px → 72px** | 64px, stepping 48 → 36 |
| `--text-mkt-d2` | `clamp(2.25rem, 4.2vw, 3.75rem)` | **36px → 60px** | 48px |
| `--text-mkt-d3` | `clamp(1.75rem, 2.6vw, 2.25rem)` | 28px → 36px | 28px |

Two separate problems:

1. **The ceiling is 12% over** (72px vs 64px) — noticeable, but the smaller issue.
2. **The floor is 22% over** (44px vs 36px). This is the real damage. `hero.tsx`
   caps the h1 at `max-w-[16ch]`, so at 390px viewport a 44px Manrope headline
   wraps to four or five very short lines. Superhuman drops to 36px precisely to
   keep the compressed 0.96 leading readable as a block instead of a column.

**Tracking is the hidden third problem.** `--text-mkt-d1--letter-spacing` is
`-0.055em` — at 72px that's **−3.96px**. Superhuman's own spec is `0px` at the
64px Display Hero and `−1.32px` at the 48px Section Display (`−0.0275em`). We
are roughly twice as tight at every step, which is why the headlines read as
*both* oversized and cramped — a combination that always looks like a mistake.

Proposed replacement (drops in verbatim; every step lands on Superhuman's
64 / 48 / 36 ladder at the standard breakpoints):

```css
--text-mkt-d1: clamp(2.25rem, 4.6vw, 4rem);        /* 36 → 64px */
--text-mkt-d1--line-height: 0.96;                   /* keep — already correct */
--text-mkt-d1--letter-spacing: -0.03em;             /* was -0.055em */
--text-mkt-d2: clamp(1.875rem, 3.4vw, 3rem);       /* 30 → 48px */
--text-mkt-d2--line-height: 1;
--text-mkt-d2--letter-spacing: -0.0275em;           /* Superhuman verbatim */
--text-mkt-d3: clamp(1.5rem, 2vw, 1.75rem);        /* 24 → 28px */
--text-mkt-d3--letter-spacing: -0.0225em;           /* = -0.63px / 28px */
```

`--line-height: 0.96` on d1 is already exactly right — that is Superhuman's
signature compression and it should not change.

Because all thirteen call sites use the `text-mkt-d1` / `text-mkt-d2` utilities
(verified by grep — no ad-hoc sizes), this is a pure token edit. Re-check the
three heroes that set `max-w-[16ch]`; at 64px they may now want `18ch`.

---

## Phase 2 — Scroll choreography, without the flash

**Files:** `marketing-theme.css` (+~18 lines), `primitives/reveal.tsx` (rewrite)
**Risk:** low · **Effort:** ~half a day including a visual pass

`Reveal`, `StaggerGroup` and `StaggerItem` are currently pass-through `<div>`s.
Nothing animates on scroll anywhere except three cards in `compositions.tsx`.

**The codebase already contains the correct solution and only applied it once.**
`marketing-theme.css:207` drives `.mkt-flow-stage` with a CSS scroll-driven
animation:

```css
@supports (animation-timeline: view()) {
  .mkt-flow-stage { animation: mkt-flow-stage-in linear both; animation-timeline: view(); }
}
```

This is exactly right and sidesteps the flash bug by construction: the element
server-renders in its final visible state, and the animation only ever runs in
browsers that support view timelines. There is no JS, no hydration boundary, and
no opacity-0 initial state to get stuck on. Generalise it:

```css
/* Scroll choreography. Content renders visible and animates only where
   supported — no SSR→hydration swap, so no flash (see reveal.tsx). */
@supports (animation-timeline: view()) {
  @media (prefers-reduced-motion: no-preference) {
    [data-mkt-reveal] {
      animation: mkt-reveal-in linear both;
      animation-timeline: view();
      animation-range: entry 0% entry 60%;
    }
    [data-mkt-reveal='stagger'] > * {
      animation: mkt-reveal-in linear both;
      animation-timeline: view();
      animation-range: entry 5% entry 65%;
    }
  }
}

@keyframes mkt-reveal-in {
  from { opacity: 0; transform: translateY(14px); }
}
```

`Reveal` then becomes `<div data-mkt-reveal className={className}>` and
`StaggerGroup` becomes `<div data-mkt-reveal="stagger">` — same DOM shape, same
SSR output, zero new dependencies (`motion` stays for the nav only).

Two properties worth noting: an element already above the fold is past its
`entry` range at load, so it renders finished and the hero never animates —
which is what you want. And the stagger is genuine per-child offset driven by
each child's own scroll position, not a timed cascade, so it never runs ahead of
the scroll.

**Verify before building:** confirm current `animation-timeline: view()` support
across your target browsers. The `@supports` guard means non-supporting browsers
get today's static page exactly — so this is a strict improvement with no
regression path, but it does mean the effect may not be universal.

Not needed: the demo's sticky-nav background transition. `nav.tsx:73–105`
already implements `scrolled` state with a `data-scrolled` attribute.

---

## Phase 3 — Give the first screen to the product

**Files:** `landing/hero.tsx` · **Risk:** low · **Effort:** ~1 hour

`hero.tsx:15` reserves `min-h-[calc(100svh-var(--spacing-mkt-nav))]` for a
centred headline, two buttons and a note. Superhuman's rule — *"let product
screenshots be the primary visual content; the UI sells itself"* — spends that
same first screen on headline **and** product, so the viewer sees what they'd be
buying before the first scroll.

Reduce the hero to roughly `76svh` so the top edge of the workspace scene sits
just inside the fold. Combined with Phase 2, the scene then completes its reveal
as the user scrolls into it — the "cinematic curtain-lift" effect, which is the
single highest-impact thing the reference does.

---

## Phase 4 — Weights between weights (optional, high polish)

**Files:** `app/layout.tsx`, `marketing-theme.css` · **Risk:** low

Superhuman's most-cited signature is its non-standard weight axis: body at
**460**, display at **540** — deliberately between Regular and Medium. `DESIGN.md`
calls this "the typographic signature that feels confident, never bold."

We can't get it today: [`layout.tsx:31`](../../frontend/app/layout.tsx#L31) pins
Manrope to `weight: ['400','500','600','700']`, which makes `next/font` serve
four static instances. Omitting `weight` loads the variable font instead, after
which `font-variation-settings: 'wght' 540` becomes available on the display face.

Marketing headings currently use `font-medium` (500). Moving display to 540 and
marketing body to 460 is a small, reversible change with a disproportionate
effect on how considered the type looks. Measure the payload delta — the
variable font may be larger than four static cuts, and if it is, this phase is
not worth it.

---

## Phase 5 — App: elevation restraint

**Files:** `app/globals.css` (token values only) · **Risk:** medium (visual, wide blast radius)

Superhuman: *"Depth comes from borders, color contrast, and photography, not
box-shadows."* Its entire raised tier is `0 2px 12px rgba(41,40,39,0.06)`.

Searchify's `--shadow-1..4` each stack a drop shadow **plus** a `0 0 0 1px` ring,
and `--shadow-3` (the `elevated` alias, used on cards) is a three-layer stack.
In a dense analytics UI this reads as visual noise: every panel competes for the
same foreground plane.

Proposal — **borders carry containment, shadow means "floating above the page":**

- Cards and panels: `1px solid var(--border)`, no drop shadow.
- Keep `--shadow-3`/`--shadow-4` for genuine overlays only — dialogs, dropdowns,
  popovers, the command palette from Phase 6.
- Drop the `0 0 0 1px` ring from `--shadow-1`/`--shadow-2` where a real border is
  already present (currently it double-draws the edge).

Do this as a token-value change so it lands everywhere at once and reverts in one
commit. It needs a screenshot review across Visibility, Site health and Commerce
before merge — this is the highest-risk phase in the plan.

---

## Phase 6 — App: keyboard-first velocity (⌘K)

**Files:** new `components/ui/command-palette.tsx`, wired in `app-shell.tsx`
**Risk:** low (additive) · **Effort:** 2–3 days

Confirmed by grep: there is no command palette, no `cmdk`, and no global
`metaKey` handler anywhere in the frontend.

Superhuman's actual product identity is not the purple — it's that **everything
is reachable from the keyboard**. For an app with 12 nav destinations, N projects,
and runs/prompts/pages as addressable objects, a ⌘K palette over routes, projects
and recent runs is worth more than every visual change in this document combined.
Radix primitives are already a dependency, so this needs no new UI library.

---

## What we should deliberately **not** copy

Recording these so nobody "finishes the job" later:

- **The purple.** Mysteria `#1b1938` and Lavender `#cbb7fb` belong to Superhuman.
  Proof blue is ours, it's contrast-verified, and it means something specific
  (evidence). The demo HTML is a study of the *system*, not a proposed rebrand.
- **The 16px body / 20px heading marketing scale, inside the app.** Searchify's
  app scale (11/12/13/14/15/17/26/48) is correctly tuned for data density.
  Superhuman is an email client marketing page; we are a dashboard. Importing its
  type scale into `(app)` routes would be a straight downgrade.
- **The two-radius binary system, inside the app.** 8px/16px works for a
  marketing page with ~5 component types. The app's 4/6/8/12/16 ladder is doing
  real work across tables, chips, cards and modals.
- **Colour restraint taken literally.** Superhuman can afford one accent because
  it displays no data. Our chart palette, score bands, run statuses and citation
  classes all *encode* meaning. The transferable half of the principle is
  narrower and still worth auditing: **colour should never be decoration** — if a
  hue isn't carrying data, it shouldn't be there.

---

## Suggested order

Phases 1 → 2 → 3 are one coherent piece of work (~2 days) and address exactly
what you flagged: headline sizing and scroll animation. Ship them together and
review the marketing site before deciding on the rest.

Phase 6 is independent of everything else and is probably the highest-value item
in the document; it can start in parallel.

Phases 4 and 5 are polish — do them last, and drop Phase 4 entirely if the
variable-font payload doesn't justify itself.
