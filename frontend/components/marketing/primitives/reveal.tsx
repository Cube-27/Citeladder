import type { ReactNode } from 'react';

/**
 * Scroll choreography for page content.
 *
 * These stay plain server-rendered divs. An earlier version swapped the
 * server-rendered div for an opacity-zero motion node after hydration, which
 * made every route visibly flash; the motion is therefore CSS-only, driven by
 * `animation-timeline: view()` in marketing-theme.css. The element paints in
 * its FINISHED state and animates only where view timelines are supported, so
 * there is no hydration boundary to flash across and no unsupported-browser or
 * JS-disabled path that can strand content at zero opacity. Reduced motion is
 * honoured in the same stylesheet.
 *
 * `StaggerGroup` marks the container; each direct child keys off its own
 * scroll position, so the cascade follows the scroll rather than running ahead
 * of it on a fixed delay. `StaggerItem` carries no attribute of its own — it
 * exists so call sites read symmetrically with the group.
 */
type MotionChildren = Readonly<{ children: ReactNode; className?: string }>;

/**
 * Entrance direction for a reveal. `up` (the default) rises into place;
 * `left`/`right` slide in from that edge — used for paired columns that should
 * converge on the section (the Stance Always/Never cards) and for the closing
 * beat. All resolve to the same finished state; the direction only changes
 * where the motion starts.
 */
type Direction = 'up' | 'left' | 'right';

export function Reveal({
  children,
  className,
  from = 'up',
}: MotionChildren & { from?: Direction }) {
  return (
    <div data-mkt-reveal="" data-mkt-reveal-from={from} className={className}>
      {children}
    </div>
  );
}

export function StaggerGroup({ children, className }: MotionChildren) {
  return (
    <div data-mkt-reveal="stagger" className={className}>
      {children}
    </div>
  );
}

export function StaggerItem({ children, className, from }: MotionChildren & { from?: Direction }) {
  return (
    <div data-mkt-reveal-from={from} className={className}>
      {children}
    </div>
  );
}
