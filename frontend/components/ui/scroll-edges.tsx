import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { cn } from '@/lib/utils';

/** Which sides of a sideways-scrolling region hide more content. */
type ScrollEdges = Readonly<{ start: boolean; end: boolean }>;

const NO_EDGES: ScrollEdges = { start: false, end: false };

/** One pixel of slack, so sub-pixel layout never shows a cue at rest. */
function edgesOf(node: HTMLElement): ScrollEdges {
  const hidden = node.scrollWidth - node.clientWidth;
  if (hidden <= 1) return NO_EDGES;
  // `scrollLeft` runs negative in a right-to-left region.
  const scrolled = Math.abs(node.scrollLeft);
  return { start: scrolled > 1, end: scrolled < hidden - 1 };
}

/**
 * Whether the region `ref` points at can scroll sideways, and towards which
 * side, kept current on scroll and on any resize of the region or its
 * content. Both stay false while nothing overflows.
 */
function useScrollEdges(ref: RefObject<HTMLElement | null>): ScrollEdges {
  const [edges, setEdges] = useState(NO_EDGES);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const update = () => {
      const next = edgesOf(node);
      setEdges((current) =>
        current.start === next.start && current.end === next.end ? current : next,
      );
    };
    update();
    node.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(node);
    // The content can grow (a page of longer rows) while the region keeps its size.
    if (node.firstElementChild) observer.observe(node.firstElementChild);
    return () => {
      node.removeEventListener('scroll', update);
      observer.disconnect();
    };
  }, [ref]);
  return edges;
}

/** The props the scrolling element takes: its cue hook and, while it scrolls, a name and a tab stop. */
export type ScrollRegionProps = Readonly<{
  'data-scroll-content': '';
  tabIndex?: 0;
  role?: 'region';
  'aria-label'?: string;
}>;

/** A step is most of the visible width, so one column or tab stays in view for context. */
const STEP_SHARE = 0.8;

/**
 * ScrollFrame — every region that scrolls sideways (a wide table, a tab
 * row, a table in an Agent reply). The content fades out at the edge it can
 * scroll towards (a mask on the content, never a tinted tray) and a 24-wide
 * chevron on that edge steps it along; both appear only while there is more
 * that way. While it scrolls, a `label`led frame is a named region with a tab
 * stop, so the arrow keys scroll it; a frame whose content takes focus itself
 * (a tab list) passes no label. Scrollbars are left as they are.
 *
 * `start={false}` drops the leading cue where a pinned first column already
 * marks that edge. `stepper="head"` sets the chevrons on the header band of a
 * table instead of the full height.
 */
export function ScrollFrame({
  label,
  start = true,
  stepper = 'full',
  className,
  children,
}: Readonly<{
  label?: string;
  start?: boolean;
  stepper?: 'full' | 'head';
  className?: string;
  children: (ref: RefObject<HTMLDivElement | null>, region: ScrollRegionProps) => ReactNode;
}>) {
  const ref = useRef<HTMLDivElement>(null);
  const edges = useScrollEdges(ref);
  const scrolls = edges.start || edges.end;
  const region: ScrollRegionProps =
    label && scrolls
      ? { 'data-scroll-content': '', tabIndex: 0, role: 'region', 'aria-label': label }
      : { 'data-scroll-content': '' };
  const step = (direction: 1 | -1) => {
    const node = ref.current;
    if (!node) return;
    const reduce = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    node.scrollBy({
      left: direction * node.clientWidth * STEP_SHARE,
      behavior: reduce ? 'auto' : 'smooth',
    });
  };
  return (
    <div
      data-scroll-frame=""
      data-scroll-start={(start && edges.start) || undefined}
      data-scroll-end={edges.end || undefined}
      className={cn('relative min-w-0', className)}
    >
      {children(ref, region)}
      {start && edges.start ? (
        <ScrollStep side="start" stepper={stepper} onStep={() => step(-1)} />
      ) : null}
      {edges.end ? <ScrollStep side="end" stepper={stepper} onStep={() => step(1)} /> : null}
    </div>
  );
}

/**
 * The chevron on an edge with more beyond it. A pointer aid: the keyboard
 * scrolls the focused frame (or moves through its tabs), so it is no tab stop.
 */
function ScrollStep({
  side,
  stepper,
  onStep,
}: Readonly<{ side: 'start' | 'end'; stepper: 'full' | 'head'; onStep: () => void }>) {
  const Glyph = side === 'start' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      tabIndex={-1}
      data-scroll-step={side}
      aria-label={side === 'start' ? 'Scroll back' : 'Scroll forward'}
      onClick={onStep}
      className={cn(
        'text-ink-2 hover:text-ink hover:overlay-hover absolute top-0 z-30 grid w-6 place-items-center transition-colors duration-[var(--motion-fast)]',
        side === 'start' ? 'start-0' : 'end-0',
        stepper === 'head' ? 'h-[var(--table-header-height)]' : 'bottom-0',
      )}
    >
      <Glyph className="size-4" aria-hidden />
    </button>
  );
}
