'use client';

import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

type MotionChildren = Readonly<{ children: ReactNode; className?: string }>;

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
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.18 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
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
      viewport={{ once: true, amount: 0.14 }}
      variants={{ hidden: {}, shown: { transition: { staggerChildren: 0.08 } } }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: MotionChildren) {
  // Mirrors StaggerGroup's guard. Without it, a StaggerItem whose group fell
  // back to a plain <div> keeps its `hidden` variant as the initial state with
  // nothing left to drive it to `shown` — the content stays at opacity 0.
  const reduceMotion = useReducedMotion();
  const canAnimate = useCanAnimateInView();
  if (reduceMotion || !canAnimate) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y: 16 },
        shown: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
      }}
    >
      {children}
    </motion.div>
  );
}
