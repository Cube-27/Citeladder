import { ChevronDown } from 'lucide-react';
import { Fragment, useContext } from 'react';

import {
  NAV_DROPS,
  NAV_LINKS,
  PLATFORM_OVERVIEW,
  type NavDropKey,
} from '@/lib/marketing-content/nav';
import { appHref } from '@/lib/config/app-link';
import { selfServeSignupOpen } from '@/lib/config/self-serve-signup';
import { cn } from '@/lib/utils';

import { ButtonLink } from '../primitives/button';
import { NavItemLink, NavigationPath } from './nav-items';

type MobileNavigationProps = {
  openAcc: NavDropKey | null;
  setOpenAcc: (
    key: NavDropKey | null | ((current: NavDropKey | null) => NavDropKey | null),
  ) => void;
  closeMenu: () => void;
};

/** Mobile accordion navigation stays in initial HTML, hidden until opened. */
export function MobileNavigation({
  openAcc,
  setOpenAcc,
  closeMenu,
}: Readonly<MobileNavigationProps>) {
  const path = useContext(NavigationPath);
  return (
    // A sheet, not a dropdown card: it fills the viewport below the bar and
    // pins the two account actions to its foot.
    <div
      id="mobile-menu"
      className="safe-bottom bg-panel flex max-h-[calc(100dvh-var(--marketing-nav-offset))] min-h-[calc(100dvh-var(--marketing-nav-offset))] flex-col overflow-y-auto overscroll-contain px-[var(--site-gutter)] pt-2 pb-4 lg:hidden"
    >
      <div className="grid">
        {NAV_DROPS.map(({ key, label, groups }) => (
          <div key={key} className="border-border-subtle border-b">
            <button
              type="button"
              className="mobile-nav-trigger"
              aria-expanded={openAcc === key}
              aria-controls={`acc-${key}`}
              onClick={() => setOpenAcc((current) => (current === key ? null : key))}
            >
              {label}
              <ChevronDown
                aria-hidden
                className={cn(
                  'text-muted size-4 transition-transform duration-[var(--motion-normal)]',
                  openAcc === key && 'rotate-180',
                )}
              />
            </button>
            <div id={`acc-${key}`} hidden={openAcc !== key} className="-mx-3 pb-3">
              {key === 'platform' && (
                <NavItemLink item={PLATFORM_OVERVIEW} onSelect={closeMenu} compact />
              )}
              {groups.map((group) => (
                <Fragment key={group.label ?? 'items'}>
                  {group.label && <p className="nav-group-label">{group.label}</p>}
                  {group.items.map((item) => (
                    <NavItemLink key={item.title} item={item} onSelect={closeMenu} compact />
                  ))}
                </Fragment>
              ))}
            </div>
          </div>
        ))}
        {NAV_LINKS.map(({ label, href }) => (
          <a
            key={href}
            href={href}
            aria-current={path === href ? 'page' : undefined}
            className="mobile-nav-trigger border-border-subtle border-b"
            onClick={closeMenu}
          >
            {label}
          </a>
        ))}
      </div>

      <div className="mt-auto grid gap-2 pt-6">
        <ButtonLink
          href={appHref('/login')}
          variant="soft"
          size="marketing"
          className="w-full"
          onClick={closeMenu}
        >
          Log in
        </ButtonLink>
        {selfServeSignupOpen() ? (
          <ButtonLink
            href={appHref('/register')}
            size="marketing"
            className="w-full"
            onClick={closeMenu}
          >
            Sign up
          </ButtonLink>
        ) : null}
      </div>
    </div>
  );
}
