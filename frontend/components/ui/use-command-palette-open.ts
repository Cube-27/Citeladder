import { useCallback, useEffect, useRef, useState } from 'react';

import { OPEN_COMMAND_PALETTE_EVENT } from '@/lib/navigation/shell-events';

export type CommandPaletteLaunch = { trigger: HTMLElement };

/**
 * The palette's open state, query and cursor, opened by the shell event or
 * ⌘K / Ctrl+K, with focus returned to the caller when it closes.
 */
export function useCommandPaletteOpen() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  // Where focus goes when the palette closes. Radix restores focus to its own
  // Trigger, but the ⌘K path has no trigger, so without this the caller loses
  // their place in the page and focus falls back to <body>.
  const returnFocusTo = useRef<HTMLElement | null>(null);

  const restoreFocus = useCallback(() => {
    const target = returnFocusTo.current;
    returnFocusTo.current = null;
    // The element may have unmounted while the palette was open — switching
    // project re-renders the shell — so check it is still in the document.
    if (target?.isConnected) target.focus();
  }, []);

  // Opening resets the palette. Done in the handler, not an effect — the reset
  // is caused by the interaction, not by state outside React.
  const setOpenState = useCallback((next: boolean) => {
    setOpen(next);
    if (next) {
      setQuery('');
      setActive(0);
    }
  }, []);

  const openFromTrigger = useCallback(
    (trigger: HTMLElement) => {
      returnFocusTo.current = trigger;
      setOpenState(true);
    },
    [setOpenState],
  );

  useEffect(() => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<CommandPaletteLaunch>).detail;
      if (detail?.trigger) openFromTrigger(detail.trigger);
    };
    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, listener);
    return () => window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, listener);
  }, [openFromTrigger]);

  // ⌘K / Ctrl+K toggles from anywhere. Bound on keydown so it beats the
  // browser's own find-in-page on the platforms that map ⌘K.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // Modifier first, then `key`. This handler runs on EVERY keystroke in the
      // app, so the cheap test should gate the string work — and `event.key` is
      // optional on a programmatically constructed KeyboardEvent (browser
      // extensions and IMEs dispatch these), where reading `.toLowerCase()` off
      // it threw "Cannot read properties of undefined".
      if (!(event.metaKey || event.ctrlKey) || event.key?.toLowerCase() !== 'k') return;
      event.preventDefault();
      if (open) {
        setOpen(false);
        return;
      }

      // Capture the caller's position before the dialog steals focus.
      const activeEl = document.activeElement;
      returnFocusTo.current = activeEl instanceof HTMLElement ? activeEl : null;
      setQuery('');
      setActive(0);
      setOpen(true);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return { open, setOpen, query, setQuery, active, setActive, restoreFocus, setOpenState };
}
