import { useId, useState, type CSSProperties, type ReactNode } from 'react';

import { IconButton } from '@/components/ui/button';
import { Drawer } from '@/components/ui/drawer';
import { SidebarResizeHandle } from '@/components/ui/sidebar-resize-handle';
import { Menu } from '@/lib/icons';
import { useSidebarCollapsed, useSidebarWidth } from '@/lib/sidebar-width';

/**
 * The signed-in frame: the sidebar on the window's `ground` beside the inset
 * panel, the page's one scroller.
 *
 * From `rail:` (900px) the sidebar is a labelled column, 200 wide below
 * `shell:` (1280px) and 224 from it; the reader may drag its inner edge
 * (`lib/sidebar-width.ts`) or collapse it to the 56px rail, and both choices
 * persist. The panel sits `--panel-inset` from the window's other edges with
 * a `rule` edge (a ring, so its content starts on the inset and the page
 * header lines up with the sidebar's) and radius 8. Below `rail:` there is no column and the panel
 * fills the window: the header's menu button opens the same sidebar,
 * labelled, in a left drawer. `labelled:` styles the sidebar wherever it
 * shows its labels. The page's own anatomy belongs to the templates.
 */
const FRAME =
  'bg-ground text-ink grid h-dvh overflow-hidden grid-cols-[minmax(0,1fr)] rail:grid-cols-[var(--sidebar-width-compact)_minmax(0,1fr)] shell:grid-cols-[var(--sidebar-width)_minmax(0,1fr)] data-[sidebar-state=collapsed]:rail:grid-cols-[var(--sidebar-rail-width)_minmax(0,1fr)] transition-[grid-template-columns] duration-[var(--motion-open)] ease-[var(--ease-resize)] motion-reduce:transition-none has-[[data-dragging]]:transition-none';
const SIDEBAR_COLUMN = 'rail:block z-sticky relative hidden min-h-0 min-w-0';
// The `main` container the `column-split:`/`column-wide:` variants measure.
const PANEL =
  '@container/main bg-panel rail:ms-0 rail:rounded-card rail:ring-1 ring-rule m-[var(--panel-inset)] flex min-h-0 min-w-0 flex-col overflow-y-auto overscroll-contain px-[var(--page-pad-inline)]';
const PAGE = 'flex w-full min-w-0 flex-1 flex-col';

/**
 * The reader's sidebar width as the one width both breakpoints read; at the
 * default the frame sets nothing and the tokens stand. The app renders on the
 * client, so the first frame already has the stored width (no jump).
 */
function useFrameState(): { style: CSSProperties | undefined; state: 'collapsed' | 'expanded' } {
  const width = useSidebarWidth();
  const collapsed = useSidebarCollapsed();
  const style =
    width === null
      ? undefined
      : ({
          '--sidebar-width': `${width}px`,
          '--sidebar-width-compact': `${width}px`,
        } as CSSProperties);
  return { style, state: collapsed ? 'collapsed' : 'expanded' };
}

export function AppShellFrame({
  sidebar,
  children,
}: Readonly<{ sidebar: ReactNode; children: ReactNode }>) {
  const sidebarId = useId();
  const { style, state } = useFrameState();
  // Only a toggle fades the sidebar's content in (ui-motion.css); first paint stays still.
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
      style={style}
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

/**
 * The frame before the session resolves: the sidebar's column holding the
 * placeholder sidebar (the route manifest's rows, inert, with blocks where
 * the reads go), and the `main` landmark exactly where the settled shell puts
 * it, so nothing moves when the shell opens.
 */
export function AppShellPlaceholder({
  busy,
  sidebar,
  children,
}: Readonly<{ busy: boolean; sidebar: ReactNode; children: ReactNode }>) {
  const { style, state } = useFrameState();
  return (
    <div
      data-app-surface=""
      data-sidebar-state={state}
      className={FRAME}
      style={style}
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

/**
 * The header's menu button below `rail:` (900px), where there is no sidebar
 * column: it opens the navigation drawer. Hidden from `rail:` up.
 */
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
      className="rail:hidden shrink-0"
    />
  );
}

/**
 * The navigation drawer below `rail:`: the sidebar, labelled, in the left
 * sheet. The dialog traps focus, Escape closes it and focus returns to the
 * menu button; the shell closes it when the route changes.
 */
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
      <div data-nav-drawer="" className="bg-chrome flex min-h-0 flex-1 flex-col">
        {children}
      </div>
    </Drawer>
  );
}
