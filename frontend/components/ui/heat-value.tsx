import type { ReactNode } from 'react';

/** The deepest tint, at a share of 1: the accent at half strength, so the value stays legible. */
const MAX_TINT = 0.5;

/**
 * HeatValue — a heat-map cell's value over an accent tint as deep as its
 * 0–1 `share`. The tint is decoration (hidden); the value names the share.
 */
export function HeatValue({ share, children }: Readonly<{ share: number; children: ReactNode }>) {
  return (
    <span className="rounded-mark relative inline-block px-2 py-0.5">
      <span
        aria-hidden
        className="bg-accent rounded-mark absolute inset-0"
        style={{ opacity: Math.min(1, Math.max(0, share)) * MAX_TINT }}
      />
      <span className="relative">{children}</span>
    </span>
  );
}
