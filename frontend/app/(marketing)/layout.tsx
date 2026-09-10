import type { ReactNode } from 'react';

import { CookieBanner } from '@/components/marketing/chrome/cookie-banner';
import { MarketingFooter } from '@/components/marketing/chrome/footer';
import { MarketingNav } from '@/components/marketing/chrome/nav';
import { ReturningVisitorHint } from '@/components/marketing/chrome/returning-visitor-hint';
import { JsonLd } from '@/components/marketing/seo/json-ld';
import { organizationJsonLd, softwareApplicationJsonLd, websiteJsonLd } from '@/lib/seo/json-ld';

/**
 * Marketing route-group layout — the public Prism Evidence surface.
 *
 * Deliberately NOT wrapped in SessionGuard: these pages must be reachable and
 * server-rendered for anonymous visitors.
 *
 * The paper canvas uses the public editorial type ladder. Fonts come from the
 * root layout: Geist supplies every named text role.
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
      <MarketingNav />
      <div className="relative z-1 pt-[var(--marketing-nav-offset)]">{children}</div>
      <div className="relative z-1">
        <MarketingFooter />
      </div>
      <CookieBanner />
    </div>
  );
}
