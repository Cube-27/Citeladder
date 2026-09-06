import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';

import type { NavDropItem } from '@/lib/marketing-content/nav';
import { cn } from '@/lib/utils';

const ROW =
  'group flex items-start gap-3 rounded-[var(--radius-control)] px-3.5 py-3 transition-colors duration-150 ' +
  'hover:bg-background-alt focus-visible:bg-background-alt active:bg-background-alt';

function RowBody({ item }: Readonly<{ item: NavDropItem }>) {
  return (
    <>
      {'num' in item && (
        <span className="text-accent-text pt-2 font-mono text-xs tabular-nums">{item.num}</span>
      )}
      <span className="min-w-0">
        {/* The name stays ink on hover — the row's fill carries the hover, the
            way the reference header does; accent text here would read as a
            state change. */}
        <span className="font-display text-foreground block text-base font-medium tracking-[-0.02em]">
          {item.title}
        </span>
        {/* One line, always: a menu row that wraps turns the panel into a
            wall of paragraphs and doubles its height. */}
        <span className="text-muted mt-1 block truncate text-sm">{item.desc}</span>
      </span>
    </>
  );
}

/**
 * One navigation row, shared by the desktop dropdown and the mobile accordion.
 *
 * Neither surface uses the ARIA menu pattern. The desktop panel dropped
 * `role="menu"` because it holds ordinary links rather than `menuitem`
 * children, and that pattern would promise arrow-key navigation this nav does
 * not implement — so a `menuitem` role on the rows would be both invalid
 * (there is no `menu` ancestor) and actively harmful, since it overrides the
 * link role a screen reader should announce.
 *
 * External rows open in a new tab and say so with a visible glyph rather than
 * relying on the target alone.
 */
export function NavItemLink({
  item,
  onSelect,
}: Readonly<{ item: NavDropItem; onSelect: () => void }>) {
  if ('external' in item && item.external) {
    return (
      <a
        className={cn(ROW, 'justify-between')}
        href={item.href}
        target="_blank"
        rel="noreferrer"
        onClick={onSelect}
      >
        <RowBody item={item} />
        <ArrowUpRight className="text-muted mt-1.5 size-4 shrink-0" aria-hidden />
      </a>
    );
  }

  return (
    <Link className={ROW} href={item.href} onClick={onSelect}>
      <RowBody item={item} />
    </Link>
  );
}
