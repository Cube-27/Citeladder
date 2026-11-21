import { CONTACT_EMAIL } from '@/lib/config/contact';
import type { BlogPost } from '@/lib/marketing-content/blog';
import { blogPostFreshness, type BlogPostSummary } from '@/lib/marketing-content/blog-index';
import type { FaqItem } from '@/lib/marketing-content/faq';
import { PARENT_COMPANY } from '@/lib/marketing-content/legal';
import { FOUNDER, PRODUCT_HEAD, type PublicPerson } from '@/lib/marketing-content/people';
import { CITELADDER_LINKEDIN, CITELADDER_X } from '@/lib/marketing-content/social';
import {
  absoluteUrl,
  DEFAULT_SOCIAL_IMAGE,
  organizationReference,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TAGLINE,
} from '@/lib/seo/site';

export type JsonLdObject = Record<string, unknown>;

export function organizationJsonLd(): JsonLdObject | null {
  const url = absoluteUrl('/');
  if (!url) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': new URL('#organization', url).toString(),
    name: SITE_NAME,
    description: SITE_TAGLINE,
    url,
    logo: absoluteUrl('/citeladder-logo.svg'),
    email: CONTACT_EMAIL,
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      email: CONTACT_EMAIL,
      url: absoluteUrl('/contact'),
      availableLanguage: 'English',
    },
    sameAs: [CITELADDER_LINKEDIN, CITELADDER_X],
    parentOrganization: {
      '@type': 'Organization',
      name: PARENT_COMPANY.legalName,
      url: PARENT_COMPANY.href,
      address: {
        '@type': 'PostalAddress',
        streetAddress: 'Plot No. 12, Mulberry Gardens 1, Magarpatta City',
        addressLocality: 'Hadapsar, Pune',
        addressRegion: 'Maharashtra',
        postalCode: '411013',
        addressCountry: 'IN',
      },
    },
    employee: [PRODUCT_HEAD, FOUNDER].map((person) => ({
      '@type': 'Person',
      name: person.name,
      jobTitle: person.role,
      sameAs: [person.linkedin],
    })),
  };
}

export function websiteJsonLd(): JsonLdObject | null {
  const url = absoluteUrl('/');
  if (!url) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    description: SITE_TAGLINE,
    url,
    publisher: organizationReference(url),
  };
}

export function softwareApplicationJsonLd(): JsonLdObject | null {
  const url = absoluteUrl('/');
  if (!url) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    '@id': new URL('#software', url).toString(),
    name: SITE_NAME,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'All',
    browserRequirements: 'Requires JavaScript.',
    url,
    description: SITE_DESCRIPTION,
    publisher: organizationReference(url),
  };
}

export function platformWebPageJsonLd(page: {
  path: string;
  title: string;
  description: string;
}): JsonLdObject | null {
  const url = absoluteUrl(page.path);
  const home = absoluteUrl('/');
  if (!url || !home) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': url,
    url,
    name: page.title,
    description: page.description,
    about: { '@id': new URL('#software', home).toString() },
    publisher: { '@id': new URL('#organization', home).toString() },
  };
}

export function faqPageJsonLd(items: readonly FaqItem[]): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a },
    })),
  };
}

export function blogPostingJsonLd(post: BlogPost): JsonLdObject {
  const url = absoluteUrl(`/blog/${post.slug}`);
  const organizationUrl = absoluteUrl('/');
  const image = post.image ? absoluteUrl(post.image) : null;
  const blogUrl = absoluteUrl('/blog');
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.seoDescription,
    inLanguage: 'en',
    ...(image ? { image } : {}),
    ...(blogUrl
      ? { isPartOf: { '@type': 'Blog', '@id': blogUrl, url: blogUrl, name: 'CiteLadder Blog' } }
      : {}),
    ...(url ? { url, mainEntityOfPage: { '@type': 'WebPage', '@id': url } } : {}),
    ...(organizationUrl ? { publisher: organizationReference(organizationUrl) } : {}),
    ...(post.date
      ? { datePublished: post.date, dateModified: post.dateModified ?? post.date }
      : {}),
    ...(post.author
      ? {
          author: {
            '@type': 'Person',
            name: post.author,
            ...(post.authorRole ? { jobTitle: post.authorRole } : {}),
            ...(post.authorUrl ? { url: post.authorUrl } : {}),
          },
        }
      : {}),
  };
}

export function researchArticleJsonLd(
  guide: {
    title: string;
    slug: string;
    meta_description: string;
    reviewed_at?: string;
    published_at?: string;
    image?: string;
  },
  author?: PublicPerson,
): JsonLdObject | null {
  const url = absoluteUrl(guide.slug);
  const home = absoluteUrl('/');
  if (!url || !home) return null;
  const image = absoluteUrl(guide.image ?? DEFAULT_SOCIAL_IMAGE.path);
  const organization = organizationReference(home);
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: guide.title,
    description: guide.meta_description,
    inLanguage: 'en',
    url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    ...(image ? { image } : {}),
    author: author
      ? { '@type': 'Person', name: author.name, jobTitle: author.role, url: author.linkedin }
      : organization,
    publisher: organization,
    ...(guide.published_at ? { datePublished: guide.published_at } : {}),
    ...(guide.reviewed_at ? { dateModified: guide.reviewed_at } : {}),
  };
}

export function blogIndexJsonLd({
  posts,
  guides,
}: {
  posts: readonly BlogPostSummary[];
  guides: readonly { title: string; path: string }[];
}): JsonLdObject | null {
  const url = absoluteUrl('/blog');
  if (!url) return null;
  const dates = posts.flatMap((post) => {
    const freshness = blogPostFreshness(post);
    return freshness ? [freshness] : [];
  });
  const modified = dates.reduce<string | null>(
    (latest, date) => (latest && latest > date ? latest : date),
    null,
  );
  return {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    '@id': url,
    url,
    name: `${SITE_NAME} Blog`,
    description: SITE_DESCRIPTION,
    inLanguage: 'en',
    ...(modified ? { dateModified: modified } : {}),
    publisher: { '@type': 'Organization', name: SITE_NAME, url: absoluteUrl('/') ?? url },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: posts.length + guides.length,
      itemListElement: [
        ...posts.map((post) => ({ path: `/blog/${post.slug}`, title: post.title })),
        ...guides,
      ].flatMap((item, index) => {
        const itemUrl = absoluteUrl(item.path);
        if (!itemUrl) return [];
        return [{ '@type': 'ListItem', position: index + 1, url: itemUrl, name: item.title }];
      }),
    },
  };
}

export function compareIndexJsonLd(
  competitors: readonly { slug: string; name: string }[],
): JsonLdObject | null {
  const url = absoluteUrl('/compare');
  if (!url) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': url,
    url,
    name: `${SITE_NAME} comparisons`,
    inLanguage: 'en',
    publisher: { '@type': 'Organization', name: SITE_NAME, url: absoluteUrl('/') ?? url },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: competitors.length,
      itemListElement: competitors.flatMap((competitor, index) => {
        const competitorUrl = absoluteUrl(`/compare/${competitor.slug}`);
        if (!competitorUrl) return [];
        return [
          {
            '@type': 'ListItem',
            position: index + 1,
            url: competitorUrl,
            name: `${SITE_NAME} vs ${competitor.name}`,
          },
        ];
      }),
    },
  };
}

export function breadcrumbJsonLd(
  crumbs: readonly { name: string; path: string }[],
): JsonLdObject | null {
  const items = crumbs.flatMap((crumb, index) => {
    const url = absoluteUrl(crumb.path);
    return url ? [{ '@type': 'ListItem', position: index + 1, name: crumb.name, item: url }] : [];
  });
  if (items.length !== crumbs.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items,
  };
}

export function serializeJsonLd(data: JsonLdObject): string {
  return JSON.stringify(data).replaceAll('<', String.raw`\u003c`);
}
