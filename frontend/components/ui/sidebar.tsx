import { useState, type ComponentPropsWithoutRef, type ReactNode, type Ref } from 'react';
import { ChevronsUpDown, PanelLeftClose, PanelLeftOpen, type LucideIcon } from 'lucide-react';

import { IconButton } from '@/components/ui/button';
import { isTextCut, Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/**
 * The Sidebar organism's parts: the project
 * switcher in a cell as tall as the masthead and ruled under it, then one
 * scrolling list of destination groups hung on a 1px rail, then the foot
 * (Integrations, the account button and the collapse toggle). The sidebar is
 * the ladder: the current destination carries the 2px accent rung on the
 * rail. In the collapsed rail (48px) rows show only their icons and name
 * themselves in tooltips; `labelled:` is wherever the labels show.
 */
export function SidebarFrame({
  ident,
  nav,
  foot,
}: Readonly<{ ident: ReactNode; nav: ReactNode; foot: ReactNode }>) {
  return (
    <div className="flex h-full flex-col">
      <div
        data-sidebar-ident-cell=""
        className="border-rule labelled:ps-2 labelled:pe-2 in-data-[nav-drawer]:labelled:pe-12 flex min-h-[var(--masthead-height)] shrink-0 items-center border-b px-1"
      >
        {ident}
      </div>
      {/* The 4px inset keeps the first and last rows' focus outlines inside the scroller. */}
      <div className="labelled:px-2 flex min-h-0 flex-1 flex-col overflow-y-auto px-1 py-[var(--page-top-gap)]">
        {nav}
      </div>
      <div className="border-rule labelled:px-2 flex flex-col gap-1 border-t px-1 py-2">{foot}</div>
    </div>
  );
}

/**
 * The destinations: groups 24 apart on one 1px `rule` rail. Rows sit on the
 * rail, so the current row's rung lands on it.
 */
export function SidebarNavList({
  label,
  children,
}: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <nav
      aria-label={label}
      className="labelled:border-s labelled:border-rule labelled:ms-2 flex flex-col gap-[var(--page-top-gap)]"
    >
      {children}
    </nav>
  );
}

/** A group of destinations under its `overline` head; the head hides in the rail. */
export function SidebarNavGroup({
  title,
  children,
}: Readonly<{ title?: string | null; children: ReactNode }>) {
  return (
    <div className="flex flex-col gap-1">
      {title ? (
        <p className="type-overline text-ink-2 labelled:flex hidden min-h-4 items-end px-3">
          {title}
        </p>
      ) : null}
      <ul className="flex flex-col">{children}</ul>
    </div>
  );
}

/**
 * A destination row's face: 28 tall, `label` type in `ink-2`, the icon and
 * the label 4 apart. Hover is the hover overlay; the current row is `ink` and
 * carries the 2px accent rung over the rail, painted over the row so
 * selecting a row moves nothing. Every label fits on one line at the default
 * width; one that cannot (a narrowed sidebar, larger text
 * spacing, WCAG 1.4.12) wraps and the row grows, so no label is cut.
 */
export function sidebarNavRowClasses(active: boolean) {
  return cn(
    'focus-ring group type-label labelled:justify-start labelled:px-3 relative flex min-h-[var(--control-sm)] shrink-0 items-center justify-center gap-1 rounded-control transition-colors',
    'before:absolute before:inset-y-1 before:-start-px before:w-[var(--mark-width)] before:rounded-mark',
    active ? 'text-ink before:bg-accent' : 'text-ink-2 hover:overlay-hover hover:text-ink',
  );
}

/**
 * A row's content: the 16px icon, the label and, on a row that counts
 * something (Actions), a count slot of a fixed 4ch, so a count arriving never
 * moves the label. Rows without a count give its width to the label. In the
 * rail the label and count stay for assistive technology only.
 */
export function SidebarNavRowContent({
  icon: Icon,
  label,
  count,
}: Readonly<{ icon: LucideIcon; label: string; count?: ReactNode }>) {
  return (
    <>
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="labelled:not-sr-only labelled:min-w-0 labelled:flex-1 sr-only break-words">
        {label}
      </span>
      {count == null ? null : (
        <span className="type-data-sm labelled:not-sr-only labelled:w-[4ch] labelled:shrink-0 labelled:text-right sr-only">
          {count}
        </span>
      )}
    </>
  );
}

/**
 * The project switcher's and the account's trigger: `control-lg` (44) tall
 * with two lines (the name in `ink`, the domain or workspace in `ink-2`),
 * quiet until hovered or open. In the rail it holds only its mark.
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
        'focus-ring text-ink not-data-[state=open]:hover:overlay-hover data-[state=open]:overlay-pressed disabled:text-ink-2 labelled:justify-start labelled:px-2 rounded-control flex min-h-[var(--control-lg)] w-full min-w-0 items-center justify-center gap-2 text-left transition-colors disabled:pointer-events-none',
        className,
      )}
      {...props}
    >
      {lead}
      <span className="labelled:flex hidden min-w-0 flex-1 flex-col">
        <span data-sidebar-text="title" className="type-label text-ink truncate">
          {title}
        </span>
        {meta ? (
          <span data-sidebar-text="meta" className="type-caption text-ink-2 truncate">
            {meta}
          </span>
        ) : null}
      </span>
      <ChevronsUpDown className="text-ink-2 labelled:block hidden size-4 shrink-0" aria-hidden />
    </button>
  );
}

/** Collapse the sidebar to its rail, or open it again (hidden in the drawer). */
export function SidebarCollapseToggle({
  collapsed,
  onToggle,
  shortcut,
}: Readonly<{ collapsed: boolean; onToggle: () => void; shortcut: string }>) {
  return (
    <IconButton
      icon={collapsed ? PanelLeftOpen : PanelLeftClose}
      label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      shortcut={shortcut}
      tooltipSide="right"
      aria-keyshortcuts="Meta+Backslash Control+Backslash"
      aria-pressed={collapsed}
      onClick={onToggle}
      className="shrink-0 in-data-[nav-drawer]:hidden"
    />
  );
}

/** True while the row sits in the collapsed rail, where only its tooltip names it. */
function isRail(trigger: HTMLElement) {
  if (trigger.closest('[data-nav-drawer]')) return false;
  return Boolean(trigger.closest('[data-sidebar-state="collapsed"]'));
}

/** Names a row in the rail; where its own label shows, it never opens. */
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

/** A row's line (`data-sidebar-text="title"` or `"meta"`) and its full text. */
type SidebarTextLine = { line: string; text: string };

/**
 * The full text of a sidebar row whose lines the sidebar cut (a project's
 * domain, an email), on hover and keyboard focus: the row's
 * `data-sidebar-text` lines are measured only as the tooltip is about to
 * open, and it opens only when one is cut. `inRail` also opens it in the
 * rail, where the row shows no text at all. The row's accessible name already
 * holds the text, so it is not repeated as a description.
 */
export function SidebarTextTooltip({
  inRail = false,
  children,
}: Readonly<{ inRail?: boolean; children: ReactNode }>) {
  const [lines, setLines] = useState<readonly SidebarTextLine[]>([]);
  const openWhenCut = (trigger: HTMLElement) => {
    const parts = [...trigger.querySelectorAll<HTMLElement>('[data-sidebar-text]')];
    if (!(inRail && isRail(trigger)) && !parts.some(isTextCut)) return false;
    const next = parts
      .map((part) => ({
        line: part.dataset.sidebarText ?? '',
        text: part.textContent?.trim() ?? '',
      }))
      .filter(({ text }) => text !== '');
    if (next.length === 0) return false;
    setLines(next);
    return true;
  };
  return (
    <Tooltip
      content={
        <span className="flex min-w-0 flex-col">
          {lines.map(({ line, text }) => (
            <span key={line} className="break-words">
              {text}
            </span>
          ))}
        </span>
      }
      side="right"
      describe={false}
      shouldOpen={openWhenCut}
    >
      {children}
    </Tooltip>
  );
}
