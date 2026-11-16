import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

import { Icon } from '@/components/ui/icon';
import { ProjectLink } from '@/components/ui/project-link';
import { textRole } from '@/components/ui/typography';
import { cn } from '@/lib/utils';

/**
 * Rows that each open a page, in one bordered box: 48px each on fixed
 * columns (an optional tick, the name, two short facts, a chevron), so no row
 * moves another; a "Show more" (`WorkRowsMore`) closes the box.
 */
const GRID = 'grid items-center gap-3 px-4';
const COLUMNS = {
  plain: 'grid-cols-[minmax(0,1fr)_90px_110px_16px]',
  ticked: 'grid-cols-[16px_minmax(0,1fr)_90px_110px_16px]',
} as const;

export function LinkRows({
  label,
  children,
  more,
}: Readonly<{ label: string; children: ReactNode; more?: ReactNode }>) {
  return (
    <div className="border-rule bg-surface rounded-card overflow-hidden border">
      <ul aria-label={label} className="divide-rule divide-y">
        {children}
      </ul>
      {more}
    </div>
  );
}

/**
 * One row. Its name links to the page and stretches over the row, so the
 * whole row opens it; the tick sits above the link and only ticks.
 */
export function LinkRow({
  tick,
  href,
  state,
  name,
  facts,
}: Readonly<{
  tick?: ReactNode;
  href: string;
  /** History state the page opens with (where it was reached from). */
  state?: unknown;
  name: ReactNode;
  facts: readonly [ReactNode, ReactNode];
}>) {
  return (
    <li
      className={cn(
        GRID,
        tick ? COLUMNS.ticked : COLUMNS.plain,
        'hover:overlay-hover relative h-12',
      )}
    >
      {tick ? <span className="relative z-10 flex">{tick}</span> : null}
      <ProjectLink
        href={href}
        state={state}
        className="focus-ring min-w-0 truncate rounded-sm before:absolute before:inset-0"
      >
        {name}
      </ProjectLink>
      <span className={textRole('caption', 'text-ink-2 truncate')}>{facts[0]}</span>
      <span className={textRole('caption', 'text-ink-2 flex truncate tabular-nums')}>
        {facts[1]}
      </span>
      <Icon icon={ChevronRight} className="text-ink-2" />
    </li>
  );
}
