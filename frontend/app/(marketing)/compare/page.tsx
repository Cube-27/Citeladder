import type { Metadata } from 'next';

import { CompareIndex } from '@/components/marketing/pages/compare';
import { JsonLd } from '@/components/marketing/seo/json-ld';
import { COMPETITORS } from '@/lib/marketing-content/compare';
import { compareIndexJsonLd } from '@/lib/seo/json-ld';

const DESCRIPTION =
  'Side-by-side notes on CiteLadder versus Profound, Otterly AI, Scrunch AI, and Peec AI. Scoring, evidence, and keys.';

const LAST_REVIEWED = COMPETITORS.map((competitor) => competitor.lastReviewed).reduce<
  string | null
>((latest, date) => (latest === null || date > latest ? date : latest), null);

// OG images require an absolute URL; they are added with NEXT_PUBLIC_SITE_URL (lib/seo/site.ts).
export const metadata: Metadata = {
  title: 'How CiteLadder compares',
  description: DESCRIPTION,
  alternates: { canonical: '/compare' },
  openGraph: {
    title: 'How CiteLadder compares',
    description: DESCRIPTION,
    type: 'website',
    siteName: 'CiteLadder',
  },
  twitter: {
    card: 'summary',
    title: 'How CiteLadder compares',
    description: DESCRIPTION,
  },
  // Comparisons age faster than anything else on the site, so when they were
  // last checked against the vendors' own pages is part of the claim.
  ...(LAST_REVIEWED ? { other: { 'article:modified_time': LAST_REVIEWED } } : {}),
};

/**
 * Public comparison index (`/compare`). Must stay a SYNC server component
 * (no async / headers() / cookies()) so the page test can render it directly
 * under Testing Library. The shared chrome (aurora/grain backdrop, LandingNav,
 * LandingFooter) lives in the (marketing) route-group layout.
 */
export default function ComparePage() {
  const jsonLd = compareIndexJsonLd(COMPETITORS);
  return (
    <main id="main">
      {jsonLd ? <JsonLd id="compare-index-json-ld" data={jsonLd} /> : null}
      <CompareIndex />
    </main>
  );
}
