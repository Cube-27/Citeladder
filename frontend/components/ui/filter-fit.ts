import { useLayoutEffect, useRef, useState } from 'react';

export type FilterFit = Readonly<{
  widths: readonly number[];
  values: readonly number[];
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
  values,
  available,
  gap,
  trailing,
  menu,
  menuAlways,
}: FilterFit): number {
  if (available <= 0) return widths.length;
  const span = (count: number) =>
    spanOf(
      [
        ...widths.slice(0, count),
        count < widths.length || menuAlways ? menu : 0,
        ...values.slice(count),
        trailing,
      ],
      gap,
    );
  for (let count = widths.length; count > 0; count -= 1) if (span(count) <= available) return count;
  return 0;
}

const CHIP_GAP = 8;
const MENU_FALLBACK = 96;

function widthsOf(node: HTMLElement, selector: string): number[] {
  return [...node.querySelectorAll<HTMLElement>(selector)].map((item) => item.offsetWidth);
}

export function useKeptFilters(
  filters: readonly Readonly<{ id: string; isDefault: boolean }>[],
  menuAlways: boolean,
) {
  const ref = useRef<HTMLDivElement>(null);
  const widths = useRef(new Map<string, number>());
  const values = useRef(new Map<string, number>());
  const menu = useRef(MENU_FALLBACK);
  const measure = useRef(() => {});
  const [kept, setKept] = useState(filters.length);
  useLayoutEffect(() => {
    measure.current = () => {
      const node = ref.current;
      if (!node) return;
      for (const slot of node.querySelectorAll<HTMLElement>('[data-filter-slot]'))
        widths.current.set(slot.dataset.filterSlot ?? '', slot.offsetWidth);
      for (const chip of node.querySelectorAll<HTMLElement>('[data-filter-value]'))
        values.current.set(chip.dataset.filterValue ?? '', chip.offsetWidth);
      const trigger = node.querySelector<HTMLElement>('[data-filter-menu]');
      if (trigger?.offsetWidth) menu.current = trigger.offsetWidth;
      setKept(
        keptFilterCount({
          widths: filters.map((filter) => widths.current.get(filter.id) ?? 0),
          values: filters.map((filter) =>
            filter.isDefault ? 0 : (values.current.get(filter.id) ?? 0),
          ),
          available: node.clientWidth,
          gap: CHIP_GAP,
          trailing: spanOf(widthsOf(node, '[data-filter-trailing]'), CHIP_GAP),
          menu: menu.current,
          menuAlways,
        }),
      );
    };
    measure.current();
  });
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver(() => measure.current());
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return { ref, kept: Math.min(kept, filters.length) };
}
