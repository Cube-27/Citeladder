import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

import { Pressable, type PressableProps } from '@/components/ui/pressable';
import { SkeletonBlock } from '@/components/ui/skeleton-block';
import { StateDot, type StateDotTone } from '@/components/ui/state-dot';
import { textRole } from '@/components/ui/typography';
import { formatCount } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * A work tree: status rows, shaded group rows and indented grouping rows on a
 * tree line, every row 40px tall, so opening a level or a count changing only
 * moves what is below it.
 */

function TreeChevron({ open }: Readonly<{ open: boolean }>) {
  return (
    <ChevronDown
      aria-hidden
      className={cn(
        'text-ink-2 size-3.5 shrink-0 transition-transform duration-[var(--motion-open)]',
        !open && '-rotate-90',
      )}
    />
  );
}

/** A count in a small box, wide enough for three digits so a changing count moves nothing. */
function CountBox({ count }: Readonly<{ count: number }>) {
  return (
    <span
      className={textRole(
        'captionStrong',
        'border-rule inline-flex h-5 min-w-7 shrink-0 items-center justify-center rounded-mark border px-1 tabular-nums',
      )}
    >
      {formatCount(count)}
    </span>
  );
}

type ToggleProps = Omit<PressableProps, 'children'> & { open: boolean };

/** A status's row: chevron, state ring, name and a count kept four digits wide. */
export function TreeStatusRow({
  open,
  tone,
  name,
  count,
  className,
  ...props
}: Readonly<ToggleProps & { tone: StateDotTone; name: string; count: string }>) {
  return (
    <Pressable
      {...props}
      data-tree-row=""
      aria-expanded={open}
      className={cn(
        textRole('subheading'),
        'hover:overlay-hover flex h-10 items-center gap-2 px-2',
        className,
      )}
    >
      <TreeChevron open={open} />
      <StateDot tone={tone} />
      {name}
      <span className={textRole('body', 'text-ink-2 min-w-7 tabular-nums')}>{count}</span>
    </Pressable>
  );
}

/** A group's shaded row: chevron, name, count box and any trailing mark. */
export function TreeGroupRow({
  open,
  name,
  count,
  mark,
  className,
  ...props
}: Readonly<ToggleProps & { name: string; count: number; mark?: ReactNode }>) {
  return (
    <Pressable
      {...props}
      data-tree-row=""
      aria-expanded={open}
      className={cn(
        textRole('subheading'),
        'bg-well hover:overlay-hover flex h-10 scroll-mt-4 items-center gap-2 px-2',
        className,
      )}
    >
      <TreeChevron open={open} />
      <span className="min-w-0 truncate">{name}</span>
      <CountBox count={count} />
      {mark}
    </Pressable>
  );
}

/**
 * A grouping's row on the tree line: the toggle covers the row, and the tick
 * sits above it so it only ticks.
 */
export function TreeGroupingRow({
  open,
  name,
  count,
  tick,
  className,
  ...props
}: Readonly<ToggleProps & { name: string; count: number; tick: ReactNode }>) {
  return (
    <div
      className={cn(
        textRole('label'),
        'hover:overlay-hover rounded-control relative flex h-10 items-center gap-2 px-2',
        !open && 'text-ink-2',
      )}
    >
      <Pressable
        {...props}
        data-tree-row=""
        aria-expanded={open}
        className={cn('absolute inset-0', className)}
      />
      <TreeChevron open={open} />
      <span className="relative flex">{tick}</span>
      <span className="pointer-events-none min-w-0 truncate">{name}</span>
      <span className="pointer-events-none flex">
        <CountBox count={count} />
      </span>
    </div>
  );
}

/**
 * One level down: indented under its parent's chevron. Below 768 the three
 * levels indent 8 + 17 + 0 instead of 20 + 33 + 24, so a row's title keeps
 * its width (at least 180 at 390).
 */
export function TreeIndent({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="phone:ml-2 ml-5 grid gap-1 pb-2">{children}</div>;
}

/** The groupings under a group, on a tree line. */
export function TreeLine({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="border-rule phone:ml-2 phone:pl-2 ml-5 grid border-l pl-3">{children}</div>
  );
}

/** A level's rows under one grouping: aligned past the grouping's chevron. */
export function TreeLeaf({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="phone:ms-0 ms-6 pb-2">{children}</div>;
}

/** An empty level in the rows' rhythm. */
export function TreeQuiet({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <p className={textRole('body', 'text-ink-2 ml-5 flex h-10 items-center px-2 phone:ml-2')}>
      {children}
    </p>
  );
}

/** A level loading: three row-high blocks, and the words for a screen reader. */
export function TreeLoading({ label }: Readonly<{ label: string }>) {
  return (
    <div aria-busy className="phone:ml-2 ml-5 grid gap-1">
      <span className="sr-only">{label}</span>
      {[0, 1, 2].map((row) => (
        <SkeletonBlock key={row} className="rounded-control h-10" />
      ))}
    </div>
  );
}
