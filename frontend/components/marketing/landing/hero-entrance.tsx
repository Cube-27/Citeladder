'use client';

import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { useReducedMotion } from 'motion/react';
import { useRef, type ReactNode } from 'react';

/**
 * The hero's on-load entrance.
 *
 * This component was a bare `<div>` — it took `children` and a `className` and
 * rendered them, and its own doc comment described an animation that no longer
 * existed. That mattered more than an unused wrapper normally would: the hero is
 * above the fold, so the page's ScrollTrigger reveals never fire for it, and the
 * first screen a visitor saw was the one screen with no motion at all.
 *
 * The animation is purely additive over content that is already server-rendered
 * in its settled state: it plays on mount, from a `gsap.set` that runs in the
 * same frame, so a visitor who never gets the JS (or who asks for reduced
 * motion) sees the finished hero rather than an empty one. Nothing here gates
 * paint or a11y — the markup is complete in the SSR HTML either way.
 */
export function HeroEntrance({
  children,
  className,
}: Readonly<{
  children: ReactNode;
  className?: string;
}>) {
  const reduceMotion = useReducedMotion();
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (reduceMotion) return;
      const container = root.current;
      if (!container) return;

      // Direct children are the hero's beats in source order: eyebrow, headline,
      // lead, CTA row, engine logos. Animating the beats rather than a list of
      // selectors means the sequence follows the markup instead of duplicating
      // its structure here, so re-ordering the hero cannot desync the entrance.
      const beats = Array.from(container.children);
      if (!beats.length) return;

      gsap.set(beats, { opacity: 0, y: 24 });
      gsap.to(beats, {
        opacity: 1,
        y: 0,
        duration: 0.85,
        stagger: 0.09,
        ease: 'power3.out',
        // A beat of delay lets the webfont swap land first; without it the
        // headline animates in one face and settles in another.
        delay: 0.1,
      });
    },
    { dependencies: [reduceMotion], scope: root },
  );

  return (
    <div ref={root} className={className}>
      {children}
    </div>
  );
}
