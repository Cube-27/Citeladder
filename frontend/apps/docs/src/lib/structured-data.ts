import { organizationReference } from '@/lib/seo/site';

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

const UPDATED_FORMAT = new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' });

export function updatedLabel(updated: string) {
  return UPDATED_FORMAT.format(new Date(`${updated}T00:00:00Z`));
}
