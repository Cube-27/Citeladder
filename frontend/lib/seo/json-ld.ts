import type { BlogPost } from '@/lib/marketing-content/blog';
import { blogPostFreshness, type BlogPostSummary } from '@/lib/marketing-content/blog-index';
import type { FaqGroup } from '@/lib/marketing-content/faq';
import { PARENT_COMPANY } from '@/lib/marketing-content/legal';
import { FOUNDER, PRODUCT_HEAD } from '@/lib/marketing-content/people';
import { absoluteUrl, SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE } from '@/lib/seo/site';

export type JsonLdObject = Record<string, unknown>;

export function organizationJsonLd(): JsonLdObject | null {
  const url = absoluteUrl('/');
  if (!url) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    description: SITE_TAGLINE,
    url,
    email: PARENT_COMPANY.email,
    parentOrganization: {
      '@type': 'Organization',
      name: PARENT_COMPANY.legalName,
      url: PARENT_COMPANY.href,
      sameAs: [PARENT_COMPANY.linkedin],
      address: {
        '@type': 'PostalAddress',
        streetAddress: 'Plot No. 12, Mulberry Gardens 1, Magarpatta City',
        addressLocality: 'Hadapsar, Pune',
        addressRegion: 'Maharashtra',
        postalCode: '411013',
        addressCountry: 'IN',
      },
    },
    // `sameAs` asserts "this URL is another identity OF THIS ENTITY", so a
    // personal profile here would claim CiteLadder and a named individual are
    // the same thing. The people are related to the organization, not
    // identical to it, and `employee` is the property that says so. The one
    // company profile that does identify the parent moves onto the parent.
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
    publisher: { '@type': 'Organization', name: SITE_NAME, url },
  };
}

/**
 * The product itself, as a web application. Deliberately carries no `offers`:
 * a price in structured data is a claim Google surfaces verbatim, and the
 * plans are not fixed here — an omitted offer is accurate, an invented one is
 * not. `aggregateRating` is likewise absent until there are real reviews.
 */
export function softwareApplicationJsonLd(): JsonLdObject | null {
  const url = absoluteUrl('/');
  if (!url) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: SITE_NAME,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'All',
    browserRequirements: 'Requires JavaScript.',
    url,
    description: SITE_DESCRIPTION,
    publisher: { '@type': 'Organization', name: SITE_NAME, url },
  };
}

export function faqPageJsonLd(groups: readonly FaqGroup[]): JsonLdObject {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: groups.flatMap((group) =>
      group.items.map((item) => ({
        '@type': 'Question',
        name: item.q,
        acceptedAnswer: { '@type': 'Answer', text: item.a },
      })),
    ),
  };
}

export function blogPostingJsonLd(post: BlogPost): JsonLdObject {
  const url = absoluteUrl(`/blog/${post.slug}`);
  const organizationUrl = absoluteUrl('/');
  const image = absoluteUrl(post.image);
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
    ...(organizationUrl
      ? { publisher: { '@type': 'Organization', name: SITE_NAME, url: organizationUrl } }
      : {}),
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

/**
 * The blog index as a `Blog`, with its posts as an `ItemList`.
 *
 * `dateModified` is the load-bearing part: a listing page that never states
 * when its collection last changed gives an answer engine no way to tell a
 * current index from a stale one, and CiteLadder's own crawler reports exactly
 * that absence. It is the newest REVISION date across the posts, not the
 * newest publication date -- revising an older post changes what this page
 * indexes, and reading only `date` would leave the signal stale.
 */
export function blogIndexJsonLd(posts: readonly BlogPostSummary[]): JsonLdObject | null {
  const url = absoluteUrl('/blog');
  if (!url) return null;
  const dates = posts.flatMap((post) => {
    const freshness = blogPostFreshness(post);
    return freshness ? [freshness] : [];
  });
  const modified = dates.length > 0 ? dates.reduce((a, b) => (a > b ? a : b)) : null;
  return {
    '@context': 'https://schema.org',
    // Both types, deliberately. `Blog` is the precise type for this page, but
    // CiteLadder's own structured-data reader recognizes `CollectionPage` and
    // NOT `Blog` (see STRUCTURED_DATA_RECOGNIZED_TYPES), so a bare `Blog` block
    // would be skipped and its `dateModified` never read -- reinstating the
    // very freshness gap this emits it to close.
    '@type': ['CollectionPage', 'Blog'],
    '@id': url,
    url,
    name: `${SITE_NAME} Blog`,
    description: SITE_DESCRIPTION,
    inLanguage: 'en',
    ...(modified ? { dateModified: modified } : {}),
    publisher: { '@type': 'Organization', name: SITE_NAME, url: absoluteUrl('/') ?? url },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: posts.length,
      itemListElement: posts.flatMap((post, index) => {
        const postUrl = absoluteUrl(`/blog/${post.slug}`);
        if (!postUrl) return [];
        return [
          {
            '@type': 'ListItem',
            position: index + 1,
            url: postUrl,
            name: post.title,
          },
        ];
      }),
    },
  };
}

/** The comparison index, dated by the newest first-party review it rests on. */
export function compareIndexJsonLd(
  competitors: readonly { slug: string; name: string; lastReviewed: string }[],
): JsonLdObject | null {
  const url = absoluteUrl('/compare');
  if (!url) return null;
  const reviews = competitors.map((competitor) => competitor.lastReviewed).filter(Boolean);
  const modified = reviews.length > 0 ? reviews.reduce((a, b) => (a > b ? a : b)) : null;
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': url,
    url,
    name: `${SITE_NAME} comparisons`,
    inLanguage: 'en',
    ...(modified ? { dateModified: modified } : {}),
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

/**
 * A breadcrumb trail for the two nested routes. Every crumb is derived from the
 * route itself, so unlike `offers` above there is nothing here we cannot
 * substantiate.
 */
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

/** Prevent a JSON value from terminating its containing script element. */
export function serializeJsonLd(data: JsonLdObject): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
