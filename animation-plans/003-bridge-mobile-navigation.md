# 003 — Bridge mobile navigation state

- **Status**: DONE
- **Commit**: 6c3dcd9
- **Severity**: MEDIUM
- **Category**: Missed opportunity / spatial consistency
- **Estimated scope**: 2 files, roughly 45 lines

## Problem

The occasional mobile menu teleports below the fixed nav because the full surface flips `hidden`; the Menu/X icon hard-swaps at the same moment.

```tsx
// frontend/components/marketing/chrome/nav.tsx:371 — current trigger
{mobileOpen ? (
  <X className="size-4" aria-hidden />
) : (
  <Menu className="size-4" aria-hidden />
)}
```

```tsx
// frontend/components/marketing/chrome/nav.tsx:388 — current panel
<div
  id="mobile-menu"
  hidden={!mobileOpen}
  className="border-mkt-line bg-mkt-paper-raised px-mkt-gutter ..."
>
```

## Target

- Keep `aria-expanded`, `aria-controls`, Escape handling, and all menu contents unchanged.
- Use `AnimatePresence` for the conditional panel.
- Enter from `opacity: 0; transform: translateY(-8px) scale(0.98)` to settled in 220ms using `[0.16, 1, 0.3, 1]`.
- Exit toward the same top edge in 160ms using the same curve.
- Reduced motion uses opacity only in 140ms.
- Menu and X crossfade in place over 140ms with no rotation or scale.
- Only transform and opacity animate; the panel remains immediately interactive.

## Repo conventions to follow

- The file already imports `AnimatePresence`, `motion`, and `useReducedMotion`.
- Use the `EASE_OUT` constant introduced by plan 002.
- Preserve the existing `lg:hidden` breakpoint and Proof token classes.

## Steps

1. Wrap the Menu/X conditional in `AnimatePresence initial={false}` and render each icon inside a keyed `motion.span` occupying the same grid cell. Crossfade opacity over 140ms on `EASE_OUT`.
2. Replace `hidden={!mobileOpen}` with `AnimatePresence initial={false}` around a conditional `motion.div`, retaining `id="mobile-menu"` only on the rendered panel.
3. Use full transform strings for standard-motion enter/exit. Under reduced motion, use `transform: none` and opacity only.
4. Keep enter and exit asymmetric: 220ms enter, 160ms exit. Do not animate height, max-height, padding, top, or borders.
5. Update `frontend/components/marketing/chrome/nav.test.tsx` to await removal after close where AnimatePresence makes it asynchronous. Retain existing ARIA and keyboard assertions.

## Boundaries

- Depends on plan 002's `EASE_OUT` constant; execute after plan 002.
- Do NOT animate nested mobile accordions in this plan.
- Do NOT alter menu structure, labels, destinations, breakpoints, scroll behavior, or auth/project logic.
- Do NOT add dependencies or new CSS.
- If the current excerpts have drifted since commit `6c3dcd9`, STOP and report instead of improvising.

## Verification

- **Mechanical**: from `frontend/`, run `pnpm test -- components/marketing/chrome/nav.test.tsx`, `pnpm lint`, and `pnpm build`; all must pass.
- **Feel check**: at a mobile viewport, open and close the menu repeatedly. It should appear connected to the top nav and leave by the same edge. The icon must crossfade without rotating. At 10% playback, there must be no layout-property animation and no double-exposed icon beyond the crossfade.
- Toggle reduced motion and confirm a short opacity bridge remains with no translation or scale.
- **Done when**: the panel no longer uses `hidden` for open/close, standard motion is spatially coherent, and reduced motion is opacity-only.
