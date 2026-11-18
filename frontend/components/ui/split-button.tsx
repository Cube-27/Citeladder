import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Menu, MenuContent, MenuTrigger } from '@/components/ui/menu';

/**
 * SplitButton — one secondary control: the action and a menu of its
 * variants, joined into a single bordered button. The two halves share one
 * edge as the divider, one height and the outer radius; each takes its own
 * hover and focus. `action` is the button itself (an `ActionButton`, possibly
 * in a tooltip); `children` are the menu's `MenuItem`s.
 */
export function SplitButton({
  action,
  menuLabel,
  disabled = false,
  children,
}: Readonly<{
  action: ReactNode;
  /** The trigger's accessible name ("More crawl options"). */
  menuLabel: string;
  disabled?: boolean;
  children: ReactNode;
}>) {
  return (
    // The joined inner corners and the shared edge are in globals.css ("split button").
    <span data-split-button="" className="inline-flex">
      {action}
      <Menu>
        <MenuTrigger asChild>
          <Button variant="secondary" disabled={disabled} aria-label={menuLabel} className="px-2">
            <Icon icon={ChevronDown} />
          </Button>
        </MenuTrigger>
        <MenuContent align="end">{children}</MenuContent>
      </Menu>
    </span>
  );
}
