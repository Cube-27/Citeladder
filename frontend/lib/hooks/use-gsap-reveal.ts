'use client';

import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useRef } from 'react';

function isReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

export interface UseGsapRevealOptions {
  from?: 'up' | 'left' | 'right';
  stagger?: boolean;
  delay?: number;
  duration?: number;
}

/**
 * SSR-safe, bulletproof GSAP ScrollTrigger reveal hook.
 *
 * Uses `gsap.fromTo` with `clearProps: 'opacity,transform'` and `once: true`
 * so elements reveal cleanly once and clear inline styles, ensuring they
 * CANNOT stay stuck at opacity 0 or fade out on scroll.
 */
export function useGsapReveal<T extends HTMLElement = HTMLDivElement>({
  from = 'up',
  stagger = false,
  delay = 0,
  duration = 0.7,
}: UseGsapRevealOptions = {}) {
  const containerRef = useRef<T>(null);

  useGSAP(
    () => {
      const el = containerRef.current;
      if (!el) return;

      if (isReducedMotion()) return;

      const targets = stagger ? Array.from(el.children) : [el];
      if (targets.length === 0) return;

      const xOffset = from === 'left' ? -36 : from === 'right' ? 36 : 0;
      const yOffset = from === 'up' ? 28 : 0;

      gsap.fromTo(
        targets,
        {
          opacity: 0,
          x: xOffset,
          y: yOffset,
        },
        {
          opacity: 1,
          x: 0,
          y: 0,
          duration,
          delay,
          stagger: stagger ? 0.1 : 0,
          ease: 'power2.out',
          clearProps: 'opacity,transform',
          scrollTrigger: {
            trigger: el,
            start: 'top 92%',
            toggleActions: 'play none none none',
            once: true,
          },
        },
      );
    },
    { scope: containerRef, dependencies: [from, stagger, delay, duration] },
  );

  return containerRef;
}
