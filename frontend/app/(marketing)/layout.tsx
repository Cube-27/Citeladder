import type { ReactNode } from 'react';

import { MarketingFooter } from '@/components/marketing/chrome/footer';
import { MarketingNav } from '@/components/marketing/chrome/nav';

/**
 * Marketing route-group layout — the public "Proof" surface.
 *
 * Deliberately NOT wrapped in SessionGuard: these pages must be reachable and
 * server-rendered for anonymous visitors.
 *
 * `.mkt-root` is the one hook the creative system needs (see
 * app/(marketing)/marketing-theme.css): it scopes the light-only canvas, the
 * focus ring, and the reset that lets Tailwind utilities beat the app's
 * unlayered element base. Everything else is built from mkt-namespaced
 * utilities — there is no marketing stylesheet to keep in sync.
 *
 * No fonts are loaded here: the root layout puts Inter, Geist Mono and Manrope
 * on <html>, so --font-mkt-display / --font-mkt-sans are already in scope.
 */
export default function MarketingLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="mkt-root bg-mkt-paper text-mkt-ink min-h-dvh">
      <MarketingNav />
      {/* Clears the fixed nav strip. Every page starts from the same line. */}
      <div className="pt-mkt-nav">{children}</div>
      <MarketingFooter />
    </div>
  );
}
