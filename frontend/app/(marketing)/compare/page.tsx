import type { Metadata } from 'next';

import { CompareIndex } from '@/components/marketing/pages/compare';

const DESCRIPTION =
  'Side-by-side notes on Searchify and other AI visibility tools — what each covers, how ' +
  'scoring works, and where the evidence lives. Maintained by the Searchify team, marked ' +
  'wherever we still need to verify.';

// OG images require an absolute URL; they are added with NEXT_PUBLIC_SITE_URL (lib/seo/site.ts).
export const metadata: Metadata = {
  title: 'How Searchify compares',
  description: DESCRIPTION,
  alternates: { canonical: '/compare' },
  openGraph: {
    title: 'How Searchify compares',
    description: DESCRIPTION,
    type: 'website',
    siteName: 'Searchify',
  },
  twitter: {
    card: 'summary',
    title: 'How Searchify compares',
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
    <main>
      <CompareIndex />
    </main>
  );
}
