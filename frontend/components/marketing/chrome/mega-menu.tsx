import { NavigationMenuLink as Link } from '@/components/ui/navigation-menu';
import { ArrowUpRight } from '@/lib/icons';
import type { NavDrop } from '@/lib/marketing-content/nav';
import { cn } from '@/lib/utils';

import { NavIcon, hasNavIcon } from './nav-icons';
import './mega-menu.css';

export function MegaMenu({ drop, path }: Readonly<{ drop: NavDrop; path: string }>) {
  const headId = (index: number) => `desktop-nav-${drop.key}-section-${index}`;
  return (
    <div className="cl-mega">
      <div className="cl-mega-groups" data-tile-cols={drop.groups.length}>
        {drop.groups.map((group, index) => (
          <div key={group.label ?? drop.key} className="cl-mega-group">
            {group.label && (
              <p id={headId(index)} className="cl-kicker cl-eyebrow cl-mega-head">
                {group.label}
              </p>
            )}
            <ul className="cl-mega-list" aria-labelledby={group.label ? headId(index) : undefined}>
              {group.items.map((item) => {
                const external = 'external' in item && item.external === true;
                const icon = hasNavIcon(item.href);
                return (
                  <li key={item.href}>
                    <Link asChild active={path === item.href}>
                      <a
                        className={cn('cl-mega-item focus-ring', !icon && 'cl-mega-item--text')}
                        href={item.href}
                        target={external ? '_blank' : undefined}
                        rel={external ? 'noopener' : undefined}
                      >
                        {icon && (
                          <span className="cl-mega-icon" aria-hidden="true">
                            <NavIcon href={item.href} className="size-5" />
                          </span>
                        )}
                        <span className="cl-mega-copy">
                          <span className="cl-mega-title">
                            {item.title}
                            {external && (
                              <ArrowUpRight aria-hidden className="cl-mega-ext size-3.5" />
                            )}
                            {external && <span className="sr-only">(opens in a new tab)</span>}
                          </span>
                          <span className="cl-mega-desc">{item.desc}</span>
                        </span>
                      </a>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
