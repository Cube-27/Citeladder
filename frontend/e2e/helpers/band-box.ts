import type { Locator } from '@playwright/test';

/** A band's x, y, width and height, or null when it is absent. */
export type Box = readonly number[] | null;

/**
 * A band's box in page coordinates, since a click below the fold scrolls the
 * page first. A band held to the viewport (it or an ancestor is fixed, or
 * sticky and stuck at its inset) keeps viewport coordinates: it stays put on
 * screen while its page y follows the scroll.
 */
export async function bandBox(part: Locator): Promise<Box> {
  const box = await part.boundingBox();
  if (!box) return null;
  const { pinned, scrolled } = await part.evaluate((node) => {
    const viewport = document.documentElement.clientHeight;
    const held = (element: Element) => {
      const style = getComputedStyle(element);
      if (style.position === 'fixed') return true;
      if (style.position !== 'sticky') return false;
      const rect = element.getBoundingClientRect();
      const top = Number.parseFloat(style.top);
      const bottom = Number.parseFloat(style.bottom);
      return (
        (Number.isFinite(top) && Math.abs(rect.top - top) <= 1) ||
        (Number.isFinite(bottom) && Math.abs(viewport - rect.bottom - bottom) <= 1)
      );
    };
    let pinned = false;
    for (let element: Element | null = node; element && !pinned; element = element.parentElement)
      pinned = held(element);
    return { pinned, scrolled: window.scrollY };
  });
  return [box.x, box.y + (pinned ? 0 : scrolled), box.width, box.height];
}
