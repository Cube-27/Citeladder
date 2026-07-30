'use client';

import { m, useReducedMotion } from 'motion/react';

const EASE_SWEEP = [0.4, 0, 0.2, 1] as const;

/**
 * Dynamic Moving Hero Atmosphere:
 * Ambient soft sky light orbs that continuously float, scale, and drift across the hero canvas.
 */
const FIELDS = [
  {
    className: 'bg-mkt-sky -top-24 -right-24 size-[34rem]',
    animate: {
      x: [0, 110, -50, 0],
      y: [0, -70, 35, 0],
      scale: [1, 1.22, 0.92, 1],
      opacity: [0.35, 0.6, 0.38, 0.35],
    },
    duration: 8,
  },
  {
    className: 'bg-mkt-evidence-soft top-12 -left-28 size-[32rem]',
    animate: {
      x: [0, -90, 75, 0],
      y: [0, 65, -45, 0],
      scale: [1, 1.28, 0.95, 1],
      opacity: [0.3, 0.58, 0.35, 0.3],
    },
    duration: 9.5,
  },
  {
    className: 'bg-mkt-amber-soft -bottom-28 left-1/4 size-[38rem]',
    animate: {
      x: [0, 130, -100, 0],
      y: [0, -85, 65, 0],
      scale: [1, 1.32, 0.88, 1],
      opacity: [0.35, 0.65, 0.38, 0.35],
    },
    duration: 7.5,
  },
  {
    className: 'bg-mkt-wash top-1/3 right-1/4 size-[30rem]',
    animate: {
      x: [0, -80, 80, 0],
      y: [0, 75, -55, 0],
      scale: [0.9, 1.25, 0.92, 0.9],
      opacity: [0.28, 0.52, 0.32, 0.28],
    },
    duration: 8.5,
  },
];

export function HeroAtmosphere() {
  const reduceMotion = useReducedMotion();

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 select-none overflow-hidden"
    >
      {FIELDS.map((field, i) => (
        <m.span
          key={i}
          className={`${field.className} pointer-events-none absolute rounded-full blur-3xl`}
          initial={{ opacity: field.animate.opacity[0] }}
          animate={reduceMotion ? undefined : field.animate}
          transition={{
            duration: field.duration,
            ease: EASE_SWEEP,
            repeat: Number.POSITIVE_INFINITY,
            repeatType: 'loop',
          }}
        />
      ))}
    </div>
  );
}
