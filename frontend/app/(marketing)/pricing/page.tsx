import type { Metadata } from 'next';

import { PricingCta } from '@/components/marketing/pages/pricing';
import { PricingCatalog } from '@/components/marketing/pricing/pricing-catalog';
import { PageHero } from '@/components/marketing/primitives/page-hero';
import { TrustStrip } from '@/components/marketing/primitives/trust-strip';

// No amount appears in this metadata. Prices are region-resolved by the server
// per visitor, so a number baked into a static description would be wrong for
// most of them and would go stale the moment the catalog changed.
const DESCRIPTION =
  'Self-serve CiteLadder plans plus Enterprise. You pay for the workspace and the evidence. Model usage bills to your own provider keys, never marked up.';

// OG images require an absolute URL; they are added with NEXT_PUBLIC_SITE_URL (lib/seo/site.ts).
export const metadata: Metadata = {
  title: 'CiteLadder pricing for AI visibility',
  description: DESCRIPTION,
  alternates: { canonical: '/pricing' },
  openGraph: {
    title: 'CiteLadder pricing for AI visibility',
    description: DESCRIPTION,
    type: 'website',
    siteName: 'CiteLadder',
  },
  twitter: {
    card: 'summary',
    title: 'CiteLadder pricing for AI visibility',
    description: DESCRIPTION,
  },
};

/**
 * Public pricing page (`/pricing`).
 *
 * Stays a SYNC server component (no async / headers() / cookies()) so the page
 * test can render it directly under Testing Library, and so the hero and
 * closing band arrive as server-rendered HTML. The catalog-backed plans are a
 * client island because every enforceable value is read from
 * `GET /billing/catalog` at request time — the trade is that the cards render
 * a loading shell until hydration rather than arriving pre-filled, which is
 * the cost of never shipping a price this page cannot stand behind.
 */
export default function PricingPage() {
  return (
    <main id="main" className="w-full max-w-full min-w-0 overflow-x-clip">
      <PageHero
        eyebrow="Pricing"
        title="Pay for the intelligence."
        accent="Not the API markup."
        lead="Model calls run on your own provider keys. Usage bills straight to your accounts at provider rates. CiteLadder charges for the workspace, the intelligence, and the evidence behind every recommendation."
        centered
      >
        <TrustStrip className="mt-8 justify-center" />
      </PageHero>
      <PricingCatalog />
      <PricingCta />
    </main>
  );
}
