'use client';

import { Info } from 'lucide-react';

import { Tooltip } from '@/components/ui/tooltip';

/**
 * A short explanation attached to a label, without spending a line on it.
 *
 * The visibility screens used to print each measure's definition as permanent
 * body copy under the number — a "Calculation" disclosure on every metric, and
 * a two-sentence caveat above the Searches table. The explanation is worth
 * keeping and worth reaching; it is not worth the reader's first three seconds.
 *
 * The trigger is a real button so the tooltip is reachable by keyboard and
 * announced by name, which a focusable `<span>` is not.
 */
export function InfoHint({ label, children }: Readonly<{ label: string; children: string }>) {
  return (
    <Tooltip content={children}>
      <button
        type="button"
        aria-label={`${label}: ${children}`}
        className="focus-ring text-muted hover:text-foreground inline-flex align-middle"
      >
        <Info className="size-3" aria-hidden />
      </button>
    </Tooltip>
  );
}
