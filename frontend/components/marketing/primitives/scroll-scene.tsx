'use client';

import { motion, useReducedMotion, useScroll, useTransform, type MotionValue } from 'motion/react';
import { useRef, type ReactNode } from 'react';

/**
 * Scroll-driven enhancement for the Proof surface, in the same family as
 * `hero-entrance.tsx` — a client island that wraps ALREADY server-rendered
 * content and only adds motion after hydration. The page paints in its
 * finished state; nothing here is load-bearing.
 *
 * Reduced motion, a disabled-JS client, or an unsupported browser all render
 * the children exactly as the server sent them (the un-wrapped static
 * section), so content can never be stranded off-screen or at zero opacity.
 *
 * Unlike the CSS `view()` reveals — which are entrance-only and fire once —
 * these track the scroll position continuously, which is what makes a pinned
 * or parallax beat possible. They are the exception to "reveal and settle":
 * the motion IS the point of the section, so it follows the scroll both ways.
 */

/** Shared ease-free progress: raw scroll, the scroll itself is the easing. */
function useSectionProgress(ref: React.RefObject<HTMLElement | null>) {
  return useScroll({
    target: ref,
    // Start when the section's top reaches the viewport bottom; finish when
    // its bottom reaches the viewport top. Full traversal drives the scene.
    offset: ['start end', 'end start'],
  });
}

/**
 * Gentle parallax: the wrapped content drifts up slightly slower than the
 * scroll, so it reads as floating over its band. Travel is small (`from`→`to`
 * px) on purpose — a large parallax on a content panel makes copy unreadable
 * while it moves. Additive only: at rest it sits exactly where the static
 * layout put it.
 */
export function ParallaxScene({
  children,
  className,
  from = 24,
  to = -24,
}: Readonly<{
  children: ReactNode;
  className?: string;
  /** Starting vertical offset in px (positive = pushed down) as it enters. */
  from?: number;
  /** Ending vertical offset in px (negative = lifted) as it leaves. */
  to?: number;
}>) {
  const reduceMotion = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useSectionProgress(ref);
  const y = useTransform(scrollYProgress, [0, 1], [from, to]);

  // The ref is attached in BOTH branches: `useScroll` is called
  // unconditionally (hooks must be), so leaving its target unhydrated on the
  // reduced-motion path means it measures a null element and warns.
  if (reduceMotion) {
    return (
      <div ref={ref} className={className}>
        {children}
      </div>
    );
  }

  return (
    <div ref={ref} className={className}>
      <motion.div style={{ y }}>{children}</motion.div>
    </div>
  );
}

/**
 * The pinned beat: a tall scroll region whose sticky child holds the headline
 * still while the steps scroll through beside it. `progress` is exposed so the
 * child can drive step emphasis off the same scroll value rather than a second
 * listener. Rendered as a plain grid (sticky only where motion is allowed), so
 * the no-motion path is the normal stacked section.
 */
export function PinnedScene({
  rail,
  children,
  className,
}: Readonly<{
  /** The sticky element — headline + progress indicator. */
  rail: (progress: MotionValue<number>) => ReactNode;
  children: ReactNode;
  className?: string;
}>) {
  const reduceMotion = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    // Drive only while the pinned region is traversing the viewport.
    offset: ['start start', 'end end'],
  });

  if (reduceMotion) {
    return (
      <div ref={ref} className={className}>
        <div>{rail(scrollYProgress)}</div>
        {children}
      </div>
    );
  }

  return (
    <div ref={ref} className={className}>
      {/* The rail is sticky within the tall region; the steps scroll past. */}
      <div className="lg:sticky lg:top-[calc(var(--spacing-mkt-nav)+2rem)]">
        {rail(scrollYProgress)}
      </div>
      {children}
    </div>
  );
}
