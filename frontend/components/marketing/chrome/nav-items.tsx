import { ArrowUpRight } from 'lucide-react';
import { createContext, useContext } from 'react';

import type { NavDropItem } from '@/lib/marketing-content/nav';
import { cn } from '@/lib/utils';

import { NavIcon, hasNavIcon } from './nav-icons';

const ROW =
  'nav-row group flex items-start gap-3 rounded-[var(--radius-marketing-control)] px-3 py-2.5 ' +
  'transition-colors duration-150 hover:bg-background-alt focus-visible:bg-background-alt';

export const NavigationPath = createContext('');

function RowBody({ item, compact }: Readonly<{ item: NavDropItem; compact: boolean }>) {
  return (
    <>
      {hasNavIcon(item.href) && (
        <span className="nav-row-icon" aria-hidden>
          <NavIcon href={item.href} className="size-4" />
        </span>
      )}
      <span className="min-w-0">
        <span className="nav-row-title">{item.title}</span>
        {!compact && <span className="nav-row-desc">{item.desc}</span>}
      </span>
    </>
  );
}

/**
 * One navigation row, shared by the desktop panels and the mobile sheet.
 *
 * Neither surface uses the ARIA menu pattern: the panels hold ordinary links,
 * and `menuitem` roles would promise arrow-key navigation this nav does not
 * implement while hiding the link role a screen reader should announce.
 * External rows open in a new tab and say so with a visible glyph.
 */
export function NavItemLink({
  item,
  onSelect,
  compact = false,
}: Readonly<{ item: NavDropItem; onSelect: () => void; compact?: boolean }>) {
  const path = useContext(NavigationPath);
  if ('external' in item && item.external) {
    return (
      <a
        className={cn(ROW, 'justify-between')}
        href={item.href}
        target="_blank"
        rel="noreferrer"
        onClick={onSelect}
      >
        <span className="flex items-start gap-3">
          <RowBody item={item} compact={compact} />
        </span>
        <ArrowUpRight className="text-muted mt-0.5 size-3.5 shrink-0" aria-hidden />
      </a>
    );
  }

  return (
    <a
      className={ROW}
      href={item.href}
      aria-current={path === item.href ? 'page' : undefined}
      onClick={onSelect}
    >
      <RowBody item={item} compact={compact} />
    </a>
  );
}
