'use client';

import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

/**
 * Scroll choreography for the Proof surface: 24px of travel over ~1000ms on a
 * long ease-out, so content SETTLES rather than bounces (deck, motion 02).
 *
 * Both guards matter. `useReducedMotion` honours the OS setting; the
 * IntersectionObserver probe covers environments where `whileInView` would
 * never fire (jsdom, older crawlers) and would otherwise strand content at
 * opacity 0 — a blank marketing page is a far worse failure than no animation.
 */
type MotionChildren = Readonly<{ children: ReactNode; className?: string }>;

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

function useCanAnimateInView(): boolean {
  const [canAnimate, setCanAnimate] = useState(false);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setCanAnimate(typeof IntersectionObserver !== 'undefined');
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);
  return canAnimate;
}

export function Reveal({ children, className }: MotionChildren) {
  const reduceMotion = useReducedMotion();
  const canAnimate = useCanAnimateInView();
  if (reduceMotion || !canAnimate) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.12 }}
      transition={{ duration: 1, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerGroup({ children, className }: MotionChildren) {
  const reduceMotion = useReducedMotion();
  const canAnimate = useCanAnimateInView();
  if (reduceMotion || !canAnimate) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, amount: 0.12 }}
      variants={{ hidden: {}, shown: { transition: { staggerChildren: 0.09 } } }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: MotionChildren) {
  // Mirrors StaggerGroup's guard. Without it, an item whose group fell back to
  // a plain <div> keeps `hidden` as its initial state with nothing left to
  // drive it to `shown` — the content stays invisible.
  const reduceMotion = useReducedMotion();
  const canAnimate = useCanAnimateInView();
  if (reduceMotion || !canAnimate) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y: 20 },
        shown: { opacity: 1, y: 0, transition: { duration: 0.75, ease: EASE_OUT } },
      }}
    >
      {children}
    </motion.div>
  );
}
