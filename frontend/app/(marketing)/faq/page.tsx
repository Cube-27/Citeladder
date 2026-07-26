import type { Metadata } from 'next';

import { FaqGroups } from '@/components/marketing/pages/faq';
import { PageHero } from '@/components/marketing/primitives/page-hero';

const DESCRIPTION =
  'The short version of how Searchify works — engines, scoring, keys, site health, ' +
  'billing, and self-hosting.';

// NOTE: no openGraph.images / metadataBase yet — there is no canonical public
// domain for the app, and OG image URLs must be absolute. Add both once the
// production domain exists.
export const metadata: Metadata = {
  title: 'FAQ — Searchify',
  description: DESCRIPTION,
  openGraph: {
    title: 'FAQ — Searchify',
    description: DESCRIPTION,
    type: 'website',
    siteName: 'Searchify',
  },
  twitter: {
    card: 'summary',
    title: 'FAQ — Searchify',
    description: DESCRIPTION,
  },
};

/**
 * Public FAQ page (`/faq`). Server-rendered; the accordion is native
 * <details>/<summary>, so the page ships zero client islands.
 *
 * Must stay a SYNC component (no async / headers() / cookies()) so the page
 * test can render it directly under Testing Library.
 */
export default function FaqPage() {
  return (
    <main>
      <PageHero
        eyebrow="FAQ"
        title="Frequently asked"
        accent="questions."
        lead="The short version of how Searchify works — engines, scoring, keys, site health, billing, and self-hosting."
      />
      <FaqGroups />
    </main>
  );
}
