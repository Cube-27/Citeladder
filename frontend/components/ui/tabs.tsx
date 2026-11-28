import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';

import { Inline } from '@/components/ui/layout';
import { ScrollFrame } from '@/components/ui/scroll-edges';
import { TabHeadSlotContext } from '@/components/ui/tab-head-slot';
import { useOnPage } from '@/components/ui/section';
import { sidebarNavRowClasses } from '@/components/ui/sidebar';
import { MEDIA } from '@/lib/breakpoints';
import { useMediaQuery } from '@/lib/use-media-query';
import { formatCount } from '@/lib/format';
import { cn } from '@/lib/utils';
import './tabs.css';

const TAB_STRIP =
  'relative inline-flex max-w-full shrink-0 items-stretch overflow-x-auto scrollbar-none [&::-webkit-scrollbar]:hidden';

const REVEAL_PADDING = 32;

const SELECTED_ITEM = '[data-tab-face]:is([aria-selected="true"], [aria-checked="true"])';

function useRevealSelected(selected: string | null) {
  const strip = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const list = strip.current;
    const item = list?.querySelector<HTMLElement>(SELECTED_ITEM);
    if (!list || !item) return;
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

const TAB_KIND = {
  tab: {
    base: 'min-h-8 self-stretch px-4',
    current: 'tab-line',
  },
  segment: {
    base: 'rounded-tray-item h-control-sm px-4',
    current: 'bg-nav-current shadow-card',
  },
} as const;

export function tabFace({
  kind,
  selected,
  className,
}: Readonly<{ kind: keyof typeof TAB_KIND; selected: boolean; className?: string }>) {
  return cn(
    'focus-ring-inset text-label text-ink relative inline-flex shrink-0 items-center justify-center gap-1 whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-disabled',
    TAB_KIND[kind].base,
    selected ? cn('text-ink', TAB_KIND[kind].current) : 'text-ink-2 not-disabled:hover:text-ink',
    className,
  );
}

export const TAB_BASELINE = 'shadow-[inset_0_-1px_0_var(--color-rule)]';

const PILL_TRACK = 'rounded-control bg-state-fill p-tray-inset';

const STRIP_ROW = {
  page: 'min-h-page-tabs',
  section: PILL_TRACK,
} as const;

const TAB_TRACK =
  'inline-flex min-h-control-md max-w-full shrink-0 items-center gap-0.5 overflow-x-auto rounded-control p-tray-inset scrollbar-none [&::-webkit-scrollbar]:hidden';

const TAB_FACE =
  'focus-ring inline-flex shrink-0 items-center self-stretch justify-center gap-1.5 rounded-tray-item border border-transparent px-3 text-label whitespace-nowrap transition-tint duration-fast focus-visible:outline-offset-1 disabled:cursor-not-allowed disabled:opacity-disabled';

const TAB_FACE_STATE = {
  selected: 'bg-panel text-ink font-emphasis',
  idle: 'text-ink-2 not-disabled:hover:text-ink font-plain',
} as const;

export function TabTrackFace({
  items,
  selected,
  ...props
}: Readonly<
  Omit<ComponentPropsWithoutRef<'span'>, 'className' | 'style' | 'children'> & {
    items: readonly Readonly<{ label: string; count?: number }>[];
    selected: string;
  }
>) {
  return (
    <span {...props} className={TAB_TRACK}>
      {items.map((item) => (
        <span
          key={item.label}
          className={cn(TAB_FACE, TAB_FACE_STATE[item.label === selected ? 'selected' : 'idle'])}
        >
          {item.label}
          {item.count === undefined ? null : <ControlCount count={item.count} />}
        </span>
      ))}
    </span>
  );
}

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
  spaced?: boolean;
  heading?: ReactNode;
  actions?: ReactNode;
};

const TABS_LAYOUT = {
  flow: undefined,
  'drawer-split':
    'phone:grid-cols-1 phone:grid-rows-[auto_minmax(0,1fr)] grid min-h-0 flex-1 grid-cols-[184px_minmax(0,1fr)]',
  spaced: 'grid min-w-0 gap-workspace',
} as const;

export function TabsRoot<T extends string>({
  value,
  onValueChange,
  orientation,
  layout = 'flow',
  className,
  children,
}: Readonly<{
  value: T;
  onValueChange: (value: T) => void;
  orientation?: 'vertical';
  layout?: keyof typeof TABS_LAYOUT;
  className?: string;
  children: ReactNode;
}>) {
  const inPanel = !useOnPage();
  const railed = useMediaQuery(MEDIA.desktop) && orientation === 'vertical';
  return (
    <ActiveTabContext value={value}>
      <TabsPrimitive.Root
        value={value}
        onValueChange={(next) => onValueChange(next as T)}
        orientation={railed ? 'vertical' : 'horizontal'}
        data-slot-host={inPanel && orientation !== 'vertical' ? '' : undefined}
        className={cn(TABS_LAYOUT[layout], className)}
      >
        {children}
      </TabsPrimitive.Root>
    </ActiveTabContext>
  );
}

export type TabRowProps<T extends string = string> = Readonly<
  Pick<TabStripProps<T>, 'items' | 'ariaLabel' | 'onIntent'>
>;

export function TabRow<T extends string>({ items, ariaLabel, onIntent }: TabRowProps<T>) {
  return <TabStrip kind="page" items={items} ariaLabel={ariaLabel} onIntent={onIntent} />;
}

const railRow = (current: boolean, onPage: boolean) =>
  sidebarNavRowClasses(
    current,
    cn('desktop:w-full w-auto', !onPage && current && 'bg-state-fill shadow-none'),
  );

const RAIL_LIST = 'desktop:flex-col desktop:overflow-visible flex min-w-0 gap-0.5 overflow-x-auto';

export function TabRail<T extends string>({ items, ariaLabel, onIntent }: TabRowProps<T>) {
  const active = useContext(ActiveTabContext);
  const onPage = useOnPage();
  return (
    <TabsPrimitive.List aria-label={ariaLabel} className={RAIL_LIST}>
      {items.map((item) => (
        <TabsPrimitive.Trigger
          key={item.value}
          value={item.value}
          disabled={item.disabled}
          onMouseEnter={() => onIntent?.(item.value)}
          onFocus={() => onIntent?.(item.value)}
          onKeyDown={pageKeyScrollsPage}
          className={railRow(item.value === active, onPage)}
        >
          <span className="truncate">{item.label}</span>
          {item.count === undefined ? null : <ControlCount count={item.count} />}
        </TabsPrimitive.Trigger>
      ))}
    </TabsPrimitive.List>
  );
}

export function HeldTabRail({
  labels,
  selected,
}: Readonly<{ labels: readonly string[]; selected?: string }>) {
  const current = selected !== undefined && labels.includes(selected) ? selected : labels[0];
  const onPage = useOnPage();
  return (
    <div aria-hidden data-held-tabs="" className={cn('pointer-events-none', RAIL_LIST)}>
      {labels.map((label) => (
        <span
          key={label}
          data-selected={label === current || undefined}
          className={railRow(label === current, onPage)}
        >
          <span className="truncate">{label}</span>
        </span>
      ))}
    </div>
  );
}

export function HeldTabRow({
  labels,
  selected,
}: Readonly<{ labels: readonly string[]; selected?: string }>) {
  const current = selected !== undefined && labels.includes(selected) ? selected : labels[0];
  return (
    <div
      aria-hidden
      data-held-tabs=""
      className={cn(TAB_STRIP, STRIP_ROW.page, 'pointer-events-none')}
    >
      {labels.map((label) => (
        <span
          key={label}
          data-selected={label === current || undefined}
          data-tab-face=""
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

function pageKeyScrollsPage(event: KeyboardEvent<HTMLElement>) {
  const direction = PAGE_KEY[event.key];
  if (direction === undefined) return;
  event.preventDefault();
  const scroller = scrollParent(event.currentTarget);
  scroller.scrollBy({ top: direction * 0.9 * scroller.clientHeight });
}

function TabStrip<T extends string>({
  items,
  ariaLabel,
  onIntent,
  kind = 'section',
}: Readonly<TabStripProps<T> & { kind?: keyof typeof STRIP_ROW }>) {
  const active = useContext(ActiveTabContext);
  const strip = useRevealSelected(active);
  return (
    <ScrollFrame>
      {(ref, region) => (
        <TabsPrimitive.List
          {...region}
          ref={(node) => {
            ref.current = node;
            strip.current = node;
          }}
          aria-label={ariaLabel}
          className={cn(TAB_STRIP, STRIP_ROW[kind])}
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
              data-tab-face=""
              className={tabFace({
                kind: kind === 'page' ? 'tab' : 'segment',
                selected: item.value === active,
              })}
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

export function Tabs<T extends string>({
  value,
  onValueChange,
  children,
  spaced = false,
  heading,
  actions,
  ...bar
}: Readonly<TabsProps<T>>) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  return (
    <TabsRoot value={value} onValueChange={onValueChange} layout={spaced ? 'spaced' : 'flow'}>
      <Inline data-tab-head="" wrap gap="group">
        {heading ? <Inline box="fill">{heading}</Inline> : null}
        <TabStrip {...bar} />
        <Inline
          ref={setSlot}
          data-tab-head-controls=""
          wrap
          justify="end"
          hideEmpty
          box={heading ? 'auto' : 'fill'}
        >
          {actions}
        </Inline>
      </Inline>
      <TabHeadSlotContext value={slot}>{children}</TabHeadSlotContext>
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
  const inPanel = !useOnPage();
  return (
    <TabsPrimitive.Content
      value={value}
      forceMount={forceMount}
      hidden={activeValue !== value}
      data-slot-host={inPanel ? '' : undefined}
      tabIndex={-1}
      className={cn('outline-none', className)}
    >
      {children}
    </TabsPrimitive.Content>
  );
}

const ARROW_DELTA: Readonly<Record<string, number>> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
};

const EDGE_KEY: Readonly<Record<string, 'first' | 'last'>> = { Home: 'first', End: 'last' };

export type SegmentedOption<T extends string> = Readonly<{
  value: T;
  label: string;
  count?: number;
  countUpTo?: number;
  detail?: string;
  hint?: ReactNode;
}>;

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
  trailing?: ReactNode;
}>) {
  const buttonsRef = useRef<Array<HTMLButtonElement | null>>([]);
  const strip = useRevealSelected(value);
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
    <ScrollFrame>
      {(ref, region) => (
        <div
          {...region}
          ref={(node) => {
            ref.current = node;
            strip.current = node;
          }}
          data-segmented-track=""
          className={cn(TAB_STRIP, PILL_TRACK, className)}
        >
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
                  // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
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
                  data-tab-face=""
                  className={tabFace({ kind: 'segment', selected })}
                >
                  {option.label}
                  {option.detail ? (
                    <span className="text-ink-2 font-plain">{` · ${option.detail}`}</span>
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
