import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

import { NoticeScreen } from '@/components/templates/notice-page';
import { AppShellFrame } from '@/components/ui/app-shell';
import { hasPageTitle } from '@/lib/navigation/app-routes';

import { AppSidebar } from './app-sidebar';
import { RouteLoadingScreen } from './page-shell';
import { ShellContext } from './shell-context';

export function ShellFallback({ children }: Readonly<{ children?: ReactNode }>) {
  return (
    <ShellContext.Provider value={FALLBACK_SHELL}>
      <AppShellFrame
        state={children === undefined ? 'loading' : 'held'}
        sidebar={<AppSidebar pending />}
      >
        {children === undefined ? <DestinationLoading /> : children}
      </AppShellFrame>
    </ShellContext.Provider>
  );
}

const FALLBACK_SHELL = {
  navDrawer: { open: false, onOpen: () => {} },
  searchTrigger: null,
  agentTrigger: null,
} as const;

function DestinationLoading() {
  const { pathname } = useLocation();
  return hasPageTitle(pathname ?? '') ? (
    <RouteLoadingScreen />
  ) : (
    <NoticeScreen tone="loading" heading="Loading your workspace…" />
  );
}
