import { organizationReference } from '@/lib/seo/site';

/**
 * JSON-LD for a documentation article. Every value comes from the article's
 * own frontmatter and route, so the markup states only what the page shows:
 * the headline is the visible H1 and `dateModified` is the visible updated date.
 */
export function docsArticleJsonLd({
  title,
  description,
  url,
  updated,
  websiteUrl,
}: {
  title: string;
  description: string;
  url: string;
  updated: string;
  websiteUrl: string;
}): Record<string, unknown> {
  // Docs name no person author: the CiteLadder organization writes and publishes them.
  const organization = organizationReference(websiteUrl);
  return {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    '@id': url,
    url,
    headline: title,
    description,
    inLanguage: 'en',
    dateModified: updated,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    author: organization,
    publisher: organization,
  };
}

/** The visible form of an article's updated date, in UTC so the build host's zone cannot shift it. */
export function updatedLabel(updated: string) {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' }).format(
    new Date(`${updated}T00:00:00Z`),
  );
}
