/**
 * The route manifest's types (lib/navigation/app-routes.ts). Types only: the
 * build loads the manifest in Node, which erases these imports.
 */
import type { ComponentType } from 'react';

import type { LoadingShape } from '@/components/ui/skeleton-block';
import type { IconName } from '@/lib/icons';

/**
 * Who a destination belongs to: `public` needs no session; `workspace` manages
 * the workspace (reachable with no project at all); `project` works inside the
 * active project.
 */
type RouteScope = 'public' | 'workspace' | 'project';

/**
 * The sidebar's groups. Dashboard mode lists `home`, `brand`, `tracking`,
 * `website`, `search` and `commerce`; Agent mode lists `agent`; `foot` sits
 * above the account in both.
 */
export type SidebarGroup =
  | 'home'
  | 'brand'
  | 'tracking'
  | 'website'
  | 'search'
  | 'commerce'
  | 'agent'
  | 'foot';

/**
 * Where a nav entry is listed: a sidebar group (the command palette lists the
 * same groups in the same order), the account menu, or the palette alone:
 * under Settings, or under a Dashboard group (`palette:<group>`).
 */
export type NavPlacement =
  | `sidebar:${SidebarGroup}`
  | `palette:${Exclude<SidebarGroup, 'agent' | 'foot'>}`
  | 'account'
  | 'palette';

/** One way into a destination. A route may have several (a settings tab). */
export type NavEntry = {
  label: string;
  icon: IconName;
  /** Query the entry adds to the route's path, e.g. `tab=integrations`. */
  search?: string;
  /** A live count shown beside the label. */
  badge?: 'open-actions';
  /** A managed plan has no provider settings (B32). */
  hiddenWhenManaged?: true;
  /** Listed after the placement's other entries rather than in manifest order. */
  listedLast?: true;
  placements: readonly NavPlacement[];
};

/** A nav entry with its full address and the scope its link carries. */
export type NavDestination = Pick<NavEntry, 'label' | 'icon' | 'badge' | 'hiddenWhenManaged'> & {
  href: string;
  scope: Exclude<RouteScope, 'public'>;
};

export type Screen = () => Promise<{ default: ComponentType }>;

/**
 * What a shell route draws before its page can (RouteLoadingScreen), so
 * nothing moves when the page arrives: `cards` is its real tab labels, a held
 * filter row, then its first screen's shapes in order; `overview`, `thread`
 * and `new-chat` are those screens' own loading layouts.
 */
export type RouteLoading =
  | Readonly<{
      kind: 'cards';
      tabs?: readonly string[];
      filters?: boolean;
      shapes: readonly LoadingShape[];
    }>
  | Readonly<{ kind: 'overview' | 'thread' | 'new-chat' }>;

export type AppRouteRecord = {
  /** A React Router pattern; `:name` segments match one path segment. */
  path: string;
  /** The page header and document title; null where the route draws its own. */
  title: string | null;
  scope: RouteScope;
  /** Drawn inside the application shell (sidebar, masthead). */
  shell: boolean;
  screen: Screen;
  /**
   * For a path naming one project's record: the section a project switch
   * lands on, since the next project does not have that record.
   */
  collection?: string;
  /** The URL carries a single-use bearer credential (an email or invitation link). */
  credentialInUrl?: true;
  nav?: readonly NavEntry[];
  /** A shell route's loading frame; without one it draws a record's. */
  loading?: RouteLoading;
  /**
   * A reading page (`narrow`) sits centred in the chat's `max-w-thread`, a
   * page of settings rows (`compact`) in `max-w-prose`; else it fills the main column.
   */
  width?: 'narrow' | 'compact';
};
