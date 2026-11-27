import type { ReactNode } from 'react';

import { ChevronDown } from '@/lib/icons';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Menu, MenuContent, MenuTrigger } from '@/components/ui/menu';

import './split-button.css';

export function SplitButton({
  action,
  menuLabel,
  disabled = false,
  children,
}: Readonly<{
  action: ReactNode;
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
            data-split-trigger=""
          >
            <Icon icon={ChevronDown} />
          </Button>
        </MenuTrigger>
        <MenuContent align="end">{children}</MenuContent>
      </Menu>
    </span>
  );
}
