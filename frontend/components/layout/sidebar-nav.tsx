'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

import { NAV_GROUPS, type NavItem } from './nav-items';
import { eyebrowClasses } from '@/components/ui/eyebrow';

/**
 * SidebarNav (F5) — grouped sidebar navigation (docs/design.md §9.2).
 *
 * Group labels are quiet sentence-case micro-labels. All items are live
 * `<Link>`s; the active state is a panel pill behind a hairline border rather
 * than an accent tint, so the accent stays reserved for data. Highlighting
 * matches the current route or any nested route (e.g. `/runs/[id]` highlights
 * Runs).
 */
function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({ item, active }: Readonly<{ item: NavItem; active: boolean }>) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center gap-2 rounded-md border px-2 py-1.5 text-base transition-colors',
        active
          ? 'border-border bg-panel text-foreground font-medium'
          : 'text-secondary hover:text-foreground hover:bg-background-alt border-transparent',
      )}
    >
      <Icon className="size-[15px] shrink-0" aria-hidden strokeWidth={1.75} />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.count !== undefined ? (
        <span className="bg-background-alt text-muted text-2xs mono rounded-sm px-1.5 py-0.5">
          {item.count}
        </span>
      ) : null}
    </Link>
  );
}

export function SidebarNav({ className }: Readonly<{ className?: string }>) {
  const pathname = usePathname() ?? '';

  return (
    <nav aria-label="Primary" className={cn('flex flex-col gap-4', className)}>
      {NAV_GROUPS.map((group) => (
        <div key={group.title} className="flex flex-col gap-0.5">
          <p className={cn(eyebrowClasses, 'mb-1 px-2')}>{group.title}</p>
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => (
              <li key={item.href}>
                <NavLink item={item} active={isActive(pathname, item.href)} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
