import type { ComponentPropsWithoutRef } from 'react';

import { cn } from '@/lib/utils';

const GROUND_LAYOUT = {
  block: undefined,
  grid: 'grid',
  column: 'flex flex-col',
} as const;

export function PageGround({
  layout = 'block',
  split = false,
  children,
  ...props
}: Readonly<
  Omit<ComponentPropsWithoutRef<'div'>, 'className' | 'style'> & {
    layout?: keyof typeof GROUND_LAYOUT;
    split?: boolean;
  }
>) {
  return (
    <div
      {...props}
      className={cn(
        'text-ink min-h-dvh antialiased',
        GROUND_LAYOUT[layout],
        split ? 'bg-panel desktop:grid-cols-2' : 'bg-ground',
      )}
    >
      {children}
    </div>
  );
}

const FLOW_MAIN = {
  frame: 'max-w-flow px-gutter pt-flow-gap mx-auto w-full',
  page: 'max-w-flow px-gutter pb-flow-gap pt-[max(var(--spacing-flow-gap),calc(20dvh_-_var(--spacing-masthead)))] controls-lg mx-auto flex w-full flex-1 flex-col',
} as const;

export function FlowMain({
  variant,
  children,
  ...props
}: Readonly<
  Omit<ComponentPropsWithoutRef<'main'>, 'className' | 'style'> & {
    variant: keyof typeof FLOW_MAIN;
  }
>) {
  return (
    <main {...props} className={FLOW_MAIN[variant]}>
      {children}
    </main>
  );
}
