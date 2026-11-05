import type { ComponentPropsWithoutRef, ReactNode, Ref } from 'react';
import { ChevronsUpDown, type LucideIcon } from 'lucide-react';

import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/**
 * The signed-in frame (the system's AppShell and AppSidebar parts).
 *
 * One breakpoint, the `shell:` variant (1280px). From it the sidebar is the
 * full `sidebar-width` column with labels; below it the sidebar is a rail one
 * control wide (decision D3) whose rows show only their icons and name
 * themselves in right-side tooltips, and the main gutter (`--content-gutter`)
 * narrows from 32 to 24. The page bands (header, controls, content) are the
 * page template's (`components/layout/page-shell.tsx`).
 *
 * The layout shell composes these with the real navigation and data; these
 * pieces own every number.
 */
const FRAME =
  'bg-paper text-ink shell:grid-cols-[var(--sidebar-width)_minmax(0,1fr)] grid min-h-dvh grid-cols-[var(--sidebar-rail-width)_minmax(0,1fr)]';
const SIDEBAR_COLUMN = 'border-line sticky top-0 h-dvh min-w-0 border-r';
const PAGE = 'mx-auto flex w-full max-w-[var(--content-max-width)] min-w-0 flex-col';

export function AppShellFrame({
  sidebar,
  children,
}: Readonly<{ sidebar: ReactNode; children: ReactNode }>) {
  return (
    <div data-app-surface="" className={FRAME}>
      <a href="#main" className="skip-link">
        Skip to main content
      </a>
      <aside className={SIDEBAR_COLUMN}>{sidebar}</aside>
      <main id="main" tabIndex={-1} className="min-w-0 p-[var(--content-gutter)]">
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
  return (
    <div className={FRAME} aria-busy={busy || undefined}>
      <div className={SIDEBAR_COLUMN} />
      <div className="min-w-0 p-[var(--content-gutter)]">
        <div className={PAGE}>{children}</div>
      </div>
    </div>
  );
}

/**
 * The sidebar's column: the top block (logo, project, mode), the scrolling
 * destinations and the account at the foot. In the rail the destinations do
 * not scroll, so their tooltips are never clipped.
 */
export function SidebarFrame({
  top,
  nav,
  foot,
}: Readonly<{ top: ReactNode; nav: ReactNode; foot: ReactNode }>) {
  return (
    <div className="flex h-full flex-col gap-4 p-3">
      <div className="flex flex-col gap-3">{top}</div>
      <div className="shell:overflow-y-auto -mx-3 flex min-h-0 flex-1 flex-col gap-4 px-3 py-1">
        {nav}
      </div>
      <div className="flex">{foot}</div>
    </div>
  );
}

/** The logo row: the full logo in the column, the mark alone in the rail. */
export const SIDEBAR_LOGO_CLASSES =
  'focus-ring shell:justify-start shell:px-3 text-ink flex h-[var(--control-md)] items-center justify-center rounded-md';

/**
 * The project switcher's and the account's trigger: 48px with two lines (the
 * name in `ink`, the domain or workspace in `ink-muted`), ghost until hovered
 * or open. In the rail it is one control square holding only its mark.
 */
export function SidebarIdentButton({
  lead,
  title,
  meta,
  ref,
  className,
  ...props
}: Readonly<
  Omit<ComponentPropsWithoutRef<'button'>, 'title'> & {
    lead: ReactNode;
    title: string;
    meta?: string;
    ref?: Ref<HTMLButtonElement>;
  }
>) {
  return (
    <button
      ref={ref}
      type="button"
      data-sidebar-ident=""
      className={cn(
        'focus-ring text-ink hover:bg-surface-sunken data-[state=open]:bg-surface-sunken disabled:text-ink-muted shell:h-[var(--control-lg)] shell:justify-start shell:px-3 flex h-[var(--control-md)] w-full min-w-0 items-center justify-center gap-3 rounded-md text-left transition-colors disabled:pointer-events-none',
        className,
      )}
      {...props}
    >
      {lead}
      <span className="shell:flex hidden min-w-0 flex-1 flex-col">
        <span className="type-control text-ink truncate">{title}</span>
        {meta ? <span className="type-caption truncate">{meta}</span> : null}
      </span>
      <ChevronsUpDown className="text-ink-muted shell:block hidden size-4 shrink-0" aria-hidden />
    </button>
  );
}

/** A titled group of destinations; the title hides in the rail. */
export function SidebarNavGroup({
  title,
  children,
}: Readonly<{ title?: string | null; children: ReactNode }>) {
  return (
    <div className="flex flex-col gap-0.5">
      {title ? (
        <p className="type-caption shell:flex hidden h-7 items-center px-3 font-medium">{title}</p>
      ) : null}
      <ul className="flex flex-col gap-0.5">{children}</ul>
    </div>
  );
}

/**
 * A destination row's face, for the link that carries it: 36px, the label
 * in `ink-secondary`; the current row takes the selected-tab face (`surface`,
 * `shadow-xs`, `ink`) and its icon turns Flare, the app's one selected-nav
 * marker. In the rail the row is one control square.
 */
export function sidebarNavRowClasses(active: boolean, plain = false) {
  return cn(
    'focus-ring group type-control shell:justify-start shell:px-3 flex h-[var(--control-md)] shrink-0 items-center justify-center gap-2 rounded-md transition-colors',
    active
      ? 'bg-surface text-ink shadow-xs'
      : 'text-ink-secondary hover:bg-surface-sunken hover:text-ink',
    plain && 'shell:flex hidden font-normal',
  );
}

/**
 * A destination row's content: the 16px icon, the label and a count slot of
 * a fixed 4ch, so a count arriving never moves the label. In the rail the
 * label and count stay for assistive technology only.
 */
export function SidebarNavRowContent({
  icon: Icon,
  label,
  active,
  count,
}: Readonly<{ icon?: LucideIcon; label: string; active: boolean; count?: ReactNode }>) {
  return (
    <>
      {Icon ? (
        <Icon
          className={cn(
            'size-4 shrink-0 transition-colors',
            active ? 'text-accent' : 'text-ink-muted group-hover:text-ink',
          )}
          aria-hidden
        />
      ) : null}
      <span className="shell:not-sr-only shell:min-w-0 shell:flex-1 shell:truncate sr-only">
        {label}
      </span>
      {Icon ? (
        <span className="type-caption shell:not-sr-only shell:w-[4ch] shell:shrink-0 shell:text-right sr-only font-mono tabular-nums">
          {count}
        </span>
      ) : null}
    </>
  );
}

const SHELL_QUERY = '(min-width: 1280px)';

/** True while the sidebar is a rail, where a row's tooltip names it. */
function isRail() {
  return typeof window === 'undefined' || !window.matchMedia?.(SHELL_QUERY).matches;
}

/** Names a row in the rail; above it the row's own label does, so it never opens. */
export function SidebarRowTooltip({
  label,
  children,
}: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <Tooltip content={label} side="right" describe={false} shouldOpen={isRail}>
      {children}
    </Tooltip>
  );
}
