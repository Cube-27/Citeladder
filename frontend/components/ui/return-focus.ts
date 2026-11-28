import { useInsertionEffect, useRef } from 'react';

export const CONTROL =
  'input:not([type=hidden]), textarea, select, button, a[href], [tabindex]:not([tabindex="-1"])';

function opener(active: Element | null) {
  if (!(active instanceof HTMLElement) || active === document.body) return null;
  if (active === document.documentElement) return null;
  const id = active.closest('[role="menu"]')?.getAttribute('aria-labelledby');
  return (id && document.getElementById(id)) || active;
}

const shown = (node: HTMLElement) => node.checkVisibility?.() ?? true;

const usable = (node: HTMLElement) => shown(node) && !node.matches(':disabled');

function nearestControl(node: HTMLElement) {
  for (let region = node.parentElement; region; region = region.parentElement) {
    const control = [...region.querySelectorAll<HTMLElement>(CONTROL)].find(usable);
    if (control) return control;
  }
  return null;
}

export function returnTargetFor(node: HTMLElement | null) {
  if (!node?.isConnected) return null;
  if (usable(node)) return node;
  if (shown(node)) return nearestControl(node);
  const folder = node.closest<HTMLElement>('[data-folded-by]')?.dataset.foldedBy;
  const more = folder
    ? document.querySelector<HTMLElement>(`[data-folds="${CSS.escape(folder)}"]`)
    : null;
  if (more && usable(more)) return more;
  const controls = [...document.querySelectorAll<HTMLElement>('[aria-controls]')].filter(usable);
  for (let region = node.parentElement; region; region = region.parentElement) {
    const { id } = region;
    const control = controls.find(
      (c) => id && c.getAttribute('aria-controls')?.split(' ').includes(id),
    );
    if (control) return control;
  }
  return null;
}

export function useReturnFocus(open: boolean) {
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);
  useInsertionEffect(() => {
    if (open && !wasOpenRef.current) returnFocusRef.current = opener(document.activeElement);
    wasOpenRef.current = open;
  }, [open]);
  return (event: Event) => {
    const returnTarget = returnTargetFor(returnFocusRef.current);
    returnFocusRef.current = null;
    if (!returnTarget) return;
    event.preventDefault();
    returnTarget.focus();
  };
}
