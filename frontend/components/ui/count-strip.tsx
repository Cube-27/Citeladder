import type { ReactNode } from 'react';

import { Absence } from '@/components/ui/absence';
import { Pressable } from '@/components/ui/pressable';
import { SkeletonBlock } from '@/components/ui/skeleton-block';
import { StateDot } from '@/components/ui/state-dot';
import { textRole } from '@/components/ui/typography';

/**
 * Counts side by side in one bordered strip, two columns below desktop and
 * four on it. Each cell is 76px tall before and after its count lands.
 */
export function CountStrip({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <fieldset
      aria-label={label}
      className="border-rule bg-rule desktop:grid-cols-4 rounded-card m-0 grid min-w-0 grid-cols-2 gap-px overflow-hidden border p-0"
    >
      {children}
    </fieldset>
  );
}

/**
 * One cell: its label, an optional mark and hint on the top line, and a ring
 * with the count phrase below. The whole cell presses; the hint sits above
 * the press and only explains.
 */
export function CountStripCell({
  label,
  mark,
  hint,
  value,
  failed,
  pressLabel,
  onPress,
}: Readonly<{
  label: string;
  mark?: ReactNode;
  hint: ReactNode;
  /** The count phrase; null while it loads (or when it failed). */
  value: string | null;
  failed: boolean;
  pressLabel: string;
  onPress: () => void;
}>) {
  return (
    <div
      data-count-cell=""
      className="bg-surface hover:overlay-hover relative flex h-[76px] min-w-0 flex-col justify-between px-4 py-3"
    >
      <Pressable aria-label={pressLabel} onClick={onPress} className="absolute inset-0" />
      <span
        className={textRole(
          'caption',
          'pointer-events-none flex min-w-0 items-center gap-2 whitespace-nowrap',
        )}
      >
        <span className="min-w-0 truncate">{label}</span>
        {mark}
        <span className="pointer-events-auto relative ms-auto">{hint}</span>
      </span>
      <span
        className={textRole('label', 'pointer-events-none flex items-center gap-2 tabular-nums')}
      >
        <StateDot tone="due" />
        {value ??
          (failed ? <Absence state="unavailable" /> : <SkeletonBlock className="h-4 w-24" />)}
      </span>
    </div>
  );
}
