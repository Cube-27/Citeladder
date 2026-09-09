import type { ReactNode } from 'react';

import { CookieBanner } from '@/components/marketing/chrome/cookie-banner';
import { MarketingFooter } from '@/components/marketing/chrome/footer';
import { MarketingNav } from '@/components/marketing/chrome/nav';
import { ReturningVisitorHint } from '@/components/marketing/chrome/returning-visitor-hint';
import { MarketingMotion } from '@/components/marketing/primitives/marketing-motion';
import { JsonLd } from '@/components/marketing/seo/json-ld';
import { organizationJsonLd, softwareApplicationJsonLd, websiteJsonLd } from '@/lib/seo/json-ld';

/**
 * Marketing route-group layout — the public Prism Evidence surface.
 *
 * Deliberately NOT wrapped in SessionGuard: these pages must be reachable and
 * server-rendered for anonymous visitors.
 *
 * The paper canvas uses the public editorial type ladder. `MarketingMotion`
 * supplies the tree's explanatory animation features — it is what makes `m`
 * components animate at all, and it defers GSAP off the server bundle. Fonts
 * come from the root layout: Geist supplies every named text role.
 */
export default function MarketingLayout({ children }: Readonly<{ children: ReactNode }>) {
  // Omitted while no canonical origin exists (B3) — Organization without url
  // is not worth emitting.
  const organization = organizationJsonLd();
  const website = websiteJsonLd();
  const softwareApp = softwareApplicationJsonLd();
  return (
    <div data-public-surface className="bg-background text-foreground relative isolate min-h-dvh">
      {organization ? <JsonLd id="organization-json-ld" data={organization} /> : null}
      {website ? <JsonLd id="website-json-ld" data={website} /> : null}
      {softwareApp ? <JsonLd id="software-app-json-ld" data={softwareApp} /> : null}
      {/* Before the nav in document order: it must run before the nav paints. */}
      <ReturningVisitorHint />
      <MarketingMotion>
        <MarketingNav />
        <div className="relative z-1 pt-[var(--marketing-nav-offset)]">{children}</div>
        <div className="relative z-1">
          <MarketingFooter />
        </div>
      </MarketingMotion>
      {/* Outside MarketingMotion: consent is chrome, not revealed content, and
          it must never wait on GSAP to become reachable. */}
      <CookieBanner />
    </div>
  );
}
