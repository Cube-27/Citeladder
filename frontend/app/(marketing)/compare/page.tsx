import type { Metadata } from 'next';

import { CompareIndex } from '@/components/marketing/pages/compare';

const DESCRIPTION =
  'Side-by-side notes on CiteLadder versus Profound, Otterly AI, Scrunch AI, and Peec AI. Scoring, evidence, and keys. Last reviewed 3 Sep 2026.';

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
};

/**
 * Public comparison index (`/compare`). Must stay a SYNC server component
 * (no async / headers() / cookies()) so the page test can render it directly
 * under Testing Library. The shared chrome (aurora/grain backdrop, LandingNav,
 * LandingFooter) lives in the (marketing) route-group layout.
 */
export default function ComparePage() {
  return (
    <main id="main">
      <CompareIndex />
    </main>
  );
}
