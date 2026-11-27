import { useLayoutEffect, useRef, useState } from 'react';

export type FilterFit = Readonly<{
  widths: readonly number[];
  available: number;
  gap: number;
  trailing: number;
  menu: number;
  menuAlways: boolean;
}>;

function spanOf(widths: readonly number[], gap: number): number {
  const parts = widths.filter((width) => width > 0);
  return parts.reduce((sum, width) => sum + width, 0) + gap * Math.max(0, parts.length - 1);
}

export function keptFilterCount({
  widths,
  available,
  gap,
  trailing,
  menu,
  menuAlways,
}: FilterFit): number {
  if (available <= 0) return widths.length;
  const span = (count: number, extra: readonly number[]) =>
    spanOf([...widths.slice(0, count), ...extra], gap);
  if (span(widths.length, menuAlways ? [menu, trailing] : [trailing]) <= available)
    return widths.length;
  for (let count = widths.length - 1; count > 0; count -= 1)
    if (span(count, [menu, trailing]) <= available) return count;
  return 0;
}

const CHIP_GAP = 8;
const MENU_FALLBACK = 96;

export function useKeptFilters(ids: readonly string[], menuAlways: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const widths = useRef(new Map<string, number>());
  const menu = useRef(MENU_FALLBACK);
  const [kept, setKept] = useState(ids.length);
  const key = ids.join('\n');
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const order = key ? key.split('\n') : [];
    const measure = () => {
      for (const slot of node.querySelectorAll<HTMLElement>('[data-filter-slot]'))
        widths.current.set(slot.dataset.filterSlot ?? '', slot.offsetWidth);
      const trigger = node.querySelector<HTMLElement>('[data-filter-menu]');
      if (trigger?.offsetWidth) menu.current = trigger.offsetWidth;
      setKept(
        keptFilterCount({
          widths: order.map((id) => widths.current.get(id) ?? 0),
          available: node.clientWidth,
          gap: CHIP_GAP,
          trailing: spanOf(
            [...node.querySelectorAll<HTMLElement>('[data-filter-trailing]')].map(
              (trail) => trail.offsetWidth,
            ),
            CHIP_GAP,
          ),
          menu: menu.current,
          menuAlways,
        }),
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [key, menuAlways, kept]);
  return { ref, kept: Math.min(kept, ids.length) };
}
