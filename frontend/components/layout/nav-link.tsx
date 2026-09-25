'use client';

import { Link } from 'react-router-dom';

import { textRole } from '@/components/ui/typography';
import { cn } from '@/lib/utils';

import type { NavItem } from './nav-items';

/** One shell destination row, shared by Dashboard and Agent navigation. */
export function NavLink({
  item,
  active,
  onIntent,
  onNavigate,
}: Readonly<{
  item: NavItem;
  active: boolean;
  onIntent: (href: string) => void;
  onNavigate?: () => void;
}>) {
  const Icon = item.icon;
  return (
    <Link
      to={item.href}
      onMouseEnter={() => {
        if (!active) onIntent(item.href);
      }}
      onFocus={() => {
        if (!active) onIntent(item.href);
      }}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group relative flex h-[var(--nav-item-height)] items-center gap-2.5 rounded-[var(--radius-control)] border px-2.5 text-sm transition-colors duration-150',
        // Navigation is a label, not reading copy, so both states sit at the
        // shared label weight rather than body regular — the destinations stay
        // scannable against the group titles above them. The role owns the
        // weight; 600 stays reserved for headings, and the active row is
        // carried by the paper surface, leading mark, and icon.
        active
          ? textRole(
              'label',
              'app-nav-current border-border bg-panel text-foreground before:bg-brand-forest before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded-full',
            )
          : textRole(
              'label',
              'border-transparent text-secondary hover:bg-active hover:text-foreground',
            ),
      )}
    >
      <Icon
        className={cn(
          'size-4 shrink-0 transition-colors duration-150',
          active ? 'text-foreground' : 'text-subtle group-hover:text-foreground',
        )}
        aria-hidden
      />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.count === undefined ? null : (
        <span className={textRole('meta', 'tabular-nums')}>{item.count}</span>
      )}
    </Link>
  );
}
