'use client';

import { useMutation } from '@tanstack/react-query';
import { ArrowUpRight, LogOut, Map } from 'lucide-react';
import Link from 'next/link';
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
import { cn, emailInitials } from '@/lib/utils';
import { textRole } from '@/components/ui/typography';

const SettingsIcon = ICONS.settings;

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
  const compact = presenter !== 'sidebar';
  return (
    <DropdownContent
      align={compact ? 'end' : 'start'}
      side={compact ? 'bottom' : 'top'}
      className="w-56"
    >
      <DropdownLabel>{email}</DropdownLabel>
      <DropdownSeparator />
      <DropdownItem asChild>
        <Link href="/settings">
          <SettingsIcon className="size-4 shrink-0" aria-hidden />
          <span>Settings</span>
        </Link>
      </DropdownItem>
      <DropdownItem asChild>
        <Link href="/docs/mcp" target="_blank">
          <ArrowUpRight className="size-4 shrink-0" aria-hidden />
          <span>MCP</span>
        </Link>
      </DropdownItem>
      <DropdownItem
        onSelect={() => {
          window.dispatchEvent(new Event('citeladder:replay-product-tour'));
        }}
      >
        <Map className="size-4 shrink-0" aria-hidden />
        <span>Replay product tour</span>
      </DropdownItem>
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
        <p role="alert" className="text-danger px-2 py-1.5 text-xs">
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
          className="focus-ring hover:bg-accent-soft hover:text-accent-text flex min-w-0 flex-1 items-center gap-2 rounded-[var(--radius-control)] px-2 py-1 text-left transition-colors"
        >
          {/* A solid filled accent disc, not a tinted box. At 24px with two
              letters in it the glyphs reached the edges and the shape read as
              a square with rounded corners; 28px with the smaller numeral size
              leaves the initials inside the circle. Accent fill with its own
              foreground keeps one contrast pair rather than dark ink on a
              near-neutral tint. */}
          <span
            aria-hidden
            className={textRole(
              'label',
              'bg-accent text-accent-fg flex size-7 shrink-0 items-center justify-center rounded-full text-xs uppercase',
            )}
          >
            {emailInitials(email)}
          </span>
          {compact ? null : (
            <span className="text-secondary min-w-0 flex-1 truncate text-sm">{email}</span>
          )}
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
