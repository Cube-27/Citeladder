# 001 — Tighten CTA feedback

- **Status**: DONE
- **Commit**: 6c3dcd9
- **Severity**: MEDIUM
- **Category**: Purpose & frequency / physicality
- **Estimated scope**: 1 file, under 15 lines

## Problem

The canonical marketing CTA makes a frequent hover interaction run for 450ms and has no press state. The control can remain visually lifted while it is being pressed.

```tsx
// frontend/components/marketing/primitives/button.tsx:32 — current
const BASE =
  'inline-flex items-center justify-center gap-2.5 border border-transparent font-bold ' +
  'transition-[transform,background-color,border-color,box-shadow] duration-[450ms] ' +
  'ease-mkt-out hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-40 ' +
  '[&_svg]:transition-transform [&_svg]:duration-[450ms] [&_svg]:ease-mkt-out ' +
  'hover:[&_svg]:translate-x-0.5';
```

## Target

- Use the existing `--ease-mkt-out: cubic-bezier(0.16, 1, 0.3, 1)` curve.
- Make transform feedback 140ms.
- On fine pointers only, retain the 2px hover lift and icon nudge.
- On press, settle to `translateY(0) scale(0.98)`; the parent transform supplies the icon feedback.
- Keep color/border/shadow transitions at 200ms and do not add a dependency.
- Under reduced motion, keep the small 0.98 tactile scale but remove hover travel.

## Repo conventions to follow

- Proof motion uses `ease-mkt-out` from `frontend/app/(marketing)/marketing-theme.css:140`.
- The marketing primitive remains the single owner for every CTA intent and size.
- Use Tailwind arbitrary media variants for `@media (hover: hover) and (pointer: fine)`; do not add component CSS.

## Steps

1. In `frontend/components/marketing/primitives/button.tsx`, split the base transition so transform uses 140ms and visual colors/shadows use 200ms.
2. Gate `hover:-translate-y-0.5` and `hover:[&_svg]:translate-x-0.5` behind `@media (hover: hover) and (pointer: fine)`.
3. Add `active:[transform:translateY(0)_scale(0.98)]` with a 140ms transform transition. Do not add independent icon press motion.
4. Update the comment above `BASE` so it describes responsive hover and press feedback rather than a long 450ms lift.

## Boundaries

- Do NOT change CTA markup, intents, sizes, destinations, colors, or shadows.
- Do NOT add CSS outside the primitive or add dependencies.
- If the current excerpt has drifted since commit `6c3dcd9`, STOP and report instead of improvising.

## Verification

- **Mechanical**: from `frontend/`, run `pnpm lint`, `pnpm test -- components/marketing/chrome/nav.test.tsx`, and `pnpm build`; all must pass.
- **Feel check**: hover a CTA with a mouse, press and hold, then release. The hover lift should settle quickly; press should move the button back to the page with a subtle 0.98 scale. Touch emulation must not create hover travel. At 10% playback, transform must finish before it feels detached from the pointer.
- Toggle reduced motion and confirm the press scale remains but hover travel is absent.
- **Done when**: no 450ms CTA or icon transition remains, motion is fine-pointer-gated, and press feedback is visible without moving layout.
