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
        'group relative flex h-[var(--nav-item-height)] items-center gap-2 rounded-[var(--radius-control)] px-3 transition-colors duration-[var(--motion-fast)]',
        // Navigation takes the control role. The active row is raised paper
        // with a soft drop and the brand icon — never an outline or a leading
        // bar, which read as a second, competing selection mark.
        active
          ? textRole('control', 'bg-selected border border-border text-foreground')
          : textRole('control', 'text-secondary hover:bg-active hover:text-foreground'),
      )}
    >
      <Icon
        className={cn(
          'size-4 shrink-0 transition-colors duration-[var(--motion-fast)]',
          active ? 'text-brand-forest' : 'text-muted group-hover:text-foreground',
        )}
        aria-hidden
      />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.count === undefined ? null : (
        <span className={textRole('caption', 'tabular-nums')}>{item.count}</span>
      )}
    </Link>
  );
}
