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

// NOTE: no openGraph.images / metadataBase yet — there is no canonical public
// domain for the app, and OG image URLs must be absolute. Add both once the
// production domain exists.
export const metadata: Metadata = {
  title: 'Searchify Solutions — AI visibility for agencies, in-house teams, founders & PR',
  description: DESCRIPTION,
  openGraph: {
    title: 'Searchify Solutions — AI visibility for agencies, in-house teams, founders & PR',
    description: DESCRIPTION,
    type: 'website',
    siteName: 'Searchify',
  },
  twitter: {
    card: 'summary',
    title: 'Searchify Solutions — AI visibility for agencies, in-house teams, founders & PR',
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
