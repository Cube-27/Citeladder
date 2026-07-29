'use client';

import type { ReactNode } from 'react';
import { useGsapReveal } from '@/lib/hooks/use-gsap-reveal';

type MotionChildren = Readonly<{ children: ReactNode; className?: string }>;
type Direction = 'up' | 'left' | 'right';

/**
 * Enhanced cross-browser scroll choreography for page content using GSAP ScrollTrigger.
 * Elements render fully visible in SSR HTML, and GSAP handles smooth scroll entrances
 * across all browsers (including Firefox, Safari, Chrome, Edge).
 */
export function Reveal({
  children,
  className,
  from = 'up',
}: MotionChildren & { from?: Direction }) {
  const ref = useGsapReveal<HTMLDivElement>({ from, stagger: false });

  return (
    <div ref={ref} data-mkt-reveal="" data-mkt-reveal-from={from} className={className}>
      {children}
    </div>
  );
}

export function StaggerGroup({ children, className }: MotionChildren) {
  const ref = useGsapReveal<HTMLDivElement>({ from: 'up', stagger: true });

  return (
    <div ref={ref} data-mkt-reveal="stagger" className={className}>
      {children}
    </div>
  );
}

export function StaggerItem({ children, className }: MotionChildren) {
  return <div className={className}>{children}</div>;
}
