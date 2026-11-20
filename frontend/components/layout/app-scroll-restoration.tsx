import { useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/**
 * The shell's panel (`#main`) scrolls, not the document, so the router's own
 * restoration cannot reach it. Positions are keyed by history entry, so only
 * Back and Forward restore one; a new path opens at the top (or at its
 * hash), and a write to the same path (a tab, a filter, a project switch)
 * keeps the position.
 */
export function AppScrollRestoration() {
  const { key, pathname, hash } = useLocation();
  const navigationType = useNavigationType();
  const positions = useRef(new Map<string, number>());
  const shownPath = useRef(pathname);

  useLayoutEffect(() => {
    const panel = document.getElementById('main');
    if (!panel) return;
    const pathChanged = shownPath.current !== pathname;
    shownPath.current = pathname;
    const anchor = hash ? document.getElementById(fragmentId(hash)) : null;
    if (navigationType === 'POP') panel.scrollTop = positions.current.get(key) ?? 0;
    else if (anchor) anchor.scrollIntoView();
    else if (pathChanged) panel.scrollTop = 0;
    const save = () => positions.current.set(key, panel.scrollTop);
    panel.addEventListener('scroll', save, { passive: true });
    return () => panel.removeEventListener('scroll', save);
  }, [key, pathname, hash, navigationType]);

  return null;
}

/** The id a fragment names; a malformed one (`#%`) names none. */
function fragmentId(hash: string): string {
  try {
    return decodeURIComponent(hash.slice(1));
  } catch {
    return '';
  }
}
