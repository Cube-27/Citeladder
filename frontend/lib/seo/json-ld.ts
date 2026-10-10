import { CONTACT_EMAIL } from '@/lib/config/contact';
import type { BlogPost } from '@/lib/marketing-content/blog';
import { blogPostFreshness, type BlogPostSummary } from '@/lib/marketing-content/blog-index';
import type { FaqGroup } from '@/lib/marketing-content/faq';
import { PARENT_COMPANY } from '@/lib/marketing-content/legal';
import { FOUNDER, PRODUCT_HEAD } from '@/lib/marketing-content/people';
import { CITELADDER_LINKEDIN } from '@/lib/marketing-content/social';
import { absoluteUrl, SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE } from '@/lib/seo/site';

export type JsonLdObject = Record<string, unknown>;

export function organizationJsonLd(): JsonLdObject | null {
  const url = absoluteUrl('/');
  if (!url) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    // Google's organization-logo feature requires `logo` alongside `url`, and
    // the `@id` gives every publisher reference below one entity to reconcile.
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
    sameAs: [CITELADDER_LINKEDIN],
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
    // `sameAs` asserts "this URL is another identity OF THIS ENTITY", so a
    // personal profile here would claim CiteLadder and a named individual are
    // the same thing. The people are related to the organization, not
    // identical to it, and `employee` is the property that says so. The
    // CiteLadder company page, by contrast, IS this entity.
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
    publisher: {
      '@type': 'Organization',
      '@id': new URL('#organization', url).toString(),
      name: SITE_NAME,
      url,
    },
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
    '@id': new URL('#software', url).toString(),
    name: SITE_NAME,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'All',
    browserRequirements: 'Requires JavaScript.',
    url,
    description: SITE_DESCRIPTION,
    publisher: {
      '@type': 'Organization',
      '@id': new URL('#organization', url).toString(),
      name: SITE_NAME,
      url,
    },
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
    ...(organizationUrl
      ? {
          publisher: {
            '@type': 'Organization',
            '@id': new URL('#organization', organizationUrl).toString(),
            name: SITE_NAME,
            url: organizationUrl,
          },
        }
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
 * The blog index as a `Blog`, with its posts and then the research guides it
 * also lists as one `ItemList`.
 *
 * `dateModified` is the load-bearing part: a listing page that never states
 * when its collection last changed gives an answer engine no way to tell a
 * current index from a stale one, and CiteLadder's own crawler reports exactly
 * that absence. It is the newest REVISION date across the posts, not the
 * newest publication date -- revising an older post changes what this page
 * indexes, and reading only `date` would leave the signal stale. Guides carry
 * no publication date, so only posts set it.
 */
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

/** Source-review dates describe the evidence, not the page's publication date. */
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
