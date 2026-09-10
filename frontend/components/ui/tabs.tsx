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
  /** Trailing controls pinned to the right of the tab strip, sharing its baseline. */
  actions?: ReactNode;
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
  actions,
  fill = false,
}: Readonly<TabsProps<T>>) {
  return (
    <ActiveTabContext value={value}>
      <TabsPrimitive.Root
        value={value}
        onValueChange={(next) => onValueChange(next as T)}
        className={rootClassName}
      >
        <TabRow actions={actions}>
          <TabsPrimitive.List
            aria-label={ariaLabel}
            className={cn(
              'border-border relative flex max-w-full flex-nowrap gap-[var(--tab-gap)] overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
              // With actions alongside, the row owns the rule so both share one baseline.
              actions ? 'min-w-0 flex-1' : 'w-full border-b',
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
                  'focus-ring text-secondary hover:text-foreground data-[state=active]:text-accent-text relative inline-flex h-[var(--tab-height)] items-center px-0 text-sm font-medium whitespace-nowrap transition-colors disabled:opacity-50',
                  fill ? 'flex-1 basis-0 justify-center px-3' : 'shrink-0',
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
        </TabRow>
        {children}
      </TabsPrimitive.Root>
    </ActiveTabContext>
  );
}

/** Keeps the tab strip and its trailing actions on one baseline, sharing the bottom rule. */
function TabRow({ actions, children }: Readonly<{ actions?: ReactNode; children: ReactNode }>) {
  if (!actions) return <>{children}</>;
  return (
    <div className="border-border flex w-full max-w-full items-center gap-3 border-b">
      {children}
      <div className="flex h-[var(--tab-height)] shrink-0 items-center gap-2">{actions}</div>
    </div>
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
