'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

import { eyebrowClasses } from '@/components/ui/eyebrow';

import { NAV_GROUPS, type NavItem } from './nav-items';

/**
 * SidebarNav — grouped sidebar navigation in the ADS shell language.
 *
 * Rows are 32px (`--nav-item-height`, ADS's default menu-item rung). Idle
 * labels run near-ink at 500. Active rows use the lightest blue selection
 * surface plus a darker blue label and leading rail, keeping the state clear
 * without turning the sidebar into a stack of saturated pills.
 *
 * Group labels use the shared `eyebrowClasses` recipe — 12/16 @600, sentence
 * case, matching ADS's side-nav heading item.
 *
 * Highlighting matches the current route or any nested route (e.g. `/runs/[id]`
 * highlights Runs).
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
        'relative flex h-[var(--nav-item-height)] items-center gap-1.5 rounded-sm px-1.5 text-sm transition-colors',
        active
          ? 'bg-accent-soft text-accent-hover font-medium'
          : 'text-secondary hover:text-foreground hover:bg-background-alt font-medium',
      )}
    >
      {active ? (
        <span aria-hidden className="bg-accent absolute inset-y-1.5 start-0 w-1 rounded-e-sm" />
      ) : null}
      <Icon
        className={cn('size-4 shrink-0', active ? 'opacity-100' : 'opacity-80')}
        aria-hidden
        strokeWidth={2}
      />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.count !== undefined ? (
        <span className="bg-neutral-bg text-secondary text-2xs mono min-w-6 rounded-xs px-1 py-0 text-center">
          {item.count}
        </span>
      ) : null}
    </Link>
  );
}

export function SidebarNav({ className }: Readonly<{ className?: string }>) {
  const pathname = usePathname() ?? '';

  return (
    <nav aria-label="Primary" className={cn('flex flex-col gap-3', className)}>
      {NAV_GROUPS.map((group) => (
        <div key={group.title} className="flex flex-col gap-0">
          <p className={cn(eyebrowClasses, 'px-1 pb-0.5')}>{group.title}</p>
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
