import type { Metadata } from 'next';

import {
  SolutionSegments,
  SolutionsCta,
  SolutionsHero,
} from '@/components/marketing/pages/solutions';

const DESCRIPTION =
  'How agencies, in-house marketers, founders, ecommerce, and PR teams use AI visibility evidence they can re-check, not screenshots.';

const TITLE = 'AI visibility for agencies, in-house teams, and ecommerce';

// OG images require an absolute URL; they are added with NEXT_PUBLIC_SITE_URL (lib/seo/site.ts).
export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/solutions' },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: 'website',
    siteName: 'CiteLadder',
  },
  twitter: {
    card: 'summary',
    title: TITLE,
    description: DESCRIPTION,
  },
};

/**
 * Public solutions page (`/solutions`). Server-rendered with no client islands
 * of its own — the shared chrome lives in the (marketing) route-group layout.
 *
 * Must stay a SYNC component (no async / headers() / cookies()) so the page
 * test can render it directly under Testing Library.
 */
export default function SolutionsPage() {
  return (
    <main id="main">
      <SolutionsHero />
      <SolutionSegments />
      <SolutionsCta />
    </main>
  );
}
