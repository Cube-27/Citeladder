import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

import { NoticeScreen } from '@/components/templates/notice-page';
import { AppShellPlaceholder } from '@/components/ui/app-shell';

import { RouteLoadingScreen } from './page-shell';
import { hasPageTitle } from '@/lib/navigation/app-routes';

/**
 * The placeholder shown while the SESSION and the shell's opening decision are
 * still resolving — before the app knows whether this visitor is signed in at
 * all, so before any chrome can be drawn.
 *
 * It intentionally contains geometry only: before session identity resolves,
 * navigation, project names, account controls, and capability claims would all
 * be private or misleading.
 *
 * The geometry it does draw is the shell's own (`AppShellPlaceholder`): the
 * sidebar's column at the width `AppShell` gives it and the page inset where
 * the settled shell puts it. Inside it draws the destination page's own
 * loading frame — the header named from the path (a route title, never
 * private data) and the loading box where the content begins — so when the
 * shell opens around it, only the sidebar fills in.
 */
export function ShellFallback({ children }: Readonly<{ children?: ReactNode }>) {
  return (
    <AppShellPlaceholder busy={children === undefined}>
      {children === undefined ? <DestinationLoading /> : children}
    </AppShellPlaceholder>
  );
}

const WORKSPACE_LOADING = 'Loading your workspace…';

/** A shell page's loading frame; a path the shell has no page for shows the loading notice. */
function DestinationLoading() {
  const { pathname } = useLocation();
  return hasPageTitle(pathname ?? '') ? (
    <RouteLoadingScreen label={WORKSPACE_LOADING} />
  ) : (
    <NoticeScreen tone="loading" heading={WORKSPACE_LOADING} />
  );
}
