import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  type ButtonHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';

import { ScrollFrame, type ScrollRegionProps } from '@/components/ui/scroll-edges';
import { formatCount } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * Tabs and Segmented: text on a hairline. The strip is
 * one row with a 1px `rule` drawn inside its foot (`rule-below`, so the row
 * keeps its height) that scrolls sideways inside itself (its scrollbar
 * hidden) when its items overflow; each item is `body` in `ink-2`, and the
 * current one is `ink` at `label` weight with the 2px accent underline
 * ("you are here") on the hairline, sliding from item to item. One face for page tabs, in-section tabs
 * and the Segmented view switch.
 */
const TAB_STRIP =
  'rule-below relative inline-flex max-w-full shrink-0 items-stretch overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden';

/** Past the edge fade, so the cue never covers the item it reveals. */
const REVEAL_PADDING = 32;

/** The strip's own current choice, never a control inside a hint beside it. */
const SELECTED_ITEM = '.tab-face:is([aria-selected="true"], [aria-checked="true"])';

/**
 * Keeps the strip's current item in view, on mount and on every selection:
 * it scrolls only the strip sideways, never the page.
 */
function useRevealSelected(selected: string | null) {
  const strip = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const list = strip.current;
    const item = list?.querySelector<HTMLElement>(SELECTED_ITEM);
    if (!list || !item) return;
    const start = item.offsetLeft - REVEAL_PADDING;
    const end = item.offsetLeft + item.offsetWidth + REVEAL_PADDING - list.clientWidth;
    if (list.scrollLeft > start) list.scrollLeft = Math.max(0, start);
    else if (list.scrollLeft < end) list.scrollLeft = end;
  }, [selected]);
  return strip;
}

/**
 * Places the strip's one accent underline (`TabMark`) under its current
 * item, and again whenever any item resizes (a count before it grows) or
 * the items or selection change; globals.css slides it there. Without a
 * current item each item draws its own.
 */
function useTabMark(strip: RefObject<HTMLDivElement | null>, selected: string | null) {
  useLayoutEffect(() => {
    const list = strip.current;
    return list ? followTabMark(list) : undefined;
  }, [strip, selected]);
}

function placeTabMark(list: HTMLElement) {
  const item = list.querySelector<HTMLElement>(SELECTED_ITEM);
  if (!item) {
    delete list.dataset.tabMarkReady;
    return;
  }
  list.style.setProperty('--tab-mark-x', `${item.offsetLeft}px`);
  list.style.setProperty('--tab-mark-w', `${item.offsetWidth}px`);
  list.dataset.tabMarkReady = '';
}

/** Places the mark now and on every later resize or item change; returns the cleanup. */
function followTabMark(list: HTMLElement): (() => void) | undefined {
  placeTabMark(list);
  if (typeof ResizeObserver === 'undefined') return undefined;
  const resize = new ResizeObserver(() => placeTabMark(list));
  const watch = () => {
    resize.disconnect();
    resize.observe(list);
    for (const item of list.querySelectorAll('.tab-face')) resize.observe(item);
  };
  watch();
  const mutation = new MutationObserver(() => {
    watch();
    placeTabMark(list);
  });
  mutation.observe(list, {
    subtree: true,
    childList: true,
    attributeFilter: ['aria-selected', 'aria-checked'],
  });
  return () => {
    resize.disconnect();
    mutation.disconnect();
  };
}

/** The strip's sliding underline; a direct child of the strip. */
function TabMark() {
  return (
    <span
      aria-hidden
      data-tab-mark=""
      className="bg-accent pointer-events-none absolute bottom-0 left-0 hidden"
    />
  );
}

/**
 * The strip's `ScrollFrame`: the edge that hides more items fades, and one
 * stepper at the row's end, outside the tabs, moves it along, so a strip cut
 * at a narrow width says more exists and no label sits under a button. The
 * items take focus themselves, so the frame is no tab stop.
 */
function StripFrame({
  children,
}: Readonly<{
  children: (ref: RefObject<HTMLDivElement | null>, region: ScrollRegionProps) => ReactNode;
}>) {
  return (
    <ScrollFrame stepper="row-end" className="inline-flex max-w-full shrink-0">
      {children}
    </ScrollFrame>
  );
}

/**
 * One item: the label, and the current item's accent rung on the hairline.
 * A page tab fills the page's tab strip (as high as the filter strip, its
 * label centred), a section tab is one control high (32, 44 below 900px or
 * under a coarse pointer); both take 12 each side and hover on a 6% tile one
 * control high less 4 top and bottom. A segment is one control high with no
 * padding.
 */
type TabKind = 'page' | 'section' | 'segment';

const TAB_KIND: Record<TabKind, string> = {
  page: 'min-h-[var(--page-tabs-height,var(--control-md))] before:inset-y-[calc((var(--page-tabs-height,var(--control-md))_-_var(--control-md))/2_+_4px)]',
  section: 'min-h-[var(--control-md)] before:inset-y-1',
  segment: 'min-h-[var(--control-md)]',
};

function tabFace({
  kind,
  selected,
  className,
}: Readonly<{ kind: TabKind; selected: boolean; className?: string }>) {
  const tab = kind !== 'segment';
  return cn(
    'tab-face focus-ring-inset type-body relative inline-flex shrink-0 items-center justify-center gap-1 whitespace-nowrap transition-[color] duration-[var(--motion-tint)] disabled:cursor-not-allowed disabled:opacity-60',
    TAB_KIND[kind],
    tab &&
      'isolate px-3 before:absolute before:inset-x-0 before:-z-10 before:rounded-mark before:content-[""]',
    tab && !selected && 'not-disabled:hover:before:bg-state-hover',
    'after:absolute after:inset-x-0 after:bottom-0 after:h-[var(--mark-width)] after:content-[""]',
    selected
      ? 'text-ink after:bg-accent font-medium'
      : 'text-ink-2 not-disabled:hover:text-ink after:bg-transparent',
    className,
  );
}

/**
 * The website's segmented track and segment, kept for its product screens
 * (components/marketing/screens). The app's tabs and switches use `tabFace`
 * above.
 */
export const TAB_TRACK =
  'inline-flex min-h-[var(--control-md)] max-w-full shrink-0 items-center gap-0.5 overflow-x-auto rounded-control p-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden';

/** A segment of the website's track (see `TAB_TRACK`). */
export function tabClasses(selected: boolean, className?: string) {
  return cn(
    'focus-ring inline-flex shrink-0 items-center self-stretch justify-center gap-1.5 rounded-sm border px-3 text-label whitespace-nowrap transition-[background-color,color] duration-[var(--motion-fast)] focus-visible:outline-offset-1 disabled:cursor-not-allowed disabled:opacity-45',
    selected
      ? 'bg-surface border-rule text-ink font-medium'
      : 'text-ink-2 not-disabled:hover:text-ink border-transparent font-normal',
    className,
  );
}

/**
 * The count a tab, segment or filter chip carries after its label, in
 * brackets ("All signals (107)"), in tabular numerals and `ink-2`. Its text
 * leads with a space, so an accessible name reads "All signals (107)".
 * `upTo`, the most it can read, holds that width, so a filter that changes
 * the count never resizes the control.
 */
export function ControlCount({ count, upTo }: Readonly<{ count: number; upTo?: number }>) {
  const text = ` (${formatCount(count)})`;
  if (upTo === undefined || upTo <= count)
    return <span className="text-ink-2 tabular-nums">{text}</span>;
  return (
    <span className="text-ink-2 inline-grid text-start tabular-nums">
      <span className="col-start-1 row-start-1">{text}</span>
      <span
        aria-hidden
        data-size={` (${formatCount(upTo)})`}
        className="invisible col-start-1 row-start-1 after:content-[attr(data-size)]"
      />
    </span>
  );
}

type TabItem<T extends string> = {
  value: T;
  label: ReactNode;
  /** Rows the tab holds, in brackets after the label. */
  count?: number;
  disabled?: boolean;
};
const ActiveTabContext = createContext<string | null>(null);

type TabStripProps<T extends string> = {
  items: readonly TabItem<T>[];
  ariaLabel: string;
  onIntent?: (value: T) => void;
};

export type TabsProps<T extends string> = TabStripProps<T> & {
  value: T;
  onValueChange: (value: T) => void;
  children?: ReactNode;
  /** Section tabs over their panel: one workspace gap between strip and panel. */
  spaced?: boolean;
};

/**
 * The stateful wrapper, split out from the strip. A page's tabs live in the
 * screen template's navigation band while their panels live two bands below,
 * so the holder of the selected value has to span both.
 */
export function TabsRoot<T extends string>({
  value,
  onValueChange,
  className,
  children,
}: Readonly<{
  value: T;
  onValueChange: (value: T) => void;
  className?: string;
  children: ReactNode;
}>) {
  return (
    <ActiveTabContext value={value}>
      <TabsPrimitive.Root
        value={value}
        onValueChange={(next) => onValueChange(next as T)}
        className={className}
      >
        {children}
      </TabsPrimitive.Root>
    </ActiveTabContext>
  );
}

/** What a route passes to its screen template's `tabs`. */
export type TabRowProps<T extends string = string> = Readonly<
  Pick<TabStripProps<T>, 'items' | 'ariaLabel' | 'onIntent'>
>;

/**
 * TabRow — the route's navigation strip, inside a `TabsRoot`. The page shell
 * sets a control row of filters alone right after it; a row with a
 * view, search or action stays the band under it.
 */
export function TabRow<T extends string>({ items, ariaLabel, onIntent }: TabRowProps<T>) {
  return <TabStrip kind="page" items={items} ariaLabel={ariaLabel} onIntent={onIntent} />;
}

/**
 * A route's tab labels while its page loads: the page strip's face and row,
 * not operable and hidden from assistive technology, the first one current.
 */
export function HeldTabRow({ labels }: Readonly<{ labels: readonly string[] }>) {
  return (
    <div aria-hidden data-held-tabs="" className={cn(TAB_STRIP, 'pointer-events-none gap-1')}>
      {labels.map((label, index) => (
        <span key={label} className={tabFace({ kind: 'page', selected: index === 0 })}>
          {label}
        </span>
      ))}
    </div>
  );
}

const PAGE_KEY: Readonly<Record<string, number>> = { PageUp: -1, PageDown: 1 };

function scrollParent(from: HTMLElement): Element {
  for (let node = from.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
      return node;
    }
  }
  return document.scrollingElement ?? document.documentElement;
}

/**
 * PageUp and PageDown scroll the page by a viewport, as they do from the body;
 * Radix's roving focus would otherwise jump to the first or last tab.
 */
function pageKeyScrollsPage(event: KeyboardEvent<HTMLElement>) {
  const direction = PAGE_KEY[event.key];
  if (direction === undefined) return;
  event.preventDefault();
  const scroller = scrollParent(event.currentTarget);
  scroller.scrollBy({ top: direction * 0.9 * scroller.clientHeight });
}

/**
 * The strip: Radix tabs, so the arrows, Home and End move and select and Tab
 * leaves the list; PageUp and PageDown scroll the page instead. Must be
 * rendered inside a `TabsRoot` (or a `Tabs`).
 */
function TabStrip<T extends string>({
  items,
  ariaLabel,
  onIntent,
  kind = 'section',
}: Readonly<TabStripProps<T> & { kind?: Exclude<TabKind, 'segment'> }>) {
  const active = useContext(ActiveTabContext);
  const strip = useRevealSelected(active);
  useTabMark(strip, active);
  return (
    <StripFrame>
      {(ref, region) => (
        <TabsPrimitive.List
          {...region}
          ref={(node) => {
            ref.current = node;
            strip.current = node;
          }}
          aria-label={ariaLabel}
          className={cn(TAB_STRIP, 'gap-1')}
        >
          {items.map((item) => (
            <TabsPrimitive.Trigger
              key={item.value}
              value={item.value}
              disabled={item.disabled}
              onMouseEnter={() => onIntent?.(item.value)}
              onKeyDown={pageKeyScrollsPage}
              onFocus={(event) => {
                onIntent?.(item.value);
                event.currentTarget.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
              }}
              className={tabFace({ kind, selected: item.value === active })}
            >
              {item.label}
              {item.count === undefined ? null : <ControlCount count={item.count} />}
            </TabsPrimitive.Trigger>
          ))}
          <TabMark />
        </TabsPrimitive.List>
      )}
    </StripFrame>
  );
}

/** Root, strip and panels together — the shape section-level tabs want. */
export function Tabs<T extends string>({
  value,
  onValueChange,
  children,
  spaced = false,
  ...bar
}: Readonly<TabsProps<T>>) {
  return (
    <TabsRoot
      value={value}
      onValueChange={onValueChange}
      className={cn(spaced && 'grid min-w-0 gap-[var(--workspace-gap)]')}
    >
      <TabStrip {...bar} />
      {children}
    </TabsRoot>
  );
}

export function TabPanel({
  value,
  className,
  children,
  forceMount,
}: Readonly<{
  value: string;
  className?: string;
  children: ReactNode;
  forceMount?: true;
}>) {
  const activeValue = useContext(ActiveTabContext);
  return (
    <TabsPrimitive.Content
      value={value}
      forceMount={forceMount}
      hidden={activeValue !== value}
      className={cn('focus-ring', className)}
    >
      {children}
    </TabsPrimitive.Content>
  );
}

/** Arrow keys that move the roving focus, and the direction each moves it. */
const ARROW_DELTA: Readonly<Record<string, number>> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
};

const EDGE_KEY: Readonly<Record<string, 'first' | 'last'>> = { Home: 'first', End: 'last' };

/**
 * One choice of a SegmentedControl. A filter choice may carry the number of
 * rows it keeps (`count`), a short status after its label (`detail`, muted)
 * and an explanation beside it (`hint`, an `InfoHint`).
 */
export type SegmentedOption<T extends string> = Readonly<{
  value: T;
  label: string;
  count?: number;
  /** The most `count` can read; its width is held (`ControlCount`). */
  countUpTo?: number;
  detail?: string;
  hint?: ReactNode;
}>;

/**
 * SegmentedControl — a view switch for two to four exclusive views with no
 * panel (a date range, a metric, a filter), in the Tabs face: the current
 * segment carries the accent underline. Radiogroup semantics: one tab stop at
 * the checked option; the arrow keys move focus and selection, wrapping at
 * both ends, Home and End go to the first and last, and PageUp and PageDown
 * keep the browser's page scroll.
 *
 * `trailing` is a control that shares the track but is NOT one of the
 * choices (Performance's "More", which opens the range dialog): it sits
 * outside the radio group, on the same track.
 */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  id,
  'aria-describedby': describedBy,
  className,
  disabled = false,
  trailing,
}: Readonly<{
  value: T;
  onChange: (value: T) => void;
  options: readonly SegmentedOption<T>[];
  ariaLabel?: string;
  id?: string;
  'aria-describedby'?: string;
  className?: string;
  disabled?: boolean;
  /** A control on the same track that is not one of the choices. */
  trailing?: ReactNode;
}>) {
  const buttonsRef = useRef<Array<HTMLButtonElement | null>>([]);
  const strip = useRevealSelected(value);
  useTabMark(strip, value);
  // With an off-list `value` nothing is checked; fall back to the first option
  // so the group stays reachable by keyboard.
  const selectedIndex = options.findIndex((option) => option.value === value);
  const tabStop = selectedIndex === -1 ? 0 : selectedIndex;

  const select = (next: number) => {
    const option = options[next];
    if (!option) return;
    onChange(option.value);
    buttonsRef.current[next]?.focus();
  };
  const move = (from: number, delta: number) =>
    select((from + delta + options.length) % options.length);

  return (
    <StripFrame>
      {(ref, region) => (
        <div
          {...region}
          ref={(node) => {
            ref.current = node;
            strip.current = node;
          }}
          data-segmented-track=""
          className={cn(TAB_STRIP, 'gap-4', className)}
        >
          {/* A nested flex row, NOT `display: contents`: some browsers drop a
          contents box from the accessibility tree, costing the group its name. */}
          <div
            id={id}
            role="radiogroup"
            aria-label={ariaLabel}
            aria-describedby={describedBy}
            className="flex shrink-0 items-stretch gap-4"
          >
            {options.map((option, index) => {
              const selected = option.value === value;
              const segment = (
                <button
                  key={option.value}
                  ref={(node) => {
                    buttonsRef.current[index] = node;
                  }}
                  type="button"
                  // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Button-based radio keeps roving focus and the segment face.
                  role="radio"
                  aria-checked={selected}
                  disabled={disabled}
                  tabIndex={index === tabStop ? 0 : -1}
                  onClick={() => onChange(option.value)}
                  onFocus={(event) =>
                    event.currentTarget.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
                  }
                  onKeyDown={(event) => {
                    const edge = EDGE_KEY[event.key];
                    const delta = ARROW_DELTA[event.key];
                    if (edge === undefined && delta === undefined) return;
                    event.preventDefault();
                    if (edge) select(edge === 'first' ? 0 : options.length - 1);
                    else if (delta !== undefined) move(index, delta);
                  }}
                  className={tabFace({ kind: 'segment', selected })}
                >
                  {option.label}
                  {/* Each part leads with a space, so the radio's accessible name
                  reads "CTR gaps · Partial (50)". */}
                  {option.detail ? (
                    <span className="text-ink-2 font-normal">{` · ${option.detail}`}</span>
                  ) : null}
                  {option.count === undefined ? null : (
                    <ControlCount count={option.count} upTo={option.countUpTo} />
                  )}
                </button>
              );
              if (!option.hint) return segment;
              return (
                <span key={option.value} className="inline-flex shrink-0 items-center gap-1">
                  {segment}
                  {option.hint}
                </span>
              );
            })}
          </div>
          {trailing}
          <TabMark />
        </div>
      )}
    </StripFrame>
  );
}

/**
 * A button on a SegmentedControl's track that opens something rather than
 * selecting a value (Performance's "More"). `selected` says the active range
 * is one hiding behind it. It holds the width of the widest label it can
 * show, so picking a range never resizes it.
 */
export function SegmentedAction({
  selected = false,
  label,
  labels,
  className,
  children,
  ...props
}: Readonly<
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
    selected?: boolean;
    /** What the action shows now. */
    label: string;
    /** Every label it can show; the widest sets its width. */
    labels: readonly string[];
    /** A trailing glyph after the label. */
    children?: ReactNode;
  }
>) {
  return (
    <button {...props} type="button" className={tabFace({ kind: 'segment', selected, className })}>
      <span className="inline-grid justify-items-center">
        {labels.map((reserved) => (
          <span key={reserved} aria-hidden="true" className="invisible col-start-1 row-start-1">
            {reserved}
          </span>
        ))}
        <span className="col-start-1 row-start-1">{label}</span>
      </span>
      {children}
    </button>
  );
}
