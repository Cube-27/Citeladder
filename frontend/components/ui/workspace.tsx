import type { ElementType, ReactNode } from 'react';

import { cn } from '@/lib/utils';
import { Stack } from '@/components/ui/layout';
import { Pressable } from '@/components/ui/pressable';
import { POP_FACE } from '@/components/ui/slip';
import { Text } from '@/components/ui/typography';

export function TreeBranch({
  as: Component = 'ul',
  'aria-label': label,
  children,
}: Readonly<{ as?: ElementType; 'aria-label'?: string; children: ReactNode }>) {
  return (
    <Component aria-label={label} className="border-rule grid min-w-0 gap-2 border-l pl-4">
      {children}
    </Component>
  );
}

export function PaneBlock({
  as: Component = 'div',
  'aria-label': label,
  children,
}: Readonly<{ as?: ElementType; 'aria-label'?: string; children: ReactNode }>) {
  return (
    <Component aria-label={label} className="border-rule p-card gap-compact grid border-b">
      {children}
    </Component>
  );
}

type JumpItem = Readonly<{ key: string | number; label: ReactNode; onJump: () => void }>;

export function JumpList({
  label,
  items,
}: Readonly<{ label: string; items: readonly JumpItem[] }>) {
  return (
    <Stack as="nav" gap="tight" aria-label={label}>
      <Text variant="body" tone="ink-2">
        {label}
      </Text>
      <TreeBranch as="ol">
        {items.map((item) => (
          <li key={item.key}>
            <Pressable look="jump" text="caption" box="auto" onClick={item.onJump}>
              {item.label}
            </Pressable>
          </li>
        ))}
      </TreeBranch>
    </Stack>
  );
}

export function MetaFooter({
  children,
  trailing,
}: Readonly<{ children: ReactNode; trailing?: ReactNode }>) {
  if (!trailing)
    return (
      <footer className="text-caption text-ink-2 border-rule flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3">
        {children}
      </footer>
    );
  return (
    <footer className="text-caption text-ink-2 border-rule flex flex-wrap items-center justify-between gap-2 border-t pt-3">
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">{children}</div>
      {trailing}
    </footer>
  );
}

export function FloatingToolbar({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className={cn(POP_FACE, 'absolute end-3 top-3 z-raised flex gap-1 p-1')}>{children}</div>
  );
}
