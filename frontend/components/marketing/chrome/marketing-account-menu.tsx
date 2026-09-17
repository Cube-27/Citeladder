'use client';

import { LogOut, LayoutDashboard } from 'lucide-react';
import { useState } from 'react';

import {
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownLabel,
  DropdownSeparator,
  DropdownTrigger,
} from '@/components/ui/dropdown';
import { logoutMarketingSession } from '@/lib/api/marketing-session';
import { hardNavigate } from '@/lib/navigation/hard-navigate';
import { emailInitials } from '@/lib/utils';
import { textRole } from '@/components/ui/typography';

import { clearSessionHintCookie } from './returning-visitor-hint';

/**
 * The account menu for a signed-in visitor on the PUBLIC site.
 *
 * A deliberate sibling of `components/layout/user-menu.tsx` rather than a reuse
 * of it: that one reads `useSession()` and `useProjectContext()`, neither of
 * which exists out here, and pulling them in is what would drag the app's
 * providers — and the schema barrel behind them — into the marketing bundle.
 * What is shared is what should be: the dropdown primitives, the initials
 * helper, and the shape of the thing.
 *
 * Signing out matters here because the marketing site is where a signed-in
 * reader most often ends up — every link out of the product lands on it — and
 * until now the only way back out of a session was to find the app again.
 */
/**
 * The circle itself, shared by the live trigger and the placeholder that holds
 * its place while `me` is still in flight.
 *
 * One component rather than two matching class strings because the ONLY thing
 * that must stay true is that both render the identical box: the moment they
 * disagree on size, shape or spacing, the glyph resolving turns back into the
 * layout shift this exists to remove.
 */
function AccountGlyph({ children }: Readonly<{ children?: React.ReactNode }>) {
  return (
    <span
      aria-hidden
      className={textRole(
        'label',
        'bg-accent text-accent-fg flex size-7 shrink-0 items-center justify-center rounded-full text-xs uppercase',
      )}
    >
      {children}
    </span>
  );
}

/**
 * The account circle for a returning visitor whose `me` has not answered yet.
 *
 * The nav knows from the hint cookie that a session exists, but not whose — the
 * cookie deliberately carries no identity — so the initials cannot be known
 * before the round trip. Rendering nothing until they are is what produced the
 * reported flicker: the circle appeared late and shoved "Dashboard" sideways as
 * it arrived. Painting the empty circle at its final size turns that into the
 * two letters fading up inside a box that never moves.
 *
 * Inert on purpose: it has no trigger and no menu, because there is nothing yet
 * to put in one. It is a reserved seat, not a disabled control, so it is hidden
 * from assistive tech rather than announced as an account button that does
 * nothing.
 */
export function MarketingAccountGlyphPlaceholder() {
  return (
    <span className="flex items-center p-1">
      <AccountGlyph />
    </span>
  );
}

export function MarketingAccountMenu({
  email,
  dashboardHref,
}: Readonly<{ email: string; dashboardHref: string }>) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(false);

  async function signOut() {
    if (pending) return;
    setPending(true);
    setFailed(false);
    try {
      await logoutMarketingSession();
    } catch {
      // The cookie is still live, so the reader is still signed in. Say so and
      // leave them where they are rather than navigating to a public page that
      // would imply the session ended.
      setFailed(true);
      setPending(false);
      return;
    }
    // The hint outlives the cookie it describes, so it is dropped by hand —
    // otherwise the next load paints "Dashboard" for a session that is gone.
    clearSessionHintCookie();
    // A full load, not a client transition: the session cookie changed, and
    // every cached answer on this document was read under the old one.
    hardNavigate('/');
  }

  return (
    <Dropdown open={open} onOpenChange={setOpen}>
      <DropdownTrigger
        aria-label={`Account menu for ${email}`}
        className="focus-ring hover:bg-accent-soft flex items-center rounded-[var(--radius-control)] p-1 transition-colors"
      >
        <AccountGlyph>{emailInitials(email)}</AccountGlyph>
      </DropdownTrigger>
      {open ? (
        <DropdownContent align="end" side="bottom" className="w-56">
          <DropdownLabel>{email}</DropdownLabel>
          <DropdownSeparator />
          <DropdownItem asChild>
            <a href={dashboardHref}>
              <LayoutDashboard className="size-4 shrink-0" aria-hidden />
              <span>Dashboard</span>
            </a>
          </DropdownItem>
          <DropdownItem
            onSelect={(event) => {
              event.preventDefault();
              void signOut();
            }}
            disabled={pending}
          >
            <LogOut className="size-4 shrink-0" aria-hidden />
            <span>{pending ? 'Signing out…' : 'Sign out'}</span>
          </DropdownItem>
          {failed ? (
            // A control's failure notice, not editorial copy — hence a span
            // rather than the paragraph the app-side menu uses, which lives
            // outside the website typography rules.
            <span role="alert" className="text-danger block px-2 py-1.5 text-xs">
              Sign out failed. Your session is still active; please try again.
            </span>
          ) : null}
        </DropdownContent>
      ) : null}
    </Dropdown>
  );
}
