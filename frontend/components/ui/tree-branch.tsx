import type { ElementType, ReactNode } from 'react';

import { Stack } from '@/components/ui/layout';
import { Pressable } from '@/components/ui/pressable';
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
