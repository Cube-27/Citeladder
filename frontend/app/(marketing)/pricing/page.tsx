import type { Metadata } from 'next';

import { PricingCta, PricingTable, PricingTiers } from '@/components/marketing/pages/pricing';
import { PageHero } from '@/components/marketing/primitives/page-hero';
import { TrustStrip } from '@/components/marketing/primitives/trust-strip';

const DESCRIPTION =
  'Pricing for Searchify, the AI visibility and site intelligence platform: ' +
  'free sample crawl, Starter monitoring with quota-controlled URLs, Pro for benchmarking ' +
  'teams, Enterprise — every plan runs on your own ChatGPT, Gemini, and Claude keys.';

// NOTE: no openGraph.images / metadataBase yet — there is no canonical public
// domain for the app, and OG image URLs must be absolute. Add both once the
// production domain exists.
export const metadata: Metadata = {
  title: 'Searchify Pricing — BYOK AI visibility audits, site health & AEO monitoring',
  description: DESCRIPTION,
  openGraph: {
    title: 'Searchify Pricing — BYOK AI visibility audits, site health & AEO monitoring',
    description: DESCRIPTION,
    type: 'website',
    siteName: 'Searchify',
  },
  twitter: {
    card: 'summary',
    title: 'Searchify Pricing — BYOK AI visibility audits, site health & AEO monitoring',
    description: DESCRIPTION,
  },
};

/**
 * Public pricing page (`/pricing`). Server-rendered, with no client islands of
 * its own — the shared chrome lives in the (marketing) route-group layout.
 *
 * Must stay a SYNC component (no async / headers() / cookies()) so the page
 * test can render it directly under Testing Library.
 */
export default function PricingPage() {
  return (
    <main>
      <PageHero
        eyebrow="Pricing"
        title="Pay for the evidence layer."
        accent="Not the API markup."
        lead="Every plan runs audits on your own ChatGPT, Gemini and Claude keys — provider usage bills straight to your accounts at provider rates. Searchify charges for the workspace, the monitoring and the evidence behind every score."
      >
        <TrustStrip className="mt-8" />
      </PageHero>
      <PricingTiers />
      <PricingTable />
      <PricingCta />
    </main>
  );
}
