'use client';

import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';

import { splitPaneClasses, stickyPaneClasses } from '@/components/ui/workspace';
import { usePaneResizeInteraction } from '@/lib/use-pane-resize-interaction';
import { cn } from '@/lib/utils';

/**
 * ResizableSplitPane — the `list-detail` split with a list the reader sizes.
 *
 * Commerce and Prompts each built a resizable pane with its own separator: a
 * 12px button with a 1px rule in one, a 2px rounded bar in a div in the other,
 * different hover inks, different Home-key behaviour and different sticky
 * offsets. This is the one recipe:
 *
 *   - `role="separator"`, focusable, `aria-orientation="vertical"`,
 *     `aria-valuenow/min/max` in pixels and `aria-controls` → the list.
 *   - Keys: ← / → move 16px (Shift: 48px), Home → minimum, End → maximum.
 *     Double-click restores the default. Pointer drag with capture; a
 *     cancelled pointer restores the width the drag started from.
 *   - The rule is a hairline that strengthens on hover and takes the focus
 *     colour while focused or dragging.
 *   - Below `lg` the panes stack and the separator is not rendered.
 *
 * The width is uncontrolled by default. A route that remembers it controls it:
 * `width` plus `onWidthChange` (update the drag width) and `onWidthCommit`
 * (store the settled width) — Commerce stores it per browser.
 */
const KEY_STEP_LARGE = 48;

export function ResizableSplitPane({
  list,
  children,
  listId,
  separatorLabel,
  defaultWidth,
  minWidth,
  maxWidth,
  minDetailWidth = 0,
  width: controlledWidth,
  onWidthChange,
  onWidthCommit,
  stickyList = false,
  className,
}: Readonly<{
  /** The selectable list (left). */
  list: ReactNode;
  /** The selection's detail (right). */
  children: ReactNode;
  /** `id` of the list's container, for the separator's `aria-controls`. */
  listId: string;
  /** The separator's accessible name, e.g. "Resize the catalog pane". */
  separatorLabel: string;
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
  /** The detail never shrinks below this; the list's maximum yields first. */
  minDetailWidth?: number;
  /** Controlled width in px. */
  width?: number;
  /** Every intermediate width while dragging or keying. */
  onWidthChange?: (width: number) => void;
  /** The width a drag or key press settled on — the one worth storing. */
  onWidthCommit?: (width: number) => void;
  /** Keep the list in view while the detail scrolls. */
  stickyList?: boolean;
  className?: string;
}>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const helpId = useId();
  const [ownWidth, setOwnWidth] = useState(defaultWidth);
  const [effectiveMax, setEffectiveMax] = useState(maxWidth);
  const width = controlledWidth ?? ownWidth;

  const bounds = () => {
    const available = containerRef.current?.getBoundingClientRect().width ?? 0;
    const responsiveMax = available ? available - minDetailWidth : maxWidth;
    return { min: minWidth, max: Math.max(minWidth, Math.min(maxWidth, responsiveMax)) };
  };

  const resize = usePaneResizeInteraction({
    width,
    bounds,
    onResize: (next) => {
      setOwnWidth(next);
      onWidthChange?.(next);
    },
    onCommit: (next) => onWidthCommit?.(next),
    defaultWidth,
    homeWidth: minWidth,
    endKey: true,
    shiftStep: KEY_STEP_LARGE,
    onBoundsChange: ({ max }) => setEffectiveMax(max),
  });

  // Re-clamp when the container narrows, so the detail keeps its minimum.
  const refreshRef = useRef(resize.refreshBounds);
  useEffect(() => {
    refreshRef.current = resize.refreshBounds;
  }, [resize.refreshBounds]);
  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => refreshRef.current());
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ '--split-pane-list-width': `${width}px` } as CSSProperties}
      className={splitPaneClasses('list-detail', {
        resizable: true,
        className: cn(resize.dragging && 'cursor-col-resize select-none', className),
      })}
    >
      <div id={listId} className={cn('min-w-0', stickyList && stickyPaneClasses)}>
        {list}
      </div>
      <div
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Native hr cannot expose a value or take keyboard focus for resizing.
        role="separator"
        tabIndex={0}
        aria-orientation="vertical"
        aria-label={separatorLabel}
        aria-controls={listId}
        aria-valuemin={minWidth}
        aria-valuemax={effectiveMax}
        aria-valuenow={width}
        aria-describedby={helpId}
        title="Drag to resize. Double-click to reset."
        data-dragging={resize.dragging || undefined}
        onPointerDown={resize.onPointerDown}
        onPointerMove={resize.onPointerMove}
        onPointerUp={resize.onPointerUp}
        onPointerCancel={resize.onPointerCancel}
        onLostPointerCapture={resize.onLostPointerCapture}
        onDoubleClick={resize.onDoubleClick}
        onKeyDown={resize.onKeyDown}
        className="focus-ring group hidden w-4 cursor-col-resize touch-none justify-center self-stretch rounded-xs py-2 lg:flex"
      >
        <span
          aria-hidden
          className="bg-border group-hover:bg-border-strong group-focus-visible:bg-accent group-data-[dragging]:bg-accent w-px transition-colors motion-reduce:transition-none"
        />
        <span id={helpId} className="sr-only">
          Use the left and right arrow keys to resize. Hold Shift for larger steps.
        </span>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
