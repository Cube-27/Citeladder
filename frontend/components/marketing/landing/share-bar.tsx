'use client';

import { useEffect, useRef } from 'react';

import { cn } from '@/lib/utils';

type SegmentKey = 'yours' | 'competitors' | 'none';

type Segment = Readonly<{
  key: SegmentKey;
  name: string;
  width: number;
  label: string;
}>;

/** The neutral series walk the semantic ramp: mid rule for competitors, quiet well for no brand. */
const SEGMENT_FILL: Record<SegmentKey, string> = {
  yours: 'bg-accent',
  competitors: 'bg-border',
  none: 'bg-active',
};

const SEGMENT_LABEL: Record<SegmentKey, string> = {
  yours: 'text-accent-fg',
  competitors: 'text-foreground',
  none: 'text-secondary',
};

/** The no-brand segment lands ~0.7s after the first two, so the fill reads as a sequence. */
const SEGMENT_DELAY: Record<SegmentKey, string> = {
  yours: 'delay-300',
  competitors: 'delay-300',
  none: 'delay-[1000ms]',
};

/**
 * The share-of-citations bar, drawn as one editorial fill — segments grow from
 * nothing the first time the bar crosses into view.
 *
 * The server renders the bar complete, and this island only ever collapses and
 * refills it: a reader without JavaScript, and a reader with reduced motion,
 * both get the final state without any animation. Collapsing happens after
 * hydration (the bar sits far below the first paint), and the width transition
 * itself carries the timing, so the IntersectionObserver only flips a value.
 * The observer fires on any contact with the viewport, so the collapsed state is
 * always transient.
 */
export function ShareBar({ segments }: Readonly<{ segments: readonly Segment[] }>) {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // Environments without the observer (old browsers, jsdom) get the final
    // state, same as the reduced-motion and no-JS paths.
    if (!('IntersectionObserver' in window)) return;

    const pieces = Array.from(bar.querySelectorAll<HTMLElement>('[data-seg]'));
    pieces.forEach((piece) => {
      piece.style.width = '0%';
    });

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        pieces.forEach((piece) => {
          piece.style.width = `${piece.dataset.width}%`;
        });
      },
      // Both thresholds matter: 0.4 is the reveal the design wants, and 0 is the
      // floor that guarantees a fill. A bar that is on screen but never 40%
      // visible — a short viewport, a reader who stops scrolling just above it —
      // would otherwise sit collapsed at 0% forever.
      { threshold: [0, 0.4] },
    );
    observer.observe(bar);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div
        ref={barRef}
        className="border-border-subtle mt-3 flex h-[34px] overflow-hidden rounded-[var(--radius-xs)] border"
      >
        {segments.map((segment) => (
          <div
            key={segment.key}
            data-seg
            data-width={segment.width}
            style={{ width: `${segment.width}%` }}
            className={cn(
              'relative flex min-w-0 items-center transition-[width] duration-[1100ms] ease-[cubic-bezier(0.5,0,0.2,1)] motion-reduce:transition-none',
              SEGMENT_DELAY[segment.key],
              SEGMENT_FILL[segment.key],
            )}
          >
            <span className={cn('truncate px-2.5 text-xs font-medium', SEGMENT_LABEL[segment.key])}>
              {segment.label}
            </span>
          </div>
        ))}
      </div>
      <div className="text-secondary mt-2.5 flex flex-wrap gap-x-6 gap-y-1.5 text-xs">
        {segments.map((segment) => (
          <span key={segment.key} className="flex items-center gap-2">
            <i aria-hidden className={cn('size-2.5 rounded-xs', SEGMENT_FILL[segment.key])} />
            {segment.name}
          </span>
        ))}
      </div>
    </>
  );
}
