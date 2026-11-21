import type { ReactNode } from 'react';

import { Plus } from '@/lib/icons';
import { IconButton } from '@/components/ui/button';
import { Menu, MenuContent, MenuLinkItem, MenuTrigger } from '@/components/ui/menu';
import { ProjectLink } from '@/components/ui/project-link';

/**
 * A prompt input's action menu (the AI Elements PromptInput pattern): a "+"
 * icon button at the start of the composer's control row opening a menu whose
 * rows open one submenu each (`MenuSub`). The menu floats in a portal, so
 * opening it never moves the composer.
 */
export function PromptActionMenu({
  label,
  open,
  onOpenChange,
  disabled = false,
  onCloseAutoFocus,
  children,
}: Readonly<{
  label: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
  onCloseAutoFocus?: (event: Event) => void;
  children: ReactNode;
}>) {
  return (
    <Menu open={disabled ? false : open} onOpenChange={onOpenChange}>
      <MenuTrigger asChild>
        <IconButton icon={Plus} label={label} disabled={disabled} tooltip={false} />
      </MenuTrigger>
      <MenuContent align="start" side="top" onCloseAutoFocus={onCloseAutoFocus}>
        {children}
      </MenuContent>
    </Menu>
  );
}

/**
 * A row that goes to an app route: its label, truncating, then an optional
 * detail in the muted ink at the row's end.
 */
export function PromptMenuLink({
  href,
  label,
  detail,
  accessibleName,
}: Readonly<{ href: string; label: string; detail?: string | null; accessibleName?: string }>) {
  return (
    <MenuLinkItem>
      <ProjectLink href={href} aria-label={accessibleName}>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {detail ? <span className="text-ink-2 shrink-0 ps-4">{detail}</span> : null}
      </ProjectLink>
    </MenuLinkItem>
  );
}
