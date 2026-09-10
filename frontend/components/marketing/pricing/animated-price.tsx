'use client';

import { useEffect, useRef, useState } from 'react';

import { useReducedMotion } from '@/lib/accessibility/use-reduced-motion';
import { PRICING_PRICE_TWEEN_MS } from '@/lib/config/billing';

/**
 * A price that tweens between two real numbers.
 *
 * It animates ONLY number → number. Moving to or from a semantic state
 * ("Not yet priced", "Contact us") snaps, because interpolating toward a
 * value the catalog did not send would put fabricated prices on screen mid-
 * tween — the one thing this page must never do. Reduced motion always snaps.
 *
 * The tween is a plain requestAnimationFrame loop with a quad ease-out.
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
  const previous = useRef<number | null>(value);
  const formatRef = useRef(format);
  // Refs are not written during render (React Compiler rule); this runs after
  // every commit, so an in-flight tween always reads the latest formatter.
  useEffect(() => {
    formatRef.current = format;
  });
  const [display, setDisplay] = useState<string>(value === null ? announce : format(value));
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const from = previous.current;
    previous.current = value;

    // Semantic state, reduced motion, or a first paint: snap.
    if (value === null || from === null || reduceMotion || from === value) {
      setDisplay(value === null ? announce : formatRef.current(value));
      return;
    }

    let frame = 0;
    // The clock is the rAF timestamp itself: its base matches the callbacks it
    // drives (a performance.now() base desynchronises under jsdom and drives
    // the ease past zero), and the clamp keeps any late frame from overshooting.
    let startedAt: number | null = null;
    const tick = (now: number) => {
      if (startedAt === null) startedAt = now;
      const progress = Math.min(Math.max((now - startedAt) / PRICING_PRICE_TWEEN_MS, 0), 1);
      const eased = 1 - (1 - progress) * (1 - progress);
      setDisplay(formatRef.current(Math.round(from + (value - from) * eased)));
      if (progress < 1) frame = requestAnimationFrame(tick);
      else setDisplay(formatRef.current(value));
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, announce, reduceMotion]);

  return (
    <>
      <span data-price className={className}>
        {display}
      </span>
      {/* One polite announcement of the settled result, not of each frame. */}
      <span aria-live="polite" className="sr-only">
        {announce}
      </span>
    </>
  );
}
