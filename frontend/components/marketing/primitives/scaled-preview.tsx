import type { ReactNode } from 'react';

/** Keeps an illustrative product screen at one layout width while fitting its frame. */
export function ScaledPreview({
  width,
  children,
  className,
}: Readonly<{ width: number; children: ReactNode; className?: string }>) {
  return (
    <div
      className={className}
      style={{
        containerType: 'inline-size',
        width: '100%',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: `max(100%, ${width}px)`,
          // zoom participates in layout, reserving the actual content height
          // before hydration. tan(atan2()) yields a dimensionless ratio on
          // our browser baseline, which predates typed calc division.
          zoom: `min(1, tan(atan2(100cqw, ${width}px)))`,
        }}
      >
        {children}
      </div>
    </div>
  );
}
