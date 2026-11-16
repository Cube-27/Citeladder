import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import { slipClasses } from '@/components/ui/slip';

/**
 * An offer and the controls that act on it (a plan, an add-on, a plan
 * change): a slip, padding 16, its text on top and its controls in a foot
 * pinned to the bottom, 16 below the text. Laid side by side in a `slips`
 * grid, the cards of a row share a height, so every foot (and every button)
 * sits on one line. The text's anatomy (title and captions) is the caller's.
 */
export function ControlRow({
  children,
  controls,
  ...props
}: Readonly<
  Omit<ComponentPropsWithoutRef<'div'>, 'className' | 'children'> & {
    children: ReactNode;
    controls: ReactNode;
  }
>) {
  return (
    <div
      {...props}
      data-control-row=""
      className={slipClasses('flex h-full flex-col gap-[var(--compact-gap)]')}
    >
      <div className="min-w-0 flex-1">
        <div className="grid min-w-0 gap-1">{children}</div>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-end gap-2">{controls}</div>
    </div>
  );
}
