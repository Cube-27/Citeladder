'use client';

import { useMutation } from '@tanstack/react-query';
import { LogOut } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { SidebarIdentButton, SidebarTextTooltip } from '@/components/ui/app-shell';
import {
  Menu,
  MenuContent,
  MenuControlRow,
  MenuItem,
  MenuLabel,
  MenuLinkItem,
  MenuSeparator,
  MenuTrigger,
} from '@/components/ui/menu';
import { ThemeSwitch } from '@/components/ui/theme-switch';
import { authApi } from '@/lib/api/auth';
import { useSession } from '@/lib/auth/session-guard';
import { scopedNavigationDestination } from '@/lib/navigation/project-destination';
import { useProjectContext } from '@/lib/project/project-context';
import { Avatar } from '@/components/ui/avatar';

import { USER_MENU_ITEMS } from './nav-items';

type UserMenuState = {
  email: string;
  logout: { mutate: () => void; isError: boolean; isPending: boolean };
  activePresenter: UserMenuPresenter | null;
  setOpen: (presenter: UserMenuPresenter, open: boolean) => void;
};

type UserMenuPresenter = 'sidebar' | 'compact';

const UserMenuContext = createContext<UserMenuState | null>(null);

function useUserMenu() {
  const state = useContext(UserMenuContext);
  if (!state) throw new Error('UserMenuTrigger must render inside UserMenuController.');
  return state;
}

function UserMenuContent({ presenter }: Readonly<{ presenter: UserMenuPresenter }>) {
  const { email, logout } = useUserMenu();
  const { activeProjectId, activeWorkspaceId } = useProjectContext();
  const sidebar = presenter === 'sidebar';
  return (
    <MenuContent align={sidebar ? 'start' : 'end'} side={sidebar ? 'top' : 'bottom'}>
      <MenuLabel>{email}</MenuLabel>
      <MenuSeparator />
      {USER_MENU_ITEMS.map(({ label, href, icon: Icon, scope }) => (
        <MenuLinkItem key={href}>
          <Link to={scopedNavigationDestination(href, scope, activeProjectId, activeWorkspaceId)}>
            <Icon className="size-4 shrink-0" aria-hidden />
            <span>{label}</span>
          </Link>
        </MenuLinkItem>
      ))}
      <MenuSeparator />
      <MenuControlRow label="Theme">
        <ThemeSwitch tooltipSide="top" />
      </MenuControlRow>
      <MenuSeparator />
      <MenuItem
        icon={<LogOut aria-hidden />}
        onSelect={(event) => {
          event.preventDefault();
          logout.mutate();
        }}
        disabled={logout.isPending}
      >
        {logout.isPending ? 'Signing out…' : 'Sign out'}
      </MenuItem>
      {logout.isError ? (
        <p role="alert" className="type-caption text-negative px-2 py-2">
          Sign out failed. Your session is still active; please try again.
        </p>
      ) : null}
    </MenuContent>
  );
}

/**
 * The account trigger. In the sidebar it is the system's identity button
 * (the email over the workspace, an avatar in the rail); in a signed-in flow
 * bar it is the avatar alone.
 */
export function UserMenuTrigger({ presenter }: Readonly<{ presenter: UserMenuPresenter }>) {
  const { activePresenter, email, setOpen } = useUserMenu();
  const { activeWorkspace } = useProjectContext();
  const open = activePresenter === presenter;
  const label = `Account menu for ${email}`;
  return (
    <Menu open={open} onOpenChange={(next) => setOpen(presenter, next)}>
      {presenter === 'sidebar' ? (
        <SidebarTextTooltip inRail>
          <MenuTrigger asChild>
            <SidebarIdentButton
              aria-label={label}
              title={email}
              meta={activeWorkspace?.name}
              lead={<Avatar name={email} />}
            />
          </MenuTrigger>
        </SidebarTextTooltip>
      ) : (
        <MenuTrigger
          aria-label={label}
          className="focus-ring hover:bg-surface-sunken data-[state=open]:bg-surface-sunken flex size-[var(--control-md)] shrink-0 items-center justify-center rounded-md transition-colors"
        >
          <Avatar name={email} />
        </MenuTrigger>
      )}
      {open ? <UserMenuContent presenter={presenter} /> : null}
    </Menu>
  );
}

export function UserMenuController({ children }: Readonly<{ children: ReactNode }>) {
  const { user, clearSession } = useSession();
  const [activePresenter, setActivePresenter] = useState<UserMenuPresenter | null>(null);
  // clearSession removes account-scoped cache only after cookie revocation succeeds.
  // react-doctor-disable-next-line react-doctor/query-mutation-missing-invalidation
  const logout = useMutation({
    mutationFn: () => authApi.logout(),
    onSuccess: () => clearSession(),
  });
  const setOpen = useCallback(
    (presenter: UserMenuPresenter, open: boolean) => setActivePresenter(open ? presenter : null),
    [],
  );

  // useMutation returns a fresh object every render, so the context value is
  // built from the three fields consumers read rather than the result itself.
  const { mutate: logoutMutate, isError: logoutIsError, isPending: logoutIsPending } = logout;
  const value = useMemo<UserMenuState>(
    () => ({
      email: user.email,
      logout: { mutate: logoutMutate, isError: logoutIsError, isPending: logoutIsPending },
      activePresenter,
      setOpen,
    }),
    [user.email, logoutMutate, logoutIsError, logoutIsPending, activePresenter, setOpen],
  );

  return <UserMenuContext.Provider value={value}>{children}</UserMenuContext.Provider>;
}
