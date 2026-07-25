import type { ReactNode } from 'react';

import { LandingFooter } from '@/components/marketing/landing-footer';
import { LandingNav } from '@/components/marketing/landing-nav';

import './marketing.css';

/**
 * Marketing route-group layout — public surface, deliberately NOT wrapped in
 * SessionGuard (the landing page must be reachable and server-rendered for
 * anonymous visitors). Scopes all marketing styles under the `.mkt` wrapper
 * (see marketing.css).
 *
 * No fonts are loaded here: marketing uses the same Geist / Geist Mono the
 * root layout puts on <html>, so `--font-sans` / `--font-mono` are already in
 * scope and the old Bricolage/Public Sans/Plex trio is gone.
 */
export default function MarketingLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="mkt">
      {/* Shared chrome — every route in the (marketing) group inherits the nav
          and the footer from this layout. The aurora/grain backdrop is gone:
          the flat language has no atmosphere layer. */}
      <LandingNav />
      {children}
      <LandingFooter />
    </div>
  );
}
