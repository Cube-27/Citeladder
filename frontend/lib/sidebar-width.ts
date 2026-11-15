import { useSyncExternalStore } from 'react';

/**
 * The app sidebar's width and whether it is collapsed to the rail: per-browser
 * reading preferences (never the server's). The reader drags the sidebar's
 * inner edge, or collapses it, and the choice stays for this browser.
 *
 * `localStorage` is the stored width's only home, read through
 * `useSyncExternalStore`. The app renders on the client only, so the shell's
 * first render already reads the stored width: the frame paints at it, with no
 * default-width frame first. Mid-drag the live width is the store's volatile
 * value, so the frame follows the pointer; only a settled width is written.
 *
 * `null` means the default: the frame then sets no width of its own and the
 * `--sidebar-width` token in `globals.css` stands.
 */

const STORAGE_KEY = 'citeladder:app:sidebar-width';
const COLLAPSED_KEY = 'citeladder:app:sidebar-collapsed';

/** The `--sidebar-width` token from 1280px, and `--sidebar-width-compact` below it. */
const SIDEBAR_WIDE_WIDTH = 224;
const SIDEBAR_COMPACT_WIDTH = 200;
const WIDE_QUERY = '(min-width: 1280px)';
/** The compact width is the narrowest a labelled sidebar goes. */
const SIDEBAR_MIN_WIDTH = SIDEBAR_COMPACT_WIDTH;

/** The token's width in a window this wide: what Home and a double-click restore. */
export function sidebarDefaultWidth(): number {
  return typeof window !== 'undefined' && window.matchMedia?.(WIDE_QUERY).matches
    ? SIDEBAR_WIDE_WIDTH
    : SIDEBAR_COMPACT_WIDTH;
}
/** Past this the page, not the sidebar, is the one being starved. */
const SIDEBAR_MAX_WIDTH = 480;
/** The sidebar never takes more than this share of the window. */
const SIDEBAR_MAX_VIEWPORT_SHARE = 0.4;
/** The widths a click on the resize handle steps through, then back to the minimum. */
export const SIDEBAR_PRESET_WIDTHS = [
  SIDEBAR_COMPACT_WIDTH,
  SIDEBAR_WIDE_WIDTH,
  288,
  360,
  SIDEBAR_MAX_WIDTH,
] as const;

/** The widths a drag or key press may settle on in a window this wide. */
export function sidebarWidthBounds(viewportWidth: number): { min: number; max: number } {
  const share = Math.floor(viewportWidth * SIDEBAR_MAX_VIEWPORT_SHARE);
  return {
    min: SIDEBAR_MIN_WIDTH,
    max: Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, share)),
  };
}

function clampStored(width: number): number {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(width)));
}

const listeners = new Set<() => void>();
/** The width on screen mid-drag, before it settles. */
let liveWidth: number | null = null;
/** A settled width kept for the session when the browser blocks storage. */
let volatileWidth: number | null = null;

function notify(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Another tab resizing its sidebar is the same store changing underneath us.
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

function readStored(): number | null {
  if (volatileWidth !== null) return volatileWidth;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const stored = Number(raw);
    return Number.isFinite(stored) && stored > 0 ? clampStored(stored) : null;
  } catch {
    // Site data blocked: the sidebar still works, unremembered.
    return null;
  }
}

function getWidth(): number | null {
  return liveWidth ?? readStored();
}

function getServerWidth(): number | null {
  return null;
}

function store(width: number): void {
  const settled = clampStored(width);
  liveWidth = null;
  try {
    // The default is no preference at all, so the tokens stay the one default.
    if (settled === sidebarDefaultWidth()) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, String(settled));
    volatileWidth = null;
  } catch {
    volatileWidth = settled;
  }
  notify();
}

function preview(width: number): void {
  // Back at the settled width (a cancelled drag) there is nothing live to show.
  liveWidth = width === (readStored() ?? sidebarDefaultWidth()) ? null : width;
  notify();
}

/** The reader's sidebar width in px, or `null` for the token's default. */
export function useSidebarWidth(): number | null {
  return useSyncExternalStore(subscribe, getWidth, getServerWidth);
}

/** The width plus the two writes the resize handle makes. */
export function useSidebarWidthControl(): {
  width: number;
  /** Show a width mid-drag without storing it. */
  preview: (width: number) => void;
  /** Keep a settled width (a drag's end, a key press, a reset). */
  commit: (width: number) => void;
} {
  const width = useSidebarWidth() ?? sidebarDefaultWidth();
  return { width, preview, commit: store };
}

/** A collapse kept for the session when the browser blocks storage. */
let volatileCollapsed: boolean | null = null;

function readCollapsed(): boolean {
  if (volatileCollapsed !== null) return volatileCollapsed;
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

/** Collapse the sidebar to its rail, or open it again; the choice persists. */
export function setSidebarCollapsed(collapsed: boolean): void {
  try {
    if (collapsed) window.localStorage.setItem(COLLAPSED_KEY, '1');
    else window.localStorage.removeItem(COLLAPSED_KEY);
    volatileCollapsed = null;
  } catch {
    volatileCollapsed = collapsed;
  }
  notify();
}

/** Whether the reader collapsed the sidebar to its 48px rail (from 900px). */
export function useSidebarCollapsed(): boolean {
  return useSyncExternalStore(subscribe, readCollapsed, () => false);
}
