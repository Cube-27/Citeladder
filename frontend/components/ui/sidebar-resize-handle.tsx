import { useId, useState } from 'react';

import {
  SIDEBAR_PRESET_WIDTHS,
  sidebarDefaultWidth,
  sidebarWidthBounds,
  useSidebarWidthControl,
} from '@/lib/sidebar-width';
import { usePaneResizeInteraction } from '@/lib/use-pane-resize-interaction';

function currentBounds() {
  return sidebarWidthBounds(typeof window === 'undefined' ? 0 : window.innerWidth);
}

/**
 * The labelled sidebar's inner edge, where the reader sizes it (from `rail:`;
 * the collapsed rail and the drawer keep their widths; owner, 2026-11-15). A
 * WAI-ARIA window splitter: drag it, click it to step through preset widths
 * (the non-drag way, WCAG 2.5.7), or focus it and use ← / → (16px, Shift
 * 48px); a double-click restores the default for the window (224, or 200
 * below 1280px); Home takes the minimum (the compact 200) and End the maximum
 * (480px, never more than 40% of the window). At rest the sidebar's own rule
 * shows and hover paints nothing (owner, 2026-11-21); the handle's hairline
 * takes the ink while dragging. The shared interaction stops text selection
 * mid-drag.
 */
export function SidebarResizeHandle({ sidebarId }: Readonly<{ sidebarId: string }>) {
  const helpId = useId();
  const { width, preview, commit } = useSidebarWidthControl();
  const [{ min, max }, setBounds] = useState(currentBounds);
  const resize = usePaneResizeInteraction({
    width,
    bounds: currentBounds,
    onResize: preview,
    onCommit: commit,
    defaultWidth: sidebarDefaultWidth(),
    presets: SIDEBAR_PRESET_WIDTHS,
    onBoundsChange: setBounds,
  });
  return (
    <div // NOSONAR -- a focusable WAI-ARIA window splitter: pointer and arrow-key handlers resize it
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Native hr cannot expose a value or take keyboard focus for resizing.
      role="separator"
      tabIndex={0} // NOSONAR -- a focusable separator is interactive per the WAI-ARIA window splitter pattern
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      aria-controls={sidebarId}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={width}
      aria-describedby={helpId}
      data-dragging={resize.dragging || undefined}
      onPointerDown={resize.onPointerDown}
      onPointerMove={resize.onPointerMove}
      onPointerUp={resize.onPointerUp}
      onPointerCancel={resize.onPointerCancel}
      onLostPointerCapture={resize.onLostPointerCapture}
      onClick={resize.onClick}
      onDoubleClick={resize.onDoubleClick}
      onKeyDown={resize.onKeyDown}
      // A 24px hit area (WCAG 2.5.8) centred on the edge; the drawn line stays 1px.
      className="focus-ring group rail:flex absolute inset-y-0 end-0 hidden w-6 translate-x-1/2 cursor-col-resize touch-none justify-center"
    >
      <span
        aria-hidden
        className="group-data-[dragging]:bg-ink w-px bg-transparent transition-colors motion-reduce:transition-none"
      />
      <span id={helpId} className="sr-only">
        Click to step through preset widths, or use the left and right arrow keys to resize. Hold
        Shift for larger steps. A double-click restores the default width.
      </span>
    </div>
  );
}
