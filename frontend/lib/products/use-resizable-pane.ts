'use client';

import { useState, useSyncExternalStore } from 'react';
import { usePaneResizeInteraction } from '@/lib/use-pane-resize-interaction';

/**
 * Width state for a drag-resizable pane, in pixels.
 *
 * The catalog pane was a fixed 18rem track. That is too narrow for a retailer
 * whose category names are full sentences ("END OF SEASON UP TO 50% OFF") and
 * too wide for one that just lists "Tops"/"Denim", and neither reading is the
 * app's to make — so the width is the reader's, and it persists per browser.
 *
 * `localStorage` is the stored width's only home, read through
 * `useSyncExternalStore`: it is an external store, and subscribing to it is
 * what keeps the server's markup (always the default) from being contradicted
 * by a client render, without an effect that re-renders on mount. The width
 * mid-drag is React state instead — it is not yet a decision worth storing.
 */

const STORAGE_KEY = 'citeladder:commerce:catalog-pane-width';

/** 14rem: below this the checkbox, name, and count stop fitting on one line. */
export const MIN_PANE_WIDTH = 224;
/** 35rem: past this the detail pane, not the list, is the one being starved. */
export const MAX_PANE_WIDTH = 560;
/** 18rem — the fixed track this pane had before it could be resized. */
export const DEFAULT_PANE_WIDTH = 288;
/** One arrow press. Coarse enough to cross the range without holding a key. */
const KEYBOARD_STEP = 16;

function clampWidth(width: number): number {
  return Math.min(MAX_PANE_WIDTH, Math.max(MIN_PANE_WIDTH, Math.round(width)));
}

const listeners = new Set<() => void>();
let volatileWidth: number | null = null;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Another tab resizing its pane is the same store changing underneath us.
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

function getStoredWidth(): number {
  if (volatileWidth !== null) return volatileWidth;
  try {
    const stored = Number(window.localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(stored) && stored > 0 ? clampWidth(stored) : DEFAULT_PANE_WIDTH;
  } catch {
    // A browser with site data blocked still gets a working, unremembered pane.
    return DEFAULT_PANE_WIDTH;
  }
}

/** The server has no stored width, so it renders the default. */
function getServerWidth(): number {
  return DEFAULT_PANE_WIDTH;
}

function storeWidth(width: number): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(width));
    volatileWidth = null;
  } catch {
    // Keep the reader's decision for this session when persistence is blocked.
    volatileWidth = width;
  }
  for (const listener of listeners) listener();
}

export type ResizablePane = {
  width: number;
  dragging: boolean;
  /** Begin a pointer drag from this viewport x-coordinate. */
  beginDrag: (clientX: number) => void;
  /** Continue the drag. Width moves by the pointer's delta, not its position. */
  dragTo: (clientX: number) => void;
  /** End the drag and keep the width it landed on. */
  endDrag: () => void;
  /** Nudge the width, for keyboard control of the separator. */
  nudge: (delta: number) => void;
  reset: () => void;
  keyboardStep: number;
  interaction: ReturnType<typeof usePaneResizeInteraction>;
};

export function useResizablePane(): ResizablePane {
  const storedWidth = useSyncExternalStore(subscribe, getStoredWidth, getServerWidth);
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const width = dragWidth ?? storedWidth;
  const interaction = usePaneResizeInteraction({
    width,
    bounds: () => ({ min: MIN_PANE_WIDTH, max: MAX_PANE_WIDTH }),
    onResize: setDragWidth,
    onCommit: (next) => {
      setDragWidth(null);
      storeWidth(next);
    },
    defaultWidth: DEFAULT_PANE_WIDTH,
    homeWidth: DEFAULT_PANE_WIDTH,
  });

  return {
    width,
    dragging: interaction.dragging,
    beginDrag: interaction.beginDrag,
    dragTo: interaction.dragTo,
    endDrag: interaction.endDrag,
    nudge: interaction.nudge,
    reset: interaction.reset,
    keyboardStep: KEYBOARD_STEP,
    interaction,
  };
}
