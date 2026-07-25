'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

import { NAV_GROUPS, type NavItem } from './nav-items';

/**
 * SidebarNav — grouped sidebar navigation in the v2 Figma shell language
 * (docs/redesign/figma/AppShell.tsx; docs/design.md §9.2).
 *
 * Rows are 36px. The active item is an accent statement — `bg-accent-subtle`
 * fill, `text-accent-text` label, a 3px accent bar on the leading edge, and a
 * full-opacity icon — replacing the flat phase's panel pill behind a hairline.
 * Idle icons sit at 65% so the active row reads first.
 *
 * Highlighting matches the current route or any nested route (e.g. `/runs/[id]`
 * highlights Runs).
 */
function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Group eyebrow — uppercase micro-label at 11px/500 with 0.06em tracking, per
 * the Figma sheet's section labels. Deliberately local rather than the shared
 * `eyebrowClasses`: that recipe is sentence-case and used by ~40 other surfaces,
 * so the app-wide eyebrow decision belongs to the primitives task, not the
 * shell. Not mono — mono stays reserved for values.
 */
const groupLabelClasses = 'text-2xs text-muted font-medium uppercase tracking-wider';

function NavLink({ item, active }: Readonly<{ item: NavItem; active: boolean }>) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative flex h-9 items-center gap-2.5 rounded-md px-2.5 text-base transition-colors',
        active
          ? 'bg-accent-subtle text-accent-text font-medium'
          : 'text-secondary hover:text-foreground hover:bg-background-alt',
      )}
    >
      {active ? (
        <span aria-hidden className="bg-accent absolute inset-y-2 left-0 w-[3px] rounded-e-sm" />
      ) : null}
      <Icon
        className={cn('size-4 shrink-0', active ? 'opacity-100' : 'opacity-65')}
        aria-hidden
        strokeWidth={1.75}
      />
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
          <p className={cn(groupLabelClasses, 'mb-1 px-2.5')}>{group.title}</p>
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
