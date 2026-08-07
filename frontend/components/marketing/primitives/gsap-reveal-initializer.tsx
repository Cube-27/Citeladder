'use client';

import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useReducedMotion } from 'motion/react';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

/** Horizontal entry offset per `data-citeladder-reveal-from` direction. */
const X_OFFSET_BY_DIRECTION: Record<string, number> = { left: -30, right: 30 };

export function GsapRevealInitializer() {
  const reduceMotion = useReducedMotion();

  // Queries are intentionally document-wide: reveal elements live throughout the
  // page, not inside this initializer, so there is no meaningful `scope`. Listing
  // `reduceMotion` as a dependency re-runs the effect (and reverts prior
  // animations via useGSAP's context) once the media-query preference resolves.
  useGSAP(
    () => {
      if (reduceMotion || typeof window === 'undefined') return;

      // Reveal single elements
      const elements = document.querySelectorAll<HTMLElement>('[data-citeladder-reveal=""]');
      elements.forEach((el) => {
        const fromDir = el.dataset.citeladderRevealFrom || 'up';
        const xOffset = X_OFFSET_BY_DIRECTION[fromDir] ?? 0;
        const yOffset = fromDir === 'up' ? 24 : 0;

        gsap.fromTo(
          el,
          { opacity: 0, x: xOffset, y: yOffset },
          {
            opacity: 1,
            x: 0,
            y: 0,
            duration: 0.8,
            ease: 'power2.out',
            scrollTrigger: {
              trigger: el,
              start: 'top 88%',
              once: true,
            },
          },
        );
      });

      // Staggered grid/list groups
      const staggers = document.querySelectorAll('[data-citeladder-reveal="stagger"]');
      staggers.forEach((group) => {
        const children = group.children;
        if (!children.length) return;

        gsap.fromTo(
          children,
          { opacity: 0, y: 20 },
          {
            opacity: 1,
            y: 0,
            duration: 0.6,
            stagger: 0.12,
            ease: 'power2.out',
            scrollTrigger: {
              trigger: group,
              start: 'top 85%',
              once: true,
            },
          },
        );
      });
    },
    { dependencies: [reduceMotion] },
  );

  return null;
}
