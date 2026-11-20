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
import { setSidebarCollapsed, useSidebarCollapsed } from '@/lib/sidebar-width';
import { cn } from '@/lib/utils';

/**
 * The Sidebar organism's parts, labelled and as the collapsed rail, 8 inside
 * the column's edges. Top to bottom: the header (the project switcher and the
 * Settings link in one row as tall as the page header), the mode switch, the
 * mode's list, then the foot (Integrations, the collapse toggle and the
 * account). Only the list scrolls. In the 56px rail every 40px button shares
 * one centre axis, 4 between the parts, the toggle straight above the
 * account, so it keeps its place at the foot whichever way the sidebar shows
 * (AR-8); its twelve buttons fit a window 520 high (16 + 12 × 40 + 16).
 */
export function SidebarFrame({
  ident,
  mode,
  nav,
  foot,
  account,
}: Readonly<{
  ident: ReactNode;
  mode: ReactNode;
  nav: ReactNode;
  foot: ReactNode;
  account: ReactNode;
}>) {
  return (
    <div className="h-full overflow-hidden">
      {/* In the shell's column the content keeps the width the column eases
          to, so a collapse never rewraps a label. */}
      <div
        data-sidebar-frame=""
        className="rail:in-data-[sidebar-state=expanded]:w-[var(--sidebar-width-compact)] shell:in-data-[sidebar-state=expanded]:w-[var(--sidebar-width)] rail:in-data-[sidebar-state=collapsed]:w-[var(--sidebar-rail-width)] labelled:gap-2 flex h-full flex-col gap-1 p-2"
      >
        <div
          data-sidebar-ident-cell=""
          className="labelled:h-[var(--masthead-height)] labelled:flex-row flex shrink-0 flex-col items-center gap-1 in-data-[nav-drawer]:pe-10"
        >
          {ident}
        </div>
        {mode}
        {nav}
        <div className="labelled:gap-0.5 flex shrink-0 flex-col">
          {foot}
          <SidebarCollapseToggle />
          {account}
        </div>
      </div>
    </div>
  );
}

type ScrollEnds = Readonly<{ top: boolean; bottom: boolean }>;

/**
 * Which ends of a list hide more rows, kept current on scroll, on a resize of
 * the list or of any group in it (a fold, rows arriving) and once the fonts load.
 */
function useScrollEnds(ref: RefObject<HTMLElement | null>): ScrollEnds {
  const [ends, setEnds] = useState<ScrollEnds>({ top: false, bottom: false });
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const update = () => {
      // A 1px tolerance: the rounded heights may differ by 1 with nothing hidden.
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
    const content = node.firstElementChild;
    if (content) {
      observer.observe(content);
      for (const group of content.children) observer.observe(group);
    }
    void document.fonts?.ready.then(update);
    return () => {
      node.removeEventListener('scroll', update);
      observer.disconnect();
    };
  }, [ref]);
  return ends;
}

/** The list's fade at either end (globals.css `[data-sidebar-scroll]`). */
const LIST_FADE = 32;

/**
 * Scrolls the list just enough to show its current row clear of the fades
 * (never the page); at either end of the list the fade is gone anyway.
 */
function revealCurrent(list: HTMLElement) {
  const current = list.querySelector<HTMLElement>('[aria-current="page"]');
  if (!current) return;
  const listBox = list.getBoundingClientRect();
  const rowBox = current.getBoundingClientRect();
  // A list too short for both fades centres the row instead.
  const inset = Math.max(0, Math.min(LIST_FADE, (listBox.height - rowBox.height) / 2));
  const above = listBox.top + inset - rowBox.top;
  const below = rowBox.bottom - (listBox.bottom - inset);
  if (above > 0) list.scrollTop -= above;
  else if (below > 0) list.scrollTop += below;
}

/**
 * The labelled list between the pinned parts: the one region that scrolls.
 * It fades at the end it can scroll towards (a mask on the list, globals.css)
 * and shows the current row on load and whenever `revealKey` (the location)
 * changes. Sections sit 16 apart; groups closer (`[data-sidebar-group]`,
 * globals.css).
 */
export function SidebarScrollList({
  label,
  revealKey,
  children,
}: Readonly<{ label: string; revealKey: string; children: ReactNode }>) {
  const ref = useRef<HTMLDivElement>(null);
  const ends = useScrollEnds(ref);
  useEffect(() => {
    const list = ref.current;
    if (!list) return;
    revealCurrent(list);
    // The faces loading can move the row; show it again once they have.
    let live = true;
    void document.fonts?.ready.then(() => {
      if (live) revealCurrent(list);
    });
    return () => {
      live = false;
    };
  }, [revealKey]);
  return (
    <div
      ref={ref}
      data-sidebar-scroll=""
      data-fade-top={ends.top || undefined}
      data-fade-bottom={ends.bottom || undefined}
      className="-mx-2 min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-1"
    >
      <nav aria-label={label} className="flex flex-col gap-4">
        {children}
      </nav>
    </div>
  );
}

/**
 * A group of rows. A titled group's label is a row-high button in 12px
 * `caption-strong` with a chevron that folds and unfolds the rows; the
 * caller passes only the rows to show (a folded group still shows the
 * current page's row).
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
    <div data-sidebar-group="" className="flex flex-col gap-0.5">
      {title ? (
        <button
          type="button"
          data-sidebar-group-toggle=""
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

/** The current row's fill. */
const CURRENT_FILL = 'bg-[var(--nav-current-fill)]';
/** The current row's tile, the accent mark at its start and `ink` at 500. */
const CURRENT_TILE = cn(CURRENT_FILL, 'text-ink before:bg-accent');
const AT_REST = 'text-ink-2 hover:overlay-hover hover:text-ink';
/** A nav row at rest stays `ink`; only group labels and the mode switch are `ink-2` (owner, 2026-11-19). */
const NAV_AT_REST = 'text-ink hover:overlay-hover';

/**
 * A row's face: 28 tall (44 in the drawer below 900px), `label` type at the
 * regular weight (owner, 2026-11-18), the icon and the label 8 apart, radius
 * 6. Labels never wrap: one that cannot fit (WCAG text spacing) ends in an
 * ellipsis and the row's tooltip shows it.
 */
export function sidebarNavRowClasses(active: boolean, className?: string) {
  return cn(
    'focus-ring type-label rounded-control relative flex font-normal h-[var(--nav-row-height)] w-full min-w-0 shrink-0 items-center gap-2 px-2 text-left transition-colors',
    'before:rounded-mark before:absolute before:inset-y-2 before:start-0 before:w-[var(--mark-width)]',
    active ? CURRENT_TILE : NAV_AT_REST,
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

const RAIL_BUTTON = cn(
  'focus-ring rounded-control relative flex size-[var(--rail-button)] shrink-0 items-center justify-center transition-colors [&_svg]:size-4',
  'before:rounded-mark before:absolute before:inset-y-2.5 before:start-0 before:w-[var(--mark-width)]',
  'data-[state=open]:overlay-pressed',
);

/**
 * A collapsed-rail button's face: 40 square, a 20px icon, radius 6. The
 * button of the group that holds the current page carries the tile and the
 * accent mark.
 */
export function sidebarRailButtonClasses(current: boolean) {
  return cn(RAIL_BUTTON, current ? CURRENT_TILE : NAV_AT_REST);
}

/**
 * The Dashboard | Agent switch, the segmented control: a `rule` frame one
 * control tall, segments 2 inside it, the current one on the current row's
 * fill. In the rail it is two stacked rail buttons, the current one on the
 * tile without the mark.
 */
export function sidebarModeTrackClasses(rail: boolean) {
  return rail
    ? 'flex flex-col items-center'
    : 'border-rule rounded-control flex h-[var(--control-md)] w-full min-w-0 shrink-0 border p-px';
}

export function sidebarModeSegmentClasses(current: boolean, rail: boolean) {
  // The rail's one accent mark is the current destination's; the mode takes the tile only.
  if (rail) return cn(RAIL_BUTTON, current ? cn('text-ink', CURRENT_FILL) : AT_REST);
  // Labelled, a segment is its word (no icon), the two sharing the width;
  // wider text spacing ends in an ellipsis.
  return cn(
    'focus-ring type-label rounded-mark relative flex h-full min-w-0 flex-1 basis-0 items-center justify-center px-3 transition-colors',
    current ? cn('text-ink', CURRENT_FILL) : AT_REST,
  );
}

/** A rail flyout's non-item content (the chats' search, a sentence), inset like its rows. */
export function RailFlyoutSlot({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="px-2 py-1">{children}</div>;
}

/**
 * The rail's buttons, top to bottom in one column on the centre axis. In a
 * window too short for all of them (under 520) the column scrolls, its
 * scrollbar hidden, rather than cutting off the last groups.
 */
export function SidebarRailList({
  label,
  children,
}: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <nav
      aria-label={label}
      className="min-h-0 flex-1 [scrollbar-width:none] overflow-y-auto overscroll-contain [&::-webkit-scrollbar]:hidden"
    >
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
        'focus-ring text-ink not-data-[state=open]:hover:overlay-hover data-[state=open]:overlay-pressed disabled:text-ink-2 labelled:w-full labelled:h-[var(--control-lg)] labelled:justify-start labelled:px-2 rounded-control flex h-[var(--rail-button)] w-[var(--rail-button)] min-w-0 items-center justify-center gap-2 text-left transition-colors disabled:pointer-events-none',
        current && CURRENT_FILL,
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

/**
 * Collapse the sidebar to its rail, or open it again: in the sidebar's foot,
 * straight above the account, labelled or as the rail (AR-8). Below 900px and in the drawer, where the menu button opens the sidebar
 * instead, it is hidden.
 */
function SidebarCollapseToggle() {
  const collapsed = useSidebarCollapsed();
  return (
    <IconButton
      icon={collapsed ? PanelLeftOpen : PanelLeftClose}
      label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      shortcut={COLLAPSE_SHORTCUT}
      tooltipSide={collapsed ? 'right' : 'top'}
      aria-keyshortcuts="Meta+Backslash Control+Backslash"
      onClick={() => setSidebarCollapsed(!collapsed)}
      className="rail:inline-flex not-labelled:size-[var(--rail-button)] labelled:self-start hidden shrink-0 self-center in-data-[nav-drawer]:hidden"
    />
  );
}

const COLLAPSE_SHORTCUT = 'Ctrl \\';

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
 * rail, where the row shows no text at all; `inRail="only"` opens it there
 * alone. The row's accessible name already holds the text, so it is not
 * repeated as a description.
 */
export function SidebarTextTooltip({
  inRail = false,
  children,
}: Readonly<{ inRail?: boolean | 'only'; children: ReactNode }>) {
  const [lines, setLines] = useState<readonly SidebarTextLine[]>([]);
  const openWhenCut = (trigger: HTMLElement) => {
    const parts = [...trigger.querySelectorAll<HTMLElement>('[data-sidebar-text]')];
    const rail = inRail !== false && isRail(trigger);
    if (!rail && (inRail === 'only' || !parts.some(isTextCut))) return false;
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
