import type { CSSProperties, ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Menu, MenuContent, MenuTrigger } from '@/components/ui/menu';

// The halves meet square, and the trigger's edge lies on the action's as the
// one divider. Inline, so the joint adds nothing to the eager stylesheet.
/** The action half's `style`: its end corners square where the trigger joins. */
export const SPLIT_ACTION_JOIN: CSSProperties = { borderStartEndRadius: 0, borderEndEndRadius: 0 };
const TRIGGER_JOIN: CSSProperties = {
  marginInlineStart: -1,
  borderStartStartRadius: 0,
  borderEndStartRadius: 0,
};

/**
 * SplitButton — one secondary control: the action and a menu of its
 * variants, joined into a single bordered button. The two halves share one
 * edge as the divider, one height and the outer radius; each takes its own
 * hover and focus. `action` is the action button (an `ActionButton`,
 * possibly in a tooltip) styled with `SPLIT_ACTION_JOIN`; `children` are the
 * menu's `MenuItem`s.
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
    <span data-split-button="" className="inline-flex">
      {action}
      <Menu>
        <MenuTrigger asChild>
          <Button
            variant="secondary"
            disabled={disabled}
            aria-label={menuLabel}
            className="px-2"
            style={TRIGGER_JOIN}
          >
            <Icon icon={ChevronDown} />
          </Button>
        </MenuTrigger>
        <MenuContent align="end">{children}</MenuContent>
      </Menu>
    </span>
  );
}
