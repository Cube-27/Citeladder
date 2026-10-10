'use client';

import { useMutation } from '@tanstack/react-query';
import { LogOut, Plug } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownLabel,
  DropdownSeparator,
  DropdownTrigger,
} from '@/components/ui/dropdown';
import { authApi } from '@/lib/api/auth';
import { useSession } from '@/lib/auth/session-guard';
import { ICONS } from '@/lib/icons';
import { workspaceDestination } from '@/lib/navigation/project-destination';
import { useProjectContext } from '@/lib/project/project-context';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';

const SettingsIcon = ICONS.settings;
const BillingIcon = ICONS.billing;

type UserMenuState = {
  email: string;
  logout: { mutate: () => void; isError: boolean; isPending: boolean };
  activePresenter: UserMenuPresenter | null;
  setOpen: (presenter: UserMenuPresenter, open: boolean) => void;
};

type UserMenuPresenter = 'sidebar' | 'compact' | 'header';

const UserMenuContext = createContext<UserMenuState | null>(null);

function useUserMenu() {
  const state = useContext(UserMenuContext);
  if (!state) throw new Error('UserMenuTrigger must render inside UserMenuController.');
  return state;
}

function UserMenuContent({ presenter }: Readonly<{ presenter: UserMenuPresenter }>) {
  const { email, logout } = useUserMenu();
  const { activeWorkspaceId } = useProjectContext();
  const compact = presenter !== 'sidebar';
  const settingsHref = activeWorkspaceId
    ? workspaceDestination('/settings', null, activeWorkspaceId)
    : '/settings';
  const billingHref = activeWorkspaceId
    ? workspaceDestination('/billing', null, activeWorkspaceId)
    : '/billing';
  const connectHref = activeWorkspaceId
    ? workspaceDestination(
        '/settings',
        new URLSearchParams({ tab: 'connections' }),
        activeWorkspaceId,
      )
    : '/settings?tab=connections';
  return (
    <DropdownContent
      align={compact ? 'end' : 'start'}
      side={compact ? 'bottom' : 'top'}
      className="w-56"
    >
      <DropdownLabel>{email}</DropdownLabel>
      <DropdownSeparator />
      <DropdownItem asChild>
        <Link to={settingsHref}>
          <SettingsIcon className="size-4 shrink-0" aria-hidden />
          <span>Settings</span>
        </Link>
      </DropdownItem>
      <DropdownItem asChild>
        <Link to={billingHref}>
          <BillingIcon className="size-4 shrink-0" aria-hidden />
          <span>Billing</span>
        </Link>
      </DropdownItem>
      <DropdownItem asChild>
        <Link to={connectHref}>
          <Plug className="size-4 shrink-0" aria-hidden />
          <span>Connect AI assistants</span>
        </Link>
      </DropdownItem>
      <DropdownSeparator />
      <DropdownItem
        onSelect={(event) => {
          event.preventDefault();
          logout.mutate();
        }}
        disabled={logout.isPending}
      >
        <LogOut className="size-4 shrink-0" aria-hidden />
        <span>{logout.isPending ? 'Signing out…' : 'Sign out'}</span>
      </DropdownItem>
      {logout.isError ? (
        <p role="alert" className="type-caption text-danger-text px-2 py-2">
          Sign out failed. Your session is still active; please try again.
        </p>
      ) : null}
    </DropdownContent>
  );
}

export function UserMenuTrigger({
  className,
  presenter,
}: Readonly<{ className?: string; presenter: UserMenuPresenter }>) {
  const { activePresenter, email, setOpen } = useUserMenu();
  const open = activePresenter === presenter;
  const compact = presenter !== 'sidebar';
  return (
    <div className={cn('flex items-center gap-1', className)}>
      <Dropdown open={open} onOpenChange={(next) => setOpen(presenter, next)}>
        <DropdownTrigger
          aria-label={compact ? `Account menu for ${email}` : undefined}
          className={cn(
            'focus-ring hover:bg-hover active:bg-active data-[state=open]:bg-selected hover:text-foreground flex min-w-0 flex-1 items-center gap-2 rounded-[var(--radius-control)] px-2 text-left transition-colors',
            compact ? 'min-h-11' : 'py-1',
          )}
        >
          <Avatar name={email} size="sm" />
          {compact ? null : <span className="type-body min-w-0 flex-1 truncate">{email}</span>}
        </DropdownTrigger>
        {open ? <UserMenuContent presenter={presenter} /> : null}
      </Dropdown>
    </div>
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
