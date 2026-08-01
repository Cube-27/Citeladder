'use client';

import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { useReducedMotion } from 'motion/react';
import { useRef, useState } from 'react';

import { PRICING_PRICE_TWEEN_MS } from '@/lib/config/billing';

/**
 * A price that tweens between two real numbers.
 *
 * It animates ONLY number → number. Moving to or from a semantic state
 * ("Not yet priced", "Contact us") snaps, because interpolating toward a
 * value the catalog did not send would put fabricated prices on screen mid-
 * tween — the one thing this page must never do. Reduced motion always snaps.
 *
 * `announce` is the settled semantic result; the live region emits one final
 * announcement rather than narrating every interpolated frame.
 */
export function AnimatedPrice({
  value,
  format,
  announce,
  className,
}: Readonly<{
  /** The numeric price in major units, or null for a semantic state. */
  value: number | null;
  /** Renders a tweened major-unit number. */
  format: (value: number) => string;
  /** The settled text — used when `value` is null and for the live region. */
  announce: string;
  className?: string;
}>) {
  const ref = useRef<HTMLSpanElement>(null);
  const previous = useRef<number | null>(value);
  const [display, setDisplay] = useState<string>(value === null ? announce : format(value));
  const reduceMotion = useReducedMotion();

  useGSAP(
    () => {
      const from = previous.current;
      previous.current = value;

      // Semantic state, reduced motion, or a first paint: snap.
      if (value === null || from === null || reduceMotion || from === value) {
        setDisplay(value === null ? announce : format(value));
        return;
      }

      const tweened = { value: from };
      gsap.to(tweened, {
        value,
        duration: PRICING_PRICE_TWEEN_MS / 1000,
        ease: 'power2.out',
        onUpdate: () => setDisplay(format(Math.round(tweened.value))),
        onComplete: () => setDisplay(format(value)),
      });
    },
    { scope: ref, dependencies: [value, announce, reduceMotion] },
  );

  return (
    <>
      <span ref={ref} data-price className={className}>
        {display}
      </span>
      {/* One polite announcement of the settled result, not of each frame. */}
      <span aria-live="polite" className="sr-only">
        {announce}
      </span>
    </>
  );
}
