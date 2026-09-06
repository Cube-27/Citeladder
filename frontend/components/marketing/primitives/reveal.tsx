import type { ReactNode } from 'react';

type MotionChildren = Readonly<{ children: ReactNode; className?: string }>;
type Direction = 'up' | 'left' | 'right';

/**
 * Scroll choreography for page content. These wrappers only stamp the
 * `data-citeladder-reveal` hooks; the entrances are CSS scroll-driven
 * animations owned by `globals.css`, so no JavaScript runs here. Elements
 * render fully visible in the SSR HTML — where `animation-timeline: view()`
 * is unsupported, or the reader asked for reduced motion, they simply stay
 * settled.
 */
export function Reveal({
  children,
  className,
  from = 'up',
}: MotionChildren & { from?: Direction }) {
  return (
    <div data-citeladder-reveal="" data-citeladder-reveal-from={from} className={className}>
      {children}
    </div>
  );
}

export function StaggerGroup({ children, className }: MotionChildren) {
  return (
    <div data-citeladder-reveal="stagger" className={className}>
      {children}
    </div>
  );
}

export function StaggerItem({ children, className }: MotionChildren) {
  return <div className={className}>{children}</div>;
}
