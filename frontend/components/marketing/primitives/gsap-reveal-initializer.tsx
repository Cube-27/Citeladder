'use client';

import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useReducedMotion } from 'motion/react';
import { useSyncExternalStore } from 'react';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
  /**
   * Mobile browsers collapse and re-expand the URL bar DURING a scroll, which
   * fires `resize` and makes ScrollTrigger re-measure every trigger mid-
   * gesture. Triggers then fire against stale start positions and the page
   * appears to settle onto a different offset once the finger leaves.
   *
   * `ignoreMobileResize` tells ScrollTrigger to ignore the viewport-height-only
   * resize that the URL bar produces, while still refreshing on a real
   * orientation change or a width change.
   */
  ScrollTrigger.config({ ignoreMobileResize: true });
}

/**
 * Whether a horizontal entrance is allowed at the current width.
 *
 * Below the tablet breakpoint a horizontal translate would move content past
 * the gutter and open a sideways scroll on a phone, so the narrow layout fades
 * without moving. This is a SUBSCRIPTION rather than a one-off read: rotating a
 * tablet, or dragging a desktop window across 768px, must rebuild the tweens
 * with offsets that match the viewport the reader is actually looking at.
 *
 * The server snapshot is `false` — the conservative side, since a reveal that
 * only fades is correct at every width.
 */
const HORIZONTAL_QUERY = '(min-width: 768px)';

function subscribeToHorizontal(onStoreChange: () => void): () => void {
  const query = window.matchMedia(HORIZONTAL_QUERY);
  query.addEventListener('change', onStoreChange);
  return () => query.removeEventListener('change', onStoreChange);
}

const readHorizontal = () => window.matchMedia(HORIZONTAL_QUERY).matches;
const horizontalOnServer = () => false;

/** Horizontal entry offset per `data-citeladder-reveal-from` direction. */
const X_OFFSET_BY_DIRECTION: Record<string, number> = { left: -30, right: 30 };

export function GsapRevealInitializer() {
  const reduceMotion = useReducedMotion();
  const allowHorizontal = useSyncExternalStore(
    subscribeToHorizontal,
    readHorizontal,
    horizontalOnServer,
  );

  // Queries are intentionally document-wide: reveal elements live throughout the
  // page, not inside this initializer, so there is no meaningful `scope`. Both
  // dependencies are media-query results, and listing them re-runs the effect
  // (reverting prior animations via useGSAP's context) when the motion
  // preference resolves or the layout crosses the tablet breakpoint.
  useGSAP(
    () => {
      if (reduceMotion || typeof window === 'undefined') return;

      const elements = document.querySelectorAll<HTMLElement>('[data-citeladder-reveal=""]');
      const staggers = document.querySelectorAll('[data-citeladder-reveal="stagger"]');

      // Phase 1: Batched DOM writes — initialize starting opacity & transforms without interleaving layout reads
      elements.forEach((el) => {
        const fromDir = el.dataset.citeladderRevealFrom || 'up';
        const xOffset = allowHorizontal ? (X_OFFSET_BY_DIRECTION[fromDir] ?? 0) : 0;
        gsap.set(el, { opacity: 0, x: xOffset });
      });

      staggers.forEach((group) => {
        gsap.set(group.children, { opacity: 0 });
      });

      // Phase 2: Create triggers — measurements run against settled DOM without layout invalidation between elements
      elements.forEach((el) => {
        gsap.to(el, {
          opacity: 1,
          x: 0,
          duration: 0.6,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: el,
            start: 'top 88%',
            once: true,
          },
        });
      });

      staggers.forEach((group) => {
        const children = group.children;
        if (!children.length) return;

        gsap.to(children, {
          opacity: 1,
          duration: 0.5,
          stagger: 0.08,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: group,
            start: 'top 85%',
            once: true,
          },
        });
      });
    },
    { dependencies: [reduceMotion, allowHorizontal] },
  );

  return null;
}
