'use client';

import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';

import { Pressable } from '@/components/ui/pressable';
import { usePaneResizeInteraction } from '@/lib/use-pane-resize-interaction';

const DEFAULT_RAIL_WIDTH = 240;
const MIN_RAIL_WIDTH = 208;
const MAX_RAIL_WIDTH = 400;
const MIN_CONTENT_WIDTH = 560;
const HANDLE_WIDTH = 12;

export function ResizablePromptWorkspace({
  rail,
  children,
  railId,
}: Readonly<{ rail: ReactNode; children: ReactNode; railId: string }>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [railWidth, setRailWidth] = useState(DEFAULT_RAIL_WIDTH);
  const [maxRailWidth, setMaxRailWidth] = useState(MAX_RAIL_WIDTH);

  const bounds = () => {
    const containerWidth = containerRef.current?.getBoundingClientRect().width ?? 0;
    const responsiveMax = containerWidth
      ? containerWidth - MIN_CONTENT_WIDTH - HANDLE_WIDTH
      : MAX_RAIL_WIDTH;
    return {
      min: MIN_RAIL_WIDTH,
      max: Math.max(MIN_RAIL_WIDTH, Math.min(MAX_RAIL_WIDTH, responsiveMax)),
    };
  };

  const resize = usePaneResizeInteraction({
    width: railWidth,
    bounds,
    onResize: setRailWidth,
    onCommit: () => {},
    defaultWidth: DEFAULT_RAIL_WIDTH,
    homeWidth: MIN_RAIL_WIDTH,
    endKey: true,
    shiftStep: 48,
    onBoundsChange: ({ max }) => setMaxRailWidth(max),
  });
  const refreshBoundsRef = useRef(resize.refreshBounds);
  useEffect(() => {
    refreshBoundsRef.current = resize.refreshBounds;
  }, [resize.refreshBounds]);

  useEffect(() => {
    const container = containerRef.current;
    const observer =
      container && typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            refreshBoundsRef.current();
          })
        : null;
    if (container) observer?.observe(container);
    return () => {
      observer?.disconnect();
    };
  }, []);

  const workspaceStyle = {
    '--topic-rail-width': `${railWidth}px`,
  } as CSSProperties;

  return (
    <div
      ref={containerRef}
      className="flex min-w-0 flex-col items-start gap-3 lg:flex-row lg:gap-0"
      style={workspaceStyle}
    >
      <div className="w-full min-w-0 lg:w-[var(--topic-rail-width)] lg:shrink-0">{rail}</div>
      <Pressable
        type="button"
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Native hr cannot expose value or implement this keyboard-operable splitter.
        role="separator"
        aria-label="Resize topics panel"
        aria-orientation="vertical"
        aria-controls={railId}
        aria-valuemin={MIN_RAIL_WIDTH}
        aria-valuemax={maxRailWidth}
        aria-valuenow={railWidth}
        aria-describedby="topic-rail-resize-help"
        title="Drag to resize. Double-click to reset."
        onDoubleClick={resize.onDoubleClick}
        onKeyDown={resize.onKeyDown}
        onPointerDown={resize.onPointerDown}
        onPointerMove={resize.onPointerMove}
        onPointerUp={resize.onPointerUp}
        onPointerCancel={resize.onPointerCancel}
        onLostPointerCapture={resize.onLostPointerCapture}
        style={{ touchAction: 'none' }}
        className="focus-ring group relative hidden w-3 shrink-0 cursor-col-resize items-stretch justify-center self-stretch py-2 lg:flex"
        data-dragging={resize.dragging || undefined}
      >
        <span
          className="bg-border-strong group-hover:bg-accent group-focus-visible:bg-accent group-data-[dragging]:bg-accent w-px transition-colors motion-reduce:transition-none"
          aria-hidden
        />
        <span id="topic-rail-resize-help" className="sr-only">
          Use left and right arrow keys to resize. Hold Shift for larger steps.
        </span>
      </Pressable>
      <div className="w-full min-w-0 flex-1 lg:ps-3">{children}</div>
    </div>
  );
}
