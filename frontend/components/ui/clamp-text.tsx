import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';

import { isTextCut, Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/**
 * One shared observer for every cut text, so a table of hundreds of cells
 * costs one observer, not hundreds.
 */
const cutWatchers = new WeakMap<Element, () => void>();
let cutObserver: ResizeObserver | null = null;

function watchCut(node: Element, onChange: () => void) {
  if (typeof ResizeObserver === 'undefined') return () => undefined;
  cutObserver ??= new ResizeObserver((entries) => {
    for (const entry of entries) cutWatchers.get(entry.target)?.();
  });
  cutWatchers.set(node, onChange);
  cutObserver.observe(node);
  return () => {
    cutWatchers.delete(node);
    cutObserver?.unobserve(node);
  };
}

const INTERACTIVE = 'a[href], button, [role="button"], [role="link"], [role="tab"], label';

/**
 * Whether the text in `ref` is cut, kept current as its box resizes. A cut
 * text becomes a tab stop, so its tooltip is reachable by keyboard; inside
 * or around a link or button the control is the tab stop, never a second one.
 */
export function useCut(
  ref: RefObject<HTMLElement | null>,
  measure: (node: HTMLElement) => boolean = isTextCut,
) {
  const [cut, setCut] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (node.parentElement?.closest(INTERACTIVE) || node.querySelector(INTERACTIVE)) return;
    const update = () => setCut(measure(node));
    update();
    return watchCut(node, update);
  }, [ref, measure]);
  return cut;
}

/**
 * ClampText — a long value (a URL, a title, an id) on one line, cut with an
 * ellipsis. When it is cut, the whole text is in a tooltip that opens on
 * hover and on keyboard focus, and selecting the text copies all of it.
 * Wrapping is for prose and a record's own page, never a row, a fact or a stat.
 *
 * `lines={2}` survives only for a `TableCellLines` title in a three-line row.
 * `tooltip` overrides the tooltip content, e.g. a full URL behind a path.
 * `rowTitle` marks a table row's title: in the identity column it takes two
 * lines on a phone, and its link is the whole cell (globals.css).
 */
export function ClampText({
  children,
  lines = 1,
  tooltip,
  className,
  rowTitle = false,
}: Readonly<{
  children: ReactNode;
  lines?: 1 | 2;
  tooltip?: ReactNode;
  className?: string;
  rowTitle?: boolean;
}>) {
  const ref = useRef<HTMLSpanElement>(null);
  const cut = useCut(ref);
  // The full text as plain text: styled children (a title role, a caption)
  // would carry their own ink onto the tooltip sheet.
  const [fullText, setFullText] = useState('');
  const openWhenCut = (node: HTMLElement) => {
    if (!isTextCut(node)) return false;
    setFullText(node.textContent ?? '');
    return true;
  };
  return (
    <Tooltip content={tooltip ?? fullText} shouldOpen={openWhenCut}>
      <span
        ref={ref}
        data-truncated={cut || undefined}
        data-row-title={rowTitle || undefined}
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a cut value is a tab stop so its full text (the tooltip) is reachable by keyboard.
        tabIndex={cut ? 0 : undefined}
        className={cn(
          'block min-w-0',
          lines === 1 ? 'truncate' : 'line-clamp-2',
          cut && 'rounded-mark',
          className,
        )}
      >
        {children}
      </span>
    </Tooltip>
  );
}
