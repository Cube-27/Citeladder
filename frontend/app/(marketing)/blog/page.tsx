import type { Metadata } from 'next';

import { BlogIndex } from '@/components/marketing/pages/blog';
import { JsonLd } from '@/components/marketing/seo/json-ld';
import { POSTS } from '@/lib/marketing-content/blog';
import { blogPostFreshness, toBlogPostSummary } from '@/lib/marketing-content/blog-index';
import { blogIndexJsonLd } from '@/lib/seo/json-ld';

const DESCRIPTION =
  'Practical guides, frameworks, and lessons for finding content gaps, strengthening sources, and measuring AI visibility.';

// `metadata` is a module-level export, so this one date has to be resolved at
// module scope. The JSON-LD is built per render instead, so it tracks POSTS.
// Revision dates, not publication dates: revising an older post changes what
// this index holds, and every post here carries a `dateModified` later than
// its `date`, so reading `date` alone reported the index as months staler
// than it is.
const LAST_MODIFIED = POSTS.map(toBlogPostSummary)
  .flatMap((post) => {
    const freshness = blogPostFreshness(post);
    return freshness ? [freshness] : [];
  })
  .reduce<string | null>(
    (latest, date) => (latest === null || date > latest ? date : latest),
    null,
  );

// OG images require an absolute URL; they are added with NEXT_PUBLIC_SITE_URL (lib/seo/site.ts).
export const metadata: Metadata = {
  title: 'AEO & AI visibility resources',
  description: DESCRIPTION,
  keywords: ['AEO', 'answer-engine optimization', 'AI visibility', 'content evidence'],
  alternates: { canonical: '/blog' },
  openGraph: {
    title: 'AEO & AI visibility resources',
    description: DESCRIPTION,
    type: 'website',
    siteName: 'CiteLadder',
  },
  // States when the collection last changed. Without it an answer engine has
  // no way to distinguish a current index from an abandoned one.
  ...(LAST_MODIFIED ? { other: { 'article:modified_time': LAST_MODIFIED } } : {}),
  twitter: {
    card: 'summary',
    title: 'AEO & AI visibility resources',
    description: DESCRIPTION,
  },
};

/**
 * Public marketing blog index (`/blog`). Server-rendered so the full page is
 * in the initial HTML (SEO + first paint); the shared chrome (aurora/grain
 * backdrop, LandingNav, LandingFooter) comes from the (marketing) route-group
 * layout. Content renders from lib/marketing-content/blog (single import
 * site): featured-post slot for the first post, a card grid for the rest, or
 * the empty state when the posts array is empty.
 *
 * Must stay a SYNC component (no async / headers() / cookies()) so the page
 * test can render it directly under Testing Library.
 */
export default function BlogPage() {
  const jsonLd = blogIndexJsonLd(POSTS.map(toBlogPostSummary));
  return (
    <main id="main">
      {jsonLd ? <JsonLd id="blog-index-json-ld" data={jsonLd} /> : null}
      <BlogIndex />
    </main>
  );
}
