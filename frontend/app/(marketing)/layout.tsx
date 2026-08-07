import type { ReactNode } from 'react';

import { MarketingAtmosphere } from '@/components/marketing/chrome/marketing-atmosphere';
import { MarketingFooter } from '@/components/marketing/chrome/footer';
import { MarketingNav } from '@/components/marketing/chrome/nav';
import { GsapRevealInitializer } from '@/components/marketing/primitives/gsap-reveal-initializer';
import { JsonLd } from '@/components/marketing/seo/json-ld';
import { organizationJsonLd } from '@/lib/seo/json-ld';

/**
 * Marketing route-group layout — the public "Proof" surface.
 *
 * Deliberately NOT wrapped in SessionGuard: these pages must be reachable and
 * server-rendered for anonymous visitors.
 *
 * The canvas is carried by `bg-background`, with the drifting `MarketingAtmosphere`
 * behind the content and `GsapRevealInitializer` driving scroll entrances. Fonts
 * come from the root layout: Manrope → `--font-display`, Public Sans → `--font-sans`.
 */
export default function MarketingLayout({ children }: Readonly<{ children: ReactNode }>) {
  // Omitted while no canonical origin exists (B3) — Organization without url
  // is not worth emitting.
  const organization = organizationJsonLd();
  return (
    <div className="bg-background text-foreground relative isolate min-h-dvh">
      {organization ? <JsonLd data={organization} /> : null}
      <GsapRevealInitializer />
      <MarketingAtmosphere />
      <MarketingNav />
      <div className="relative z-1 pt-16">{children}</div>
      <div className="relative z-1">
        <MarketingFooter />
      </div>
    </div>
  );
}
