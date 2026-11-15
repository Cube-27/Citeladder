import {
  createContext,
  useContext,
  useRef,
  type ButtonHTMLAttributes,
  type ReactNode,
  type RefObject,
} from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';

import { ScrollFrame, type ScrollRegionProps } from '@/components/ui/scroll-edges';
import { formatCount } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * Tabs and Segmented: text on a hairline. The strip is
 * one row with a 1px `rule` under it that scrolls sideways inside itself
 * (its scrollbar hidden) when its items overflow; each item is `body` in
 * `ink-2`, and the current one is `ink` at `label` weight with the 2px
 * accent underline ("you are here") on the hairline. One face for page tabs,
 * in-section tabs and the Segmented view switch.
 */
const TAB_STRIP =
  'relative inline-flex max-w-full shrink-0 items-stretch overflow-x-auto shadow-[inset_0_-1px_0_var(--color-rule)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden';

/**
 * The strip's `ScrollFrame`: the edge that hides more items fades, and one
 * stepper at the row's end, outside the tabs, moves it along, so a strip cut
 * at a narrow width says more exists and no label sits under a button. The
 * items take focus themselves, so the frame is no tab stop.
 */
function StripFrame({
  fill = false,
  children,
}: Readonly<{
  fill?: boolean;
  children: (ref: RefObject<HTMLDivElement | null>, region: ScrollRegionProps) => ReactNode;
}>) {
  return (
    <ScrollFrame
      stepper="row-end"
      className={cn('inline-flex max-w-full shrink-0', fill && 'flex w-full')}
    >
      {children}
    </ScrollFrame>
  );
}

/**
 * One item: the label, and the current item's accent rung on the hairline.
 * A page tab fills the tabs row (40, 44 below 900px or under a coarse
 * pointer) with 12 each side and hovers on a 6% tile inset 4 top and bottom;
 * a segment is one control high with no padding.
 */
function tabFace({
  selected,
  segment = false,
  className,
}: Readonly<{ selected: boolean; segment?: boolean; className?: string }>) {
  return cn(
    'focus-ring-inset type-body relative inline-flex shrink-0 items-center justify-center gap-1 whitespace-nowrap transition-[color] duration-[var(--motion-fast)] disabled:cursor-not-allowed disabled:opacity-60',
    segment
      ? 'min-h-[var(--control-md)]'
      : 'isolate min-h-[var(--page-tabs-height,var(--control-md))] px-3 before:absolute before:inset-x-0 before:inset-y-1 before:-z-10 before:rounded-mark before:content-[""]',
    !segment && !selected && 'not-disabled:hover:before:bg-state-hover',
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
 */
export function ControlCount({ count }: Readonly<{ count: number }>) {
  return <span className="text-ink-2 tabular-nums">{` (${formatCount(count)})`}</span>;
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
  className?: string;
  onIntent?: (value: T) => void;
  /** Items share the strip's full width (a card head). */
  fill?: boolean;
};

export type TabsProps<T extends string> = TabStripProps<T> & {
  value: T;
  onValueChange: (value: T) => void;
  children?: ReactNode;
  rootClassName?: string;
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
  return <TabStrip items={items} ariaLabel={ariaLabel} onIntent={onIntent} />;
}

/**
 * The strip: Radix tabs, so Left and Right move and select and Tab leaves the
 * list. Must be rendered inside a `TabsRoot` (or a `Tabs`).
 */
function TabStrip<T extends string>({
  items,
  ariaLabel,
  className,
  onIntent,
  fill = false,
}: Readonly<TabStripProps<T>>) {
  const active = useContext(ActiveTabContext);
  return (
    <StripFrame fill={fill}>
      {(ref, region) => (
        <TabsPrimitive.List
          {...region}
          ref={ref}
          aria-label={ariaLabel}
          className={cn(TAB_STRIP, 'gap-1', fill && 'flex w-full', className)}
        >
          {items.map((item) => (
            <TabsPrimitive.Trigger
              key={item.value}
              value={item.value}
              disabled={item.disabled}
              onMouseEnter={() => onIntent?.(item.value)}
              onFocus={(event) => {
                onIntent?.(item.value);
                event.currentTarget.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
              }}
              className={tabFace({
                selected: item.value === active,
                className: fill ? 'min-w-max flex-1 basis-0' : undefined,
              })}
            >
              {item.label}
              {item.count === undefined ? null : <ControlCount count={item.count} />}
            </TabsPrimitive.Trigger>
          ))}
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
  rootClassName,
  spaced = false,
  ...bar
}: Readonly<TabsProps<T>>) {
  return (
    <TabsRoot
      value={value}
      onValueChange={onValueChange}
      className={cn(spaced && 'grid min-w-0 gap-[var(--workspace-gap)]', rootClassName)}
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

/**
 * One choice of a SegmentedControl. A filter choice may carry the number of
 * rows it keeps (`count`), a short status after its label (`detail`, muted)
 * and an explanation beside it (`hint`, an `InfoHint`).
 */
export type SegmentedOption<T extends string> = Readonly<{
  value: T;
  label: string;
  count?: number;
  detail?: string;
  hint?: ReactNode;
}>;

/**
 * SegmentedControl — a view switch for two to four exclusive views with no
 * panel (a date range, a metric, a filter), in the Tabs face: the current
 * segment carries the accent underline. Radiogroup semantics: one tab stop at
 * the checked option, and the arrow keys move focus and selection, wrapping
 * at both ends.
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
  // With an off-list `value` nothing is checked; fall back to the first option
  // so the group stays reachable by keyboard.
  const selectedIndex = options.findIndex((option) => option.value === value);
  const tabStop = selectedIndex === -1 ? 0 : selectedIndex;

  const move = (from: number, delta: number) => {
    const next = (from + delta + options.length) % options.length;
    const option = options[next];
    if (!option) return;
    onChange(option.value);
    buttonsRef.current[next]?.focus();
  };

  return (
    <StripFrame>
      {(ref, region) => (
        <div
          {...region}
          ref={ref}
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
                    const delta = ARROW_DELTA[event.key];
                    if (delta === undefined) return;
                    event.preventDefault();
                    move(index, delta);
                  }}
                  className={tabFace({ selected, segment: true })}
                >
                  {option.label}
                  {/* Each part leads with a space, so the radio's accessible name
                  reads "CTR gaps · Partial (50)". */}
                  {option.detail ? (
                    <span className="text-ink-2 font-normal">{` · ${option.detail}`}</span>
                  ) : null}
                  {option.count === undefined ? null : <ControlCount count={option.count} />}
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
    <button {...props} type="button" className={tabFace({ selected, segment: true, className })}>
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
