# 002 — Fix desktop navigation motion

- **Status**: DONE
- **Commit**: 6c3dcd9
- **Severity**: HIGH
- **Category**: Performance / physicality / frequency
- **Estimated scope**: 1 file, roughly 35 lines

## Problem

The signature nav lens animates layout width for 700ms on every hover/focus traversal, and the trigger-anchored dropdown scales from its default center. The dropdown also uses Motion `y`/`scale` shorthands instead of a full transform.

```tsx
// frontend/components/marketing/chrome/nav.tsx:225 — current
<span
  aria-hidden
  style={{ transform: `translateX(${lens.left}px)`, width: lens.width }}
  className={cn(
    'border-mkt-line bg-mkt-surface shadow-mkt-raised rounded-mkt-xs pointer-events-none',
    'ease-mkt-out absolute inset-y-0 left-0 border transition-[transform,width] duration-700',
  )}
/>
```

```tsx
// frontend/components/marketing/chrome/nav.tsx:293 — current
<motion.div
  layout
  initial={{ opacity: 0, y: 8, scale: 0.97 }}
  animate={{ opacity: 1, y: 0, scale: 1 }}
  exit={{ opacity: 0, y: 8, scale: 0.97 }}
```

## Target

- Preserve the documented sliding lens, but use Motion FLIP (`layout`) for its geometry instead of a CSS width transition.
- Lens layout duration: 180ms with `[0.16, 1, 0.3, 1]`; no `transition-[width]` and no 700ms timing.
- Dropdown enter: `opacity: 0; transform: translateY(8px) scale(0.97)` to settled, using the existing spring `{ type: 'spring', stiffness: 320, damping: 34, mass: 0.7 }`.
- Dropdown exit returns to the same state.
- Compute transform origin at the active trigger's horizontal center and the panel's top: `${originX}px top`, including when the panel is viewport-clamped.
- Reduced motion: suppress the decorative lens as today; dropdown uses opacity only for 140ms, without translation or scale.
- Content swaps use opacity for 140ms with `[0.16, 1, 0.3, 1]`, including reduced motion.

## Repo conventions to follow

- `motion/react` is already imported in `frontend/components/marketing/chrome/nav.tsx`.
- Proof's JavaScript easing tuple is `[0.16, 1, 0.3, 1]`, matching `--ease-mkt-out`.
- `anchorPanel` already owns trigger and clamping geometry; extend that owner to set origin rather than measuring elsewhere.

## Steps

1. Add a local `EASE_OUT = [0.16, 1, 0.3, 1] as const` and a `panelOriginX` numeric state beside `panelLeft`.
2. In `anchorPanel`, compute `panelOriginX` as `triggerBox.left + triggerBox.width / 2 - clamped` and update it in the same event as `panelLeft`.
3. Replace the lens `<span>` with `<motion.span layout={!reduceMotion}>`. Set final `left` and `width` styles directly; remove the CSS transform/width transition. Give Motion's `layout` transition 180ms on `EASE_OUT`.
4. Keep the existing reduced-motion behavior that never creates the lens.
5. Replace dropdown `y` and `scale` shorthands with full `transform` strings and add `transformOrigin: `${panelOriginX}px top`` to its style.
6. Branch the dropdown states for reduced motion: opacity-only initial/exit and 140ms `EASE_OUT`; retain the existing spring for standard motion.
7. Replace the content swap's built-in `'easeOut'` with `EASE_OUT`; use 140ms opacity under both settings.
8. Update or add focused assertions in `frontend/components/marketing/chrome/nav.test.tsx` only where DOM behavior changed; do not assert implementation-private Motion styles.

## Boundaries

- Do NOT change navigation content, hover intent, close delay, breakpoints, authentication queries, panel widths, or ARIA behavior.
- Do NOT remove the documented lens or add dependencies.
- Do NOT animate width with CSS or use Motion `x`, `y`, or `scale` shorthands.
- If the current excerpts have drifted since commit `6c3dcd9`, STOP and report instead of improvising.

## Verification

- **Mechanical**: from `frontend/`, run `pnpm test -- components/marketing/chrome/nav.test.tsx`, `pnpm lint`, and `pnpm build`; all must pass.
- **Feel check**: traverse Platform → Solutions → Resources quickly. The lens must keep up and never continue gliding after the pointer settles. Spam between triggers and confirm motion retargets instead of restarting. At 10% playback, the dropdown must grow from the active trigger; repeat near the viewport edge to verify the clamped origin.
- Toggle reduced motion: no lens should render, while dropdown opacity still bridges its state without positional movement.
- **Done when**: the 700ms CSS width animation and shorthand transforms are gone, the lens remains cohesive, and dropdown origin tracks the trigger.
