'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';

import { useReducedMotion } from '@/lib/accessibility/use-reduced-motion';

/**
 * Calls `onTick` every `intervalMs` while `target` is on screen, the tab is
 * visible and the reader has not asked for reduced motion. Pausing restarts
 * the interval, so a resumed rotor never jumps straight to its next step.
 */
export function useAutoplay({
  target,
  intervalMs,
  onTick,
  enabled = true,
}: Readonly<{
  target: RefObject<Element | null>;
  intervalMs: number;
  onTick: () => void;
  enabled?: boolean;
}>) {
  const reducedMotion = useReducedMotion();
  const [inView, setInView] = useState(true);
  const [pageVisible, setPageVisible] = useState(true);
  const tick = useRef(onTick);

  useEffect(() => {
    tick.current = onTick;
  });

  useEffect(() => {
    const element = target.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry) setInView(entry.isIntersecting);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [target]);

  useEffect(() => {
    const sync = () => setPageVisible(document.visibilityState === 'visible');
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, []);

  const running = enabled && !reducedMotion && inView && pageVisible;
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => tick.current(), intervalMs);
    return () => window.clearInterval(id);
  }, [running, intervalMs]);
}
