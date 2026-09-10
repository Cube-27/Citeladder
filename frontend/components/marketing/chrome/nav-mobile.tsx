import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { Fragment } from 'react';

import { NAV_DROPS, NAV_LINKS, type NavDropKey } from '@/lib/marketing-content/nav';
import { cn } from '@/lib/utils';

import { DemoButtonLink } from '../primitives/button';
import { NavItemLink } from './nav-items';

type MobileNavigationProps = {
  isAuthenticated: boolean;
  sessionPending: boolean;
  dashboardHref: string;
  openAcc: NavDropKey | null;
  setOpenAcc: (
    key: NavDropKey | null | ((current: NavDropKey | null) => NavDropKey | null),
  ) => void;
  closeMenu: () => void;
};

/** Mobile accordion navigation, rendered only while the menu is open. */
export function MobileNavigation({
  isAuthenticated,
  sessionPending,
  dashboardHref,
  openAcc,
  setOpenAcc,
  closeMenu,
}: Readonly<MobileNavigationProps>) {
  return (
    // A sheet, not a dropdown card: it fills the viewport below the bar, the
    // destinations step up (they are the content), the labels step down, and
    // the account links pin to the bottom.
    <div
      id="mobile-menu"
      className="safe-bottom bg-background flex max-h-[calc(100dvh-4rem)] min-h-[calc(100dvh-4rem)] flex-col overflow-y-auto overscroll-contain px-6 py-3 lg:hidden"
    >
      {NAV_DROPS.map(({ key, label, href, groups }) => (
        <div key={key} className="border-border-subtle border-b last:border-b-0">
          <div className="flex items-center">
            <Link
              href={href}
              className="text-foreground flex-1 py-3.5 text-lg font-medium tracking-[-0.02em]"
              onClick={closeMenu}
            >
              {label}
            </Link>
            <button
              type="button"
              className="text-foreground grid size-10 place-items-center"
              aria-label={`Open ${label} menu`}
              aria-expanded={openAcc === key}
              aria-controls={`acc-${key}`}
              onClick={() => setOpenAcc((current) => (current === key ? null : key))}
            >
              <ChevronDown
                aria-hidden
                className={cn(
                  'size-4 transition-transform duration-300',
                  openAcc === key && 'rotate-180',
                )}
              />
            </button>
          </div>
          <div id={`acc-${key}`} hidden={openAcc !== key} className="pb-2">
            {groups.map((group) => (
              <Fragment key={group.label ?? 'items'}>
                {group.label && (
                  <p className="website-eyebrow text-muted px-4 pt-4 pb-2">{group.label}</p>
                )}
                {group.items.map((item) => (
                  <NavItemLink key={item.title} item={item} onSelect={closeMenu} />
                ))}
              </Fragment>
            ))}
          </div>
        </div>
      ))}

      <div className="border-border-subtle mt-auto grid border-t pt-2">
        {NAV_LINKS.map(({ label, href }) => (
          <Link
            key={href}
            href={href}
            className="text-foreground py-3.5 text-lg font-medium tracking-[-0.02em]"
            onClick={closeMenu}
          >
            {label}
          </Link>
        ))}
        {!isAuthenticated &&
          !sessionPending && (
            // The demo CTA leaves the topbar on phones; the sheet is where it
            // lives, pinned with the account links it accompanies.
            <DemoButtonLink variant="primary" className="w-full" onClick={closeMenu} />
          )}
        {sessionPending ? (
          // Same rule as the header actions: a returning visitor waits rather
          // than being offered "Log in" for the moment before `me` resolves.
          <span
            aria-hidden
            className="bg-background-alt my-3.5 h-5 w-24 animate-pulse rounded-[var(--radius-control)]"
          />
        ) : (
          <Link
            href={isAuthenticated ? dashboardHref : '/login'}
            prefetch={isAuthenticated ? undefined : false}
            className="text-muted py-3.5 text-lg font-medium"
            onClick={closeMenu}
          >
            {isAuthenticated ? 'Dashboard' : 'Log in'}
          </Link>
        )}
      </div>
    </div>
  );
}
