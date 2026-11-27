import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';

import { isTextCut, Tooltip } from '@/components/ui/tooltip';
import {
  TEXT_ROLE_CLASS,
  TEXT_TONE_CLASS,
  type TextRole,
  type TextTone,
} from '@/components/ui/text-role';
import { urlCut } from '@/lib/format';
import { cn } from '@/lib/utils';

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

function clampClasses({
  lines,
  phoneWrap,
  grow,
}: Readonly<{ lines: 1 | 2; phoneWrap: boolean; grow: boolean }>) {
  return cn(
    'block min-w-0',
    lines === 1 ? 'truncate' : 'line-clamp-2',
    phoneWrap && 'phone:whitespace-normal phone:break-words',
    grow && 'grow basis-60',
  );
}

export function ClampText({
  children,
  lines = 1,
  tooltip,
  tone,
  text,
  numeric = false,
  className,
  rowTitle = false,
  phoneWrap = false,
  grow = false,
  wrapOnPublic = false,
}: Readonly<{
  children: ReactNode;
  lines?: 1 | 2;
  tooltip?: ReactNode;
  tone?: TextTone;
  text?: TextRole;
  numeric?: boolean;
  className?: string;
  rowTitle?: boolean;
  phoneWrap?: boolean;
  grow?: boolean;
  wrapOnPublic?: boolean;
}>) {
  const ref = useRef<HTMLSpanElement>(null);
  const cut = useCut(ref);
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
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={cut ? 0 : undefined}
        className={cn(
          clampClasses({ lines, phoneWrap, grow }),
          cut && 'rounded-mark',
          text && TEXT_ROLE_CLASS[text],
          numeric && 'tabular-nums',
          tone && TEXT_TONE_CLASS[tone],
          className,
          wrapOnPublic &&
            '[[data-public-surface]_&]:overflow-visible [[data-public-surface]_&]:whitespace-normal [[data-public-surface]_&]:wrap-anywhere',
        )}
      >
        {children}
      </span>
    </Tooltip>
  );
}

export function UrlCutParts({ text }: Readonly<{ text: string }>) {
  const { head, tail } = urlCut(text);
  return (
    <>
      {head ? <span className="min-w-0 truncate">{head}</span> : null}
      <span className={cn('max-w-full min-w-0 truncate', head && 'shrink-0')}>{tail}</span>
    </>
  );
}
