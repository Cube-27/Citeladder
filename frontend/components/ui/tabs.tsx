'use client';

import type { ReactNode } from 'react';
import { createContext, useContext } from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';

import { cn } from '@/lib/utils';

type TabItem<T extends string> = { value: T; label: ReactNode; disabled?: boolean };
const ActiveTabContext = createContext<string | null>(null);

export type TabsProps<T extends string> = {
  value: T;
  onValueChange: (value: T) => void;
  items: readonly TabItem<T>[];
  ariaLabel: string;
  children?: ReactNode;
  className?: string;
  rootClassName?: string;
  onIntent?: (value: T) => void;
  /**
   * Triggers share the list's full width instead of hugging their labels.
   * For a tab strip that heads a card, so the row has no dead right edge.
   */
  fill?: boolean;
};

export function Tabs<T extends string>({
  value,
  onValueChange,
  items,
  ariaLabel,
  children,
  className,
  rootClassName,
  onIntent,
  fill = false,
}: Readonly<TabsProps<T>>) {
  return (
    <ActiveTabContext value={value}>
      <TabsPrimitive.Root
        value={value}
        onValueChange={(next) => onValueChange(next as T)}
        className={rootClassName}
      >
        <TabsPrimitive.List
          aria-label={ariaLabel}
          className={cn(
            'border-border relative flex w-full max-w-full flex-nowrap gap-1 overflow-x-auto border-b [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
            // Filled tabs must not scroll: sharing the width is the point.
            fill && 'gap-0 overflow-x-visible',
            className,
          )}
        >
          {items.map((item) => (
            <TabsPrimitive.Trigger
              key={item.value}
              value={item.value}
              disabled={item.disabled}
              onMouseEnter={() => onIntent?.(item.value)}
              onFocus={() => onIntent?.(item.value)}
              className={cn(
                'focus-ring text-secondary hover:text-foreground data-[state=active]:text-accent-text relative inline-flex h-10 items-center px-3 text-sm font-medium whitespace-nowrap transition-colors disabled:opacity-50',
                fill ? 'flex-1 basis-0 justify-center' : 'shrink-0',
              )}
            >
              {item.label}
              {item.value === value ? (
                <span
                  className={cn(
                    'bg-accent absolute bottom-0 h-0.5',
                    fill ? 'inset-x-0' : 'inset-x-2',
                  )}
                />
              ) : null}
            </TabsPrimitive.Trigger>
          ))}
        </TabsPrimitive.List>
        {children}
      </TabsPrimitive.Root>
    </ActiveTabContext>
  );
}

export function TabPanel({
  value,
  className,
  children,
  forceMount,
}: Readonly<{ value: string; className?: string; children: ReactNode; forceMount?: true }>) {
  const activeValue = useContext(ActiveTabContext);
  return (
    <TabsPrimitive.Content
      value={value}
      forceMount={forceMount}
      hidden={activeValue !== value}
      className={cn('outline-none', className)}
    >
      {children}
    </TabsPrimitive.Content>
  );
}
