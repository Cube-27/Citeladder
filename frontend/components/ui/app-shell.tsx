import { useId, type CSSProperties, type ReactNode } from 'react';
import { Menu } from 'lucide-react';

import { IconButton } from '@/components/ui/button';
import { Drawer } from '@/components/ui/drawer';
import { SidebarResizeHandle } from '@/components/ui/sidebar-resize-handle';
import { useSidebarCollapsed, useSidebarWidth } from '@/lib/sidebar-width';

/**
 * The signed-in frame (brand direction 2.3): the sidebar column beside the
 * main column, both on the ground.
 *
 * From `rail:` (900px) the sidebar is a labelled column, 200 wide below
 * `shell:` (1280px) and 224 from it; the reader may drag its inner edge
 * (`lib/sidebar-width.ts`) or collapse it to the 48px rail, and both choices
 * persist. Below `rail:` there is no column: the masthead's menu button opens
 * the same sidebar, labelled, in a left drawer. `labelled:` styles the
 * sidebar wherever it shows its labels. The page's own anatomy (masthead,
 * page tabs, filter bar, sections) belongs to the templates.
 */
const FRAME =
  'bg-ground text-ink grid min-h-dvh grid-cols-[minmax(0,1fr)] rail:grid-cols-[var(--sidebar-width-compact)_minmax(0,1fr)] shell:grid-cols-[var(--sidebar-width)_minmax(0,1fr)] data-[sidebar-state=collapsed]:rail:grid-cols-[var(--sidebar-rail-width)_minmax(0,1fr)]';
// One hairline divides the sidebar from the page in both themes; the resize
// handle's line strengthens it on hover, focus and drag.
const SIDEBAR_COLUMN =
  'bg-ground border-rule rail:block z-sticky sticky top-0 hidden h-dvh min-w-0 border-r';
// The `main` container the `column-split:`/`column-wide:` variants measure.
const MAIN_INSET =
  '@container/main min-w-0 px-[var(--content-gutter)] pb-[var(--page-section-gap)]';
const PAGE = 'flex w-full max-w-[var(--content-max-width)] min-w-0 flex-col';

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
  return (
    <div data-app-surface="" data-sidebar-state={state} className={FRAME} style={style}>
      <a href="#main" className="skip-link">
        Skip to main content
      </a>
      <aside id={sidebarId} aria-label="Sidebar" className={SIDEBAR_COLUMN}>
        {sidebar}
        {state === 'expanded' ? <SidebarResizeHandle sidebarId={sidebarId} /> : null}
      </aside>
      <main id="main" tabIndex={-1} data-main-column="" className={MAIN_INSET}>
        <div className={PAGE}>{children}</div>
      </main>
    </div>
  );
}

/**
 * The frame before the session resolves: the sidebar's column, empty (its
 * contents would be private), and the page inset exactly where the settled
 * shell puts it, so only the sidebar fills in when the shell opens.
 */
export function AppShellPlaceholder({
  busy,
  children,
}: Readonly<{ busy: boolean; children: ReactNode }>) {
  const { style, state } = useFrameState();
  return (
    <div data-sidebar-state={state} className={FRAME} style={style} aria-busy={busy || undefined}>
      <div className={SIDEBAR_COLUMN} />
      <div data-main-column="" className={MAIN_INSET}>
        <div className={PAGE}>{children}</div>
      </div>
    </div>
  );
}

/**
 * The masthead's menu button below `rail:` (900px), where there is no sidebar
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
      <div data-nav-drawer="" className="bg-ground flex min-h-0 flex-1 flex-col">
        {children}
      </div>
    </Drawer>
  );
}
