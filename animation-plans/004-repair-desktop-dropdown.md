# 004 — Repair desktop dropdown stability

- **Status**: DONE
- **Commit**: 6c3dcd9
- **Severity**: HIGH
- **Category**: Feel-breaking regression / interruptibility
- **Estimated scope**: 2 files, roughly 35 lines removed

## Problem

The desktop dropdown combines Motion `layout` with an explicit animated `transform` on the same element. In a real pointer path the panel can flicker or collapse before its links remain visible. The current browser test only checks visibility immediately after trigger hover; it never moves into the panel and waits.

```tsx
// frontend/components/marketing/chrome/nav.tsx — current regression
<motion.div
  layout
  initial={{ opacity: 0, transform: 'translateY(8px) scale(0.97)' }}
  animate={{ opacity: 1, transform: 'none' }}
  ...
>
```

## Target

- Desktop dropdown panels render without open/close or resize animation. High-frequency navigation prioritizes stability and immediacy.
- Preserve the separate 180ms decorative lens, navigation contents, anchoring/clamping, hover intent, ARIA, keyboard focus, and Escape behavior.
- Increase the pointer close grace period from 140ms to 220ms so moving from trigger into the panel is forgiving.
- Remove the now-unused `panelOriginX` state and calculation.
- Add a Playwright regression check that moves from each trigger into its first menu item, waits 500ms, and asserts the panel remains visible.

## Steps

1. In `frontend/components/marketing/chrome/nav.tsx`, change `scheduleDropClose` from 140ms to 220ms.
2. Remove `panelOriginX` state and its calculation in `anchorPanel`.
3. Replace the desktop dropdown `motion.div` with a plain `div`; remove `layout`, transform states, transition, and transform origin.
4. Replace the inner keyed `motion.div` with a plain `div`; content should be immediately legible.
5. Keep `AnimatePresence` because the mobile menu and icon still use it.
6. In `frontend/e2e/landing-nav.spec.ts`, after checking each panel count, hover the first `menuitem`, wait 500ms, and assert the panel is still visible before continuing with focus/Escape checks.

## Boundaries

- Do NOT change the mobile menu, CTA, lens, content, widths, breakpoints, API queries, or destinations.
- Do NOT add dependencies.
- The dropdown itself must have no entrance/exit/resize animation after this repair.

## Verification

- Run `pnpm test -- components/marketing/chrome/nav.test.tsx`.
- Run `pnpm exec playwright test e2e/landing-nav.spec.ts --grep "desktop dropdowns"` and require it to pass in Chromium.
- Run `pnpm lint` and `pnpm build`.
- At desktop width, hover Platform, move into multiple links, and pause; the panel must remain fully visible. Move rapidly across all triggers; content must switch immediately without blinking.
