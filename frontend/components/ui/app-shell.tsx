import { useId, useState, type ReactNode } from 'react';

import { IconButton } from '@/components/ui/button';
import { Drawer } from '@/components/ui/drawer';
import { SidebarResizeHandle } from '@/components/ui/sidebar-resize-handle';
import { Menu } from '@/lib/icons';
import { useSidebarCollapsed, useSidebarWidth } from '@/lib/sidebar-width';

const FRAME =
  'bg-ground text-ink grid h-dvh overflow-hidden grid-cols-1 rail:grid-cols-[var(--spacing-sidebar-compact)_minmax(0,1fr)] shell:grid-cols-[var(--spacing-sidebar)_minmax(0,1fr)] data-[sidebar-state=collapsed]:rail:grid-cols-[var(--spacing-sidebar-rail)_minmax(0,1fr)] transition-[grid-template-columns] duration-open ease-[ease-in-out] motion-reduce:transition-none has-[[data-dragging]]:transition-none';
const SIDEBAR_COLUMN = 'rail:block z-sticky relative hidden min-h-0 min-w-0';
const PANEL =
  '@container/main bg-page rail:ms-0 rail:rounded-card rail:ring-1 ring-rule/50 m-shell-inset relative flex min-h-0 min-w-0 flex-col overflow-y-auto overscroll-contain px-page-inline';
const PAGE = 'flex w-full min-w-0 flex-1 flex-col';

function useFrameState(): { width: string | undefined; state: 'collapsed' | 'expanded' } {
  const width = useSidebarWidth();
  const collapsed = useSidebarCollapsed();
  return {
    width: width === null ? undefined : `${width}px`,
    state: collapsed ? 'collapsed' : 'expanded',
  };
}

export function AppShellFrame({
  sidebar,
  children,
}: Readonly<{ sidebar: ReactNode; children: ReactNode }>) {
  const sidebarId = useId();
  const { width, state } = useFrameState();
  const [shownState, setShownState] = useState(state);
  const [toggled, setToggled] = useState(false);
  if (shownState !== state) {
    setShownState(state);
    setToggled(true);
  }
  return (
    <div
      data-app-surface=""
      data-sidebar-state={state}
      data-sidebar-toggled={toggled || undefined}
      className={FRAME}
      style={{ '--spacing-sidebar': width, '--spacing-sidebar-compact': width }}
    >
      <a href="#main" className="skip-link">
        Skip to main content
      </a>
      <aside id={sidebarId} aria-label="Sidebar" className={SIDEBAR_COLUMN}>
        {sidebar}
        {state === 'expanded' ? <SidebarResizeHandle sidebarId={sidebarId} /> : null}
      </aside>
      <main id="main" tabIndex={-1} data-main-column="" className={PANEL}>
        <div className={PAGE}>{children}</div>
      </main>
    </div>
  );
}

export function AppShellPlaceholder({
  busy,
  sidebar,
  children,
}: Readonly<{ busy: boolean; sidebar: ReactNode; children: ReactNode }>) {
  const { width, state } = useFrameState();
  return (
    <div
      data-app-surface=""
      data-sidebar-state={state}
      className={FRAME}
      style={{ '--spacing-sidebar': width, '--spacing-sidebar-compact': width }}
      aria-busy={busy || undefined}
    >
      <div className={SIDEBAR_COLUMN} inert>
        {sidebar}
      </div>
      <main id="main" tabIndex={-1} data-main-column="" className={PANEL}>
        <div className={PAGE}>{children}</div>
      </main>
    </div>
  );
}

export function NavMenuButton({
  expanded,
  onOpen,
}: Readonly<{ expanded: boolean; onOpen: () => void }>) {
  return (
    <IconButton
      icon={Menu}
      label="Open navigation"
      aria-haspopup="dialog"
      aria-expanded={expanded}
      onClick={onOpen}
      box="rail-hidden-fixed"
    />
  );
}

export function NavDrawer({
  open,
  onOpenChange,
  children,
}: Readonly<{ open: boolean; onOpenChange: (open: boolean) => void; children: ReactNode }>) {
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      side="left"
      title="Navigation"
      hideHeader
      body="dock"
      closeLabel="Close navigation"
    >
      <div data-nav-drawer="" className="bg-ground flex min-h-0 flex-1 flex-col">
        {children}
      </div>
    </Drawer>
  );
}
