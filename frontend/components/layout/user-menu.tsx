import { useMutation } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router-dom';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { SidebarIdentButton, SidebarTextTooltip } from '@/components/ui/sidebar';
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
import { LogOut } from '@/lib/icons';
import { revokeSession } from '@/lib/auth/account-transition';
import { useSession } from '@/lib/auth/session-guard';
import { scopedNavigationDestination } from '@/lib/navigation/project-destination';
import { useUrlSearch } from '@/lib/navigation/url-params';
import { useProjectContext } from '@/lib/project/project-context';
import { Avatar } from '@/components/ui/avatar';

import { ACCOUNT_MENU_ITEMS, isAccountCurrent, isNavItemActive } from './nav-items';

type UserMenuState = {
  email: string;
  logout: { mutate: () => void; isError: boolean; isPending: boolean };
  activePresenter: UserMenuPresenter | null;
  setOpen: (presenter: UserMenuPresenter, open: boolean) => void;
};

type UserMenuPresenter = 'sidebar' | 'drawer' | 'compact';

const UserMenuContext = createContext<UserMenuState | null>(null);

function useUserMenu() {
  const state = useContext(UserMenuContext);
  if (!state) throw new Error('UserMenuTrigger must render inside UserMenuController.');
  return state;
}

function UserMenuContent({
  presenter,
  currentHref,
}: Readonly<{ presenter: UserMenuPresenter; currentHref?: string }>) {
  const { email, logout } = useUserMenu();
  const { activeProjectId, activeWorkspaceId } = useProjectContext();
  const sidebar = presenter !== 'compact';
  return (
    <MenuContent align={sidebar ? 'start' : 'end'} side={sidebar ? 'top' : 'bottom'}>
      <MenuLabel>{email}</MenuLabel>
      <MenuSeparator />
      {ACCOUNT_MENU_ITEMS.map(({ label, href, icon: Icon, scope }) => (
        <MenuLinkItem key={href}>
          <Link
            to={scopedNavigationDestination(href, scope, activeProjectId, activeWorkspaceId)}
            aria-current={href === currentHref ? 'page' : undefined}
          >
            <Icon className="size-3.5 shrink-0" aria-hidden />
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
        <p role="alert" className="text-caption text-negative px-2 py-2">
          Sign out failed. Your session is still active; please try again.
        </p>
      ) : null}
    </MenuContent>
  );
}

export function UserMenuTrigger({ presenter }: Readonly<{ presenter: UserMenuPresenter }>) {
  const { activePresenter, email, setOpen } = useUserMenu();
  const { activeWorkspace } = useProjectContext();
  const { pathname } = useLocation();
  const searchParams = useUrlSearch();
  const currentHref = ACCOUNT_MENU_ITEMS.filter((item) =>
    isNavItemActive(pathname, searchParams, item),
  ).sort((a, b) => b.href.length - a.href.length)[0]?.href;
  const open = activePresenter === presenter;
  const label = `Account menu for ${email}`;
  return (
    <Menu open={open} onOpenChange={(next) => setOpen(presenter, next)}>
      {presenter === 'compact' ? (
        <MenuTrigger
          aria-label={label}
          className="focus-ring not-data-[state=open]:hover:overlay-hover data-[state=open]:overlay-pressed rounded-control size-control-md flex shrink-0 items-center justify-center transition-colors"
        >
          <Avatar name={email} />
        </MenuTrigger>
      ) : (
        <SidebarTextTooltip inRail="only">
          <MenuTrigger asChild>
            <SidebarIdentButton
              aria-label={label}
              title={email}
              meta={activeWorkspace?.name}
              current={isAccountCurrent(pathname, searchParams)}
              lead={<Avatar name={email} />}
            />
          </MenuTrigger>
        </SidebarTextTooltip>
      )}
      <UserMenuContent presenter={presenter} currentHref={currentHref} />
    </Menu>
  );
}

export function UserMenuController({ children }: Readonly<{ children: ReactNode }>) {
  const { user, clearSession } = useSession();
  const [activePresenter, setActivePresenter] = useState<UserMenuPresenter | null>(null);
  // react-doctor-disable-next-line react-doctor/query-mutation-missing-invalidation
  const logout = useMutation({
    mutationFn: revokeSession,
    onSuccess: () => clearSession(),
  });
  const setOpen = useCallback(
    (presenter: UserMenuPresenter, open: boolean) => setActivePresenter(open ? presenter : null),
    [],
  );

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
