import type { ReactNode } from 'react';

import { MarketingAtmosphere } from '@/components/marketing/chrome/marketing-atmosphere';
import { MarketingFooter } from '@/components/marketing/chrome/footer';
import { MarketingNav } from '@/components/marketing/chrome/nav';
import { JsonLd } from '@/components/marketing/seo/json-ld';
import { organizationJsonLd } from '@/lib/seo/json-ld';

/**
 * Marketing route-group layout — the public "Proof" surface.
 *
 * Deliberately NOT wrapped in SessionGuard: these pages must be reachable and
 * server-rendered for anonymous visitors.
 *
 * The surface is flat (Tesla-derived): a white/Light Ash canvas carried by
 * `bg-background`, no atmospheric field, no decorative background. Fonts come
 * from the root layout (Public Sans → --font-sans / --font-display).
 */
export default function MarketingLayout({ children }: Readonly<{ children: ReactNode }>) {
  // Omitted while no canonical origin exists (B3) — Organization without url
  // is not worth emitting.
  const organization = organizationJsonLd();
  return (
    <div className="bg-background text-foreground relative isolate min-h-dvh">
      {organization ? <JsonLd data={organization} /> : null}
      <MarketingAtmosphere />
      <MarketingNav />
      <div className="relative z-1 pt-16">{children}</div>
      <div className="relative z-1">
        <MarketingFooter />
      </div>
    </div>
  );
}
