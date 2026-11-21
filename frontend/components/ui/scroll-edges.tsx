import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';

import { ChevronLeft, ChevronRight } from '@/lib/icons';

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
 * One sideways-scrolling region's state: the ref for the scrolling element,
 * its props, which edges hide more, and the step. The fade is a mask on the
 * content (data-table.css); a tab row's steppers sit outside it, never over
 * the content. `start={false}` drops the leading fade where a pinned column
 * already marks that edge.
 */
export function useScrollFrame({
  label,
  start = true,
}: Readonly<{ label?: string; start?: boolean }>) {
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
  const frame = {
    'data-scroll-frame': '',
    'data-scroll-start': (start && edges.start) || undefined,
    'data-scroll-end': edges.end || undefined,
  } as const;
  return { ref, region, edges, scrolls, step, frame };
}

export type ScrollFrameState = ReturnType<typeof useScrollFrame>;

/**
 * ScrollFrame — a tab strip that scrolls sideways (`tabs.tsx`): as wide as
 * its tabs, the content fading at the edge it can scroll towards, with a
 * button outside the content at each edge that hides more, so the start
 * mirrors the end once scrolled. While it scrolls, a `label`led frame is a
 * named region with a tab stop, so the arrow keys scroll it; a frame whose
 * content takes focus itself (a tab list) passes no label.
 */
export function ScrollFrame({
  label,
  children,
}: Readonly<{
  label?: string;
  children: (ref: RefObject<HTMLDivElement | null>, region: ScrollRegionProps) => ReactNode;
}>) {
  const state = useScrollFrame({ label });
  const edge = (side: 'start' | 'end') =>
    state.edges[side] ? (
      <ScrollStep side={side} onStep={() => state.step(side === 'end' ? 1 : -1)} />
    ) : null;
  return (
    <div {...state.frame} className="inline-flex max-w-full min-w-0 shrink-0 items-center">
      {edge('start')}
      <div className="flex min-w-0 flex-1">{children(state.ref, state.region)}</div>
      {edge('end')}
    </div>
  );
}

/** A pointer aid: the keyboard scrolls the focused frame, so a step is no tab stop. */
function ScrollStep({ side, onStep }: Readonly<{ side: 'start' | 'end'; onStep: () => void }>) {
  const Glyph = side === 'start' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      tabIndex={-1}
      data-scroll-step={side}
      aria-label={side === 'start' ? 'Scroll back' : 'Scroll forward'}
      onClick={onStep}
      className="text-ink-2 hover:text-ink hover:overlay-hover rounded-control grid min-h-[var(--control-md)] min-w-[var(--control-sm)] shrink-0 place-items-center transition-colors duration-[var(--motion-fast)]"
    >
      <Glyph className="size-3.5" aria-hidden />
    </button>
  );
}
