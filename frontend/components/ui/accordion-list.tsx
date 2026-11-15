import { ChevronDown } from 'lucide-react';
import { useId, type ReactNode, type Ref } from 'react';

import { Icon } from '@/components/ui/icon';
import { Pressable } from '@/components/ui/pressable';
import { textRole } from '@/components/ui/typography';
import { cn } from '@/lib/utils';

/**
 * AccordionList — a labelled list of rows that open in place, with 1px `rule`
 * between rows. The caller owns which row is open (one at a time).
 */
export function AccordionList({
  label,
  children,
}: Readonly<{ label: string; children: ReactNode }>) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="grid gap-2">
      <h3 id={id} className={textRole('label')}>
        {label}
      </h3>
      <ul className="divide-rule grid divide-y">{children}</ul>
    </section>
  );
}

/**
 * One row: a 40-tall button (title 14/20 500 `ink`, a caption summary in
 * `ink-2`, a chevron at the end) with `aria-expanded`; open, its body sits
 * under it on `well` (16 padding, radius 6), each part at most 640 wide and
 * 16 apart. Enter and Space toggle it natively and focus stays on the row.
 */
export function AccordionItem({
  title,
  caption,
  open,
  onToggle,
  itemRef,
  children,
}: Readonly<{
  title: string;
  caption: ReactNode;
  open: boolean;
  onToggle: () => void;
  itemRef?: Ref<HTMLLIElement>;
  /** Rendered only while open. */
  children: ReactNode;
}>) {
  const panelId = useId();
  return (
    <li ref={itemRef} className="grid scroll-mt-4">
      <Pressable
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className="hover:overlay-hover active:overlay-pressed flex min-h-10 min-w-0 items-center gap-3 px-2"
      >
        <span className={textRole('label', 'text-ink shrink-0')}>{title}</span>
        <span className={textRole('caption', 'text-ink-2 min-w-0 flex-1 truncate')}>{caption}</span>
        <Icon
          icon={ChevronDown}
          className={cn('text-ink-2 shrink-0 transition-transform', open && 'rotate-180')}
        />
      </Pressable>
      <div
        id={panelId}
        hidden={!open}
        className="bg-well rounded-control mb-2 grid gap-4 p-4 *:max-w-160"
      >
        {open ? children : null}
      </div>
    </li>
  );
}
