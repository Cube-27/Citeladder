'use client';

import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';

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

export function Float({ children, className }: MotionChildren) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      className={className}
      animate={reduceMotion ? undefined : { y: [0, -7, 0] }}
      // Dropped along with `animate`: an infinitely-repeating transition left
      // attached on the reduced-motion path keeps the element in a live
      // animation loop even with nothing to animate.
      transition={
        reduceMotion
          ? undefined
          : { duration: 5.5, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }
      }
    >
      {children}
    </motion.div>
  );
}

export function Parallax({ children, className }: MotionChildren) {
  const ref = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], reduceMotion ? [0, 0] : [24, -24]);
  return (
    <motion.div ref={ref} className={className} style={{ y }}>
      {children}
    </motion.div>
  );
}
