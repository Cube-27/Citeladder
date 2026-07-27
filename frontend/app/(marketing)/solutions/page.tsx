import type { Metadata } from 'next';

import {
  SolutionSegments,
  SolutionsCta,
  SolutionsHero,
} from '@/components/marketing/pages/solutions';

const DESCRIPTION =
  'How agencies, in-house marketers, founders, and PR teams use Searchify: multi-project ' +
  'client workspaces with CSV/MD evidence exports, period-over-period trends, free sample ' +
  'crawls on BYOK rates, and citation-ownership evidence for every narrative.';

// OG images require an absolute URL; they are added with NEXT_PUBLIC_SITE_URL (lib/seo/site.ts).
export const metadata: Metadata = {
  title: 'Solutions — for agencies, in-house teams, founders & PR',
  description: DESCRIPTION,
  alternates: { canonical: '/solutions' },
  openGraph: {
    title: 'Solutions — for agencies, in-house teams, founders & PR',
    description: DESCRIPTION,
    type: 'website',
    siteName: 'Searchify',
  },
  twitter: {
    card: 'summary',
    title: 'Solutions — for agencies, in-house teams, founders & PR',
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
    <main>
      <SolutionsHero />
      <SolutionSegments />
      <SolutionsCta />
    </main>
  );
}
