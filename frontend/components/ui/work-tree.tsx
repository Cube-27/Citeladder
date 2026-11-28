import type { ReactNode } from 'react';

import { Pressable, type PressableProps } from '@/components/ui/pressable';
import { SkeletonBlock } from '@/components/ui/skeleton-block';
import { ProgressGlyph, type ProgressValue } from '@/components/ui/status-mark';

import { ChevronDown } from '@/lib/icons';
import { formatCount } from '@/lib/format';
import { cn } from '@/lib/utils';

function TreeChevron({ open }: Readonly<{ open: boolean }>) {
  return (
    <ChevronDown
      aria-hidden
      className={cn('text-ink-2 size-3.5 shrink-0 turn', !open && '-rotate-90')}
    />
  );
}

function CountText({ children }: Readonly<{ children: string }>) {
  return <span className="text-body text-ink-2 min-w-7 shrink-0 tabular-nums">{children}</span>;
}

type ToggleProps = Omit<PressableProps, 'children' | 'tone'> & { open: boolean };

export function TreeStatusRow({
  open,
  progress,
  name,
  count,
  ...props
}: Readonly<ToggleProps & { progress: ProgressValue; name: string; count: string }>) {
  return (
    <Pressable {...props} data-tree-row="" aria-expanded={open} text="label" look="tree-row">
      <TreeChevron open={open} />
      <ProgressGlyph value={progress} />
      {name}
      <CountText>{count}</CountText>
    </Pressable>
  );
}

export function TreeGroupRow({
  open,
  name,
  count,
  mark,
  ...props
}: Readonly<ToggleProps & { name: string; count: number; mark?: ReactNode }>) {
  return (
    <Pressable {...props} data-tree-row="" aria-expanded={open} text="label" look="tree-row" anchor>
      <TreeChevron open={open} />
      <span className="min-w-0 truncate">{name}</span>
      <CountText>{formatCount(count)}</CountText>
      {mark}
    </Pressable>
  );
}

export function TreeGroupingRow({
  open,
  name,
  count,
  tick,
  ...props
}: Readonly<ToggleProps & { name: string; count: number; tick: ReactNode }>) {
  return (
    <div
      className={cn(
        'text-label text-ink',
        'hover:overlay-hover rounded-control relative flex h-10 items-center gap-2 px-2',
        !open && 'text-ink-2',
      )}
    >
      <Pressable {...props} data-tree-row="" aria-expanded={open} box="overlay" />
      <TreeChevron open={open} />
      <span className="relative flex">{tick}</span>
      <span className="pointer-events-none min-w-0 truncate">{name}</span>
      <span className="pointer-events-none flex">
        <CountText>{formatCount(count)}</CountText>
      </span>
    </div>
  );
}

export function TreeIndent({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="phone:ml-2 ml-5 grid gap-1 pb-2">{children}</div>;
}

export function TreeLine({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="border-rule phone:ml-2 phone:pl-1 ml-5 grid border-l pl-3">{children}</div>
  );
}

export function TreeLeaf({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="phone:ms-0 ms-8 pb-2">{children}</div>;
}

export function TreeQuiet({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <p className="text-body text-ink-2 phone:ml-2 ml-5 flex h-10 items-center px-2">{children}</p>
  );
}

export function TreeLoading({ label }: Readonly<{ label: string }>) {
  return (
    <div aria-busy className="phone:ml-2 ml-5 grid gap-1">
      <span className="sr-only">{label}</span>
      {[0, 1, 2].map((row) => (
        <SkeletonBlock key={row} shape="control" height="10" />
      ))}
    </div>
  );
}
