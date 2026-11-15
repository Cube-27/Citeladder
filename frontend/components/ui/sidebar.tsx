import {
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
  type Ref,
  type RefObject,
} from 'react';
import {
  ChevronDown,
  ChevronsUpDown,
  PanelLeftClose,
  PanelLeftOpen,
  type LucideIcon,
} from 'lucide-react';

import { IconButton } from '@/components/ui/button';
import { isTextCut, Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/**
 * The Sidebar organism's parts, labelled and as the collapsed rail. Top to
 * bottom: the project switcher in a cell as tall as the masthead, the mode
 * switch, the mode's list, then the foot (Integrations, the account and the
 * collapse toggle). The switcher, the switch and the foot are pinned; only
 * the list scrolls. Everything sits 8 inside the column's edges, so in the
 * 56px rail every 40px button shares one centre axis. The rail's buttons sit
 * edge to edge with 4 between its parts, so its eleven buttons fit a window
 * 480 high (56 + 10 × 40 + 21 = 477). `labelled:` is wherever the labels show.
 */
export function SidebarFrame({
  ident,
  mode,
  nav,
  foot,
}: Readonly<{ ident: ReactNode; mode: ReactNode; nav: ReactNode; foot: ReactNode }>) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div
        data-sidebar-ident-cell=""
        className="border-rule flex h-[var(--masthead-height)] shrink-0 items-center border-b px-2 in-data-[nav-drawer]:pe-12"
      >
        {ident}
      </div>
      <div className="labelled:pt-3 shrink-0 px-2 pt-1">{mode}</div>
      {nav}
      <div className="border-rule labelled:gap-0.5 labelled:py-2 flex shrink-0 flex-col border-t px-2 py-1">
        {foot}
      </div>
    </div>
  );
}

type ScrollEnds = Readonly<{ top: boolean; bottom: boolean }>;

/** Which ends of a list hide more rows, kept current on scroll and resize. */
function useScrollEnds(ref: RefObject<HTMLElement | null>): ScrollEnds {
  const [ends, setEnds] = useState<ScrollEnds>({ top: false, bottom: false });
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const update = () => {
      const hidden = node.scrollHeight - node.clientHeight;
      const top = hidden > 1 && node.scrollTop > 1;
      const bottom = hidden > 1 && node.scrollTop < hidden - 1;
      setEnds((current) =>
        current.top === top && current.bottom === bottom ? current : { top, bottom },
      );
    };
    update();
    node.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(node);
    if (node.firstElementChild) observer.observe(node.firstElementChild);
    return () => {
      node.removeEventListener('scroll', update);
      observer.disconnect();
    };
  }, [ref]);
  return ends;
}

/** Scrolls the list just enough to show its current row (never the page). */
function revealCurrent(list: HTMLElement) {
  const current = list.querySelector<HTMLElement>('[aria-current="page"]');
  if (!current) return;
  const listBox = list.getBoundingClientRect();
  const rowBox = current.getBoundingClientRect();
  if (rowBox.top < listBox.top) list.scrollTop -= listBox.top - rowBox.top + 8;
  else if (rowBox.bottom > listBox.bottom) list.scrollTop += rowBox.bottom - listBox.bottom + 8;
}

/**
 * The labelled list between the pinned parts: the one region that scrolls.
 * It fades at the end it can scroll towards (a mask on the list, globals.css)
 * and shows the current row on load and whenever `revealKey` (the location)
 * changes. Groups sit 16 apart.
 */
export function SidebarScrollList({
  label,
  revealKey,
  children,
}: Readonly<{ label: string; revealKey: string; children: ReactNode }>) {
  const ref = useRef<HTMLDivElement>(null);
  const ends = useScrollEnds(ref);
  useEffect(() => {
    if (ref.current) revealCurrent(ref.current);
  }, [revealKey]);
  return (
    <div
      ref={ref}
      data-sidebar-scroll=""
      data-fade-top={ends.top || undefined}
      data-fade-bottom={ends.bottom || undefined}
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-3"
    >
      <nav aria-label={label} className="flex flex-col gap-4">
        {children}
      </nav>
    </div>
  );
}

/**
 * A group of rows. A titled group's label is a 32-high button in
 * `caption-strong` with a chevron that folds and unfolds the rows; the
 * caller passes only the rows to show (a folded group still shows the
 * current page's row). Rows sit on a 34 pitch.
 */
export function SidebarNavGroup({
  title,
  expanded = true,
  onToggle,
  children,
}: Readonly<{
  title?: string | null;
  expanded?: boolean;
  onToggle?: () => void;
  children: ReactNode;
}>) {
  const listId = useId();
  return (
    <div className="flex flex-col gap-0.5">
      {title ? (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={onToggle}
          className="focus-ring type-caption-strong text-ink-2 hover:overlay-hover hover:text-ink rounded-control flex h-[var(--nav-row-height)] w-full min-w-0 items-center gap-2 px-2 text-left transition-colors"
        >
          <span className="min-w-0 flex-1 truncate">{title}</span>
          <ChevronDown
            aria-hidden
            className={cn(
              'size-4 shrink-0 transition-transform motion-reduce:transition-none',
              !expanded && '-rotate-90',
            )}
          />
        </button>
      ) : null}
      <ul id={listId} aria-label={title ?? undefined} className="flex flex-col gap-0.5">
        {children}
      </ul>
    </div>
  );
}

/** The current row's tile, the accent mark at its start and `ink` at 500. */
const CURRENT_TILE = 'bg-[var(--nav-current-fill)] text-ink before:bg-accent';
const AT_REST = 'text-ink-2 hover:overlay-hover hover:text-ink';

/**
 * A row's face: 32 tall (44 in the drawer below 900px), `label` type, the
 * icon and the label 8 apart, radius 6. Labels never wrap: one that cannot
 * fit (WCAG text spacing) ends in an ellipsis and the row's tooltip shows it.
 */
export function sidebarNavRowClasses(active: boolean, className?: string) {
  return cn(
    'focus-ring type-label rounded-control relative flex h-[var(--nav-row-height)] w-full min-w-0 shrink-0 items-center gap-2 px-2 text-left transition-colors',
    'before:rounded-mark before:absolute before:inset-y-2 before:start-0 before:w-[var(--mark-width)]',
    active ? CURRENT_TILE : AT_REST,
    className,
  );
}

const ROW_ICON = 'size-4 shrink-0 in-data-[nav-drawer]:size-5';

/**
 * A row's content: the icon, the label and, on a row that counts something
 * (Actions), a count slot of a fixed 4ch, so a count arriving never moves the
 * label.
 */
export function SidebarNavRowContent({
  icon: Icon,
  label,
  count,
}: Readonly<{ icon: LucideIcon; label: string; count?: ReactNode }>) {
  return (
    <>
      <Icon className={ROW_ICON} aria-hidden />
      <span data-sidebar-text="title" className="min-w-0 flex-1 truncate">
        {label}
      </span>
      {count == null ? null : (
        <span className="w-[4ch] shrink-0 text-right tabular-nums">{count}</span>
      )}
    </>
  );
}

/**
 * A collapsed-rail button's face: 40 square, a 20px icon, radius 6. The
 * button of the group that holds the current page carries the tile and the
 * accent mark.
 */
export function sidebarRailButtonClasses(current: boolean) {
  return cn(
    'focus-ring rounded-control relative flex size-[var(--rail-button)] shrink-0 items-center justify-center transition-colors [&_svg]:size-5',
    'before:rounded-mark before:absolute before:inset-y-2.5 before:start-0 before:w-[var(--mark-width)]',
    'data-[state=open]:overlay-pressed',
    current ? CURRENT_TILE : AT_REST,
  );
}

/**
 * The Dashboard | Agent switch, the Segmented look: a `well` track 32 tall
 * (44 in the drawer) with the current segment raised on `surface`. In the
 * rail it is two stacked rail buttons.
 */
export const SIDEBAR_MODE_TRACK =
  'labelled:grid labelled:h-[var(--nav-row-height)] labelled:grid-cols-2 labelled:bg-well labelled:p-0.5 labelled:rounded-control flex flex-col items-center';

export function sidebarModeSegmentClasses(current: boolean) {
  return cn(
    sidebarRailButtonClasses(current),
    'type-label labelled:size-auto labelled:h-full labelled:w-full labelled:gap-2 labelled:rounded-sm labelled:before:hidden labelled:[&_svg]:size-4',
    current && 'labelled:bg-surface labelled:shadow-card',
  );
}

/** The rail's buttons, top to bottom in one column on the centre axis. */
export function SidebarRailList({
  label,
  children,
}: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <nav aria-label={label} className="min-h-0 flex-1 overflow-hidden px-2 py-1">
      <ul className="flex flex-col items-center">{children}</ul>
    </nav>
  );
}

/**
 * The project switcher's and the account's trigger: two lines (the name in
 * `ink`, the domain or workspace in `ink-2`), quiet until hovered or open.
 * In the rail it is a 40px button holding only its mark. `pending` holds the
 * lines' place with blocks until the read answers.
 */
export function SidebarIdentButton({
  lead,
  title,
  meta,
  current = false,
  pending = false,
  ref,
  className,
  ...props
}: Readonly<
  Omit<ComponentPropsWithoutRef<'button'>, 'title'> & {
    lead: ReactNode;
    title: string;
    meta?: string;
    /** The current page lives behind this button (the account's Settings): it carries the mark. */
    current?: boolean;
    pending?: boolean;
    ref?: Ref<HTMLButtonElement>;
  }
>) {
  return (
    <button
      ref={ref}
      type="button"
      data-sidebar-ident=""
      aria-current={current ? 'page' : undefined}
      className={cn(
        'focus-ring text-ink not-data-[state=open]:hover:overlay-hover data-[state=open]:overlay-pressed disabled:text-ink-2 labelled:w-full labelled:justify-start labelled:px-2 rounded-control flex h-[var(--rail-button)] w-[var(--rail-button)] min-w-0 items-center justify-center gap-2 text-left transition-colors disabled:pointer-events-none',
        current && 'bg-[var(--nav-current-fill)]',
        className,
      )}
      {...props}
    >
      {lead}
      <span className="labelled:flex hidden min-w-0 flex-1 flex-col">
        {pending ? (
          <>
            <span aria-hidden className="bg-well rounded-control my-0.5 block h-4 w-24" />
            <span aria-hidden className="bg-well rounded-control block h-3 w-16" />
          </>
        ) : (
          <>
            <span data-sidebar-text="title" className="type-label text-ink truncate">
              {title}
            </span>
            {meta ? (
              <span data-sidebar-text="meta" className="type-caption text-ink-2 truncate">
                {meta}
              </span>
            ) : null}
          </>
        )}
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
      className={cn(
        'in-data-[nav-drawer]:hidden shrink-0',
        collapsed && 'size-[var(--rail-button)] [&_svg]:size-5',
      )}
    />
  );
}

/** True while the trigger sits in the collapsed rail, where only its tooltip names it. */
function isRail(trigger: HTMLElement) {
  if (trigger.closest('[data-nav-drawer]')) return false;
  return Boolean(trigger.closest('[data-sidebar-state="collapsed"]'));
}

/** Names a rail button, or a row whose label is cut; where its whole label shows, it never opens. */
export function SidebarRowTooltip({
  label,
  children,
}: Readonly<{ label: string; children: ReactNode }>) {
  const shouldOpen = (trigger: HTMLElement) => {
    if (isRail(trigger)) return true;
    const text = trigger.querySelector<HTMLElement>('[data-sidebar-text]');
    return text !== null && isTextCut(text);
  };
  return (
    <Tooltip content={label} side="right" describe={false} shouldOpen={shouldOpen}>
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
