import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ButtonHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';

import { ScrollFrame } from '@/components/ui/scroll-edges';
import { sidebarNavRowClasses } from '@/components/ui/sidebar';
import { formatCount } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * Tabs: text tabs 20 apart (docs/design.md, Tab strip). The strip is one row
 * that scrolls sideways inside itself (its scrollbar hidden) when its items
 * overflow; each item is `body` in `ink-2`, and the current one is `ink` over
 * a 2px accent underline ("you, here"). One face for page and section tabs.
 */
const TAB_STRIP =
  'relative inline-flex max-w-full shrink-0 items-stretch overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden';

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
    // A lone end stepper means scrolling will add a start one, narrowing the
    // strip; the padding shrinks to fit, and a too-wide item shows its start.
    const wrap = list.parentElement;
    const view =
      list.clientWidth -
      (wrap?.previousElementSibling ? 0 : (wrap?.nextElementSibling?.clientWidth ?? 0));
    const pad = Math.max(0, Math.min(REVEAL_PADDING, (view - item.offsetWidth) / 2));
    const start = Math.max(0, item.offsetLeft - pad);
    const left = list.scrollLeft;
    list.scrollLeft =
      left > start
        ? start
        : Math.max(left, Math.min(start, start + item.offsetWidth + 2 * pad - view));
  }, [selected]);
  return strip;
}

/**
 * One item at one weight, so a selection never changes width. A tab fills
 * its strip's height, its underline on the strip's foot. A segment is 4 less
 * than a control (its track's 1px edge and 1px inset each side), on
 * `state-selected` when current.
 */
const TAB_KIND = {
  tab: {
    base: 'min-h-[var(--control-md)] self-stretch',
    current:
      'after:bg-accent after:absolute after:inset-x-0 after:bottom-0 after:h-[var(--mark-width)]',
  },
  segment: {
    base: 'rounded-mark min-h-[calc(var(--control-md)_-_4px)] px-3',
    current: 'bg-state-selected',
  },
} as const;

function tabFace({
  kind,
  selected,
  className,
}: Readonly<{ kind: keyof typeof TAB_KIND; selected: boolean; className?: string }>) {
  return cn(
    'tab-face focus-ring-inset type-body relative inline-flex shrink-0 items-center justify-center gap-1 whitespace-nowrap transition-[color,background-color] duration-[var(--motion-fast)] disabled:cursor-not-allowed disabled:opacity-60',
    TAB_KIND[kind].base,
    selected ? cn('text-ink', TAB_KIND[kind].current) : 'text-ink-2 not-disabled:hover:text-ink',
    className,
  );
}

/** A tab strip's row: a page strip keeps the page band's height; a section strip draws its rule. */
const STRIP_ROW = {
  page: 'min-h-[var(--page-tabs-height,var(--control-md))]',
  section: 'border-rule border-b',
} as const;

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
  orientation,
  className,
  children,
}: Readonly<{
  value: T;
  onValueChange: (value: T) => void;
  /** `vertical` for a `TabRail`: Up and Down move between its rows. */
  orientation?: 'vertical';
  className?: string;
  children: ReactNode;
}>) {
  return (
    <ActiveTabContext value={value}>
      <TabsPrimitive.Root
        value={value}
        onValueChange={(next) => onValueChange(next as T)}
        orientation={orientation}
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
 * TabRail — a page's sections as a list down its left, inside a vertical
 * `TabsRoot`: rows on the sidebar's face, the current one on its tile, so
 * the header above never moves when a section is wider than the rest.
 */
export function TabRail<T extends string>({ items, ariaLabel, onIntent }: TabRowProps<T>) {
  const active = useContext(ActiveTabContext);
  return (
    <TabsPrimitive.List aria-label={ariaLabel} className="flex min-w-0 flex-col gap-0.5">
      {items.map((item) => (
        <TabsPrimitive.Trigger
          key={item.value}
          value={item.value}
          disabled={item.disabled}
          onMouseEnter={() => onIntent?.(item.value)}
          onFocus={() => onIntent?.(item.value)}
          onKeyDown={pageKeyScrollsPage}
          className={sidebarNavRowClasses(item.value === active)}
        >
          <span className="truncate">{item.label}</span>
          {item.count === undefined ? null : <ControlCount count={item.count} />}
        </TabsPrimitive.Trigger>
      ))}
    </TabsPrimitive.List>
  );
}

/** A `TabRail`'s rows while its page loads, `selected` current (else the first). */
export function HeldTabRail({
  labels,
  selected,
}: Readonly<{ labels: readonly string[]; selected?: string }>) {
  const current = selected !== undefined && labels.includes(selected) ? selected : labels[0];
  return (
    <div
      aria-hidden
      data-held-tabs=""
      className="pointer-events-none flex min-w-0 flex-col gap-0.5"
    >
      {labels.map((label) => (
        <span
          key={label}
          data-selected={label === current || undefined}
          className={sidebarNavRowClasses(label === current)}
        >
          <span className="truncate">{label}</span>
        </span>
      ))}
    </div>
  );
}

/**
 * A route's tab labels while its page loads: the page strip's face and row,
 * not operable and hidden from assistive technology, `selected` current (the
 * first when it names none).
 */
export function HeldTabRow({
  labels,
  selected,
}: Readonly<{ labels: readonly string[]; selected?: string }>) {
  const current = selected !== undefined && labels.includes(selected) ? selected : labels[0];
  return (
    <div
      aria-hidden
      data-held-tabs=""
      className={cn(TAB_STRIP, STRIP_ROW.page, 'pointer-events-none gap-5')}
    >
      {labels.map((label) => (
        <span
          key={label}
          data-selected={label === current || undefined}
          className={tabFace({ kind: 'tab', selected: label === current })}
        >
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
}: Readonly<TabStripProps<T> & { kind?: keyof typeof STRIP_ROW }>) {
  const active = useContext(ActiveTabContext);
  const strip = useRevealSelected(active);
  return (
    <ScrollFrame stepper="row">
      {(ref, region) => (
        <TabsPrimitive.List
          {...region}
          ref={(node) => {
            ref.current = node;
            strip.current = node;
          }}
          aria-label={ariaLabel}
          className={cn(TAB_STRIP, STRIP_ROW[kind], 'gap-5')}
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
              className={tabFace({ kind: 'tab', selected: item.value === active })}
            >
              {item.label}
              {item.count === undefined ? null : <ControlCount count={item.count} />}
            </TabsPrimitive.Trigger>
          ))}
        </TabsPrimitive.List>
      )}
    </ScrollFrame>
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
 * panel (a date range, a metric, a filter, the sidebar's Dashboard | Agent):
 * a `rule`-framed track one control high, 2px inset, the current segment on
 * `state-selected`. Radiogroup semantics: one tab stop at
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
    <ScrollFrame stepper="row">
      {(ref, region) => (
        <div
          {...region}
          ref={(node) => {
            ref.current = node;
            strip.current = node;
          }}
          data-segmented-track=""
          className={cn(TAB_STRIP, 'border-rule rounded-control border p-px', className)}
        >
          {/* A nested flex row, NOT `display: contents`: some browsers drop a
          contents box from the accessibility tree, costing the group its name. */}
          <div
            id={id}
            role="radiogroup"
            aria-label={ariaLabel}
            aria-describedby={describedBy}
            className="flex shrink-0 items-stretch gap-0.5"
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
        </div>
      )}
    </ScrollFrame>
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
