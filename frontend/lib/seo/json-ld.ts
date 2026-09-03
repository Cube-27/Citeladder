import type { BlogPost } from '@/lib/marketing-content/blog';
import type { FaqGroup } from '@/lib/marketing-content/faq';
import { PARENT_COMPANY } from '@/lib/marketing-content/legal';
import { FOUNDER, PRODUCT_HEAD } from '@/lib/marketing-content/people';
import { absoluteUrl, SITE_NAME, SITE_TAGLINE } from '@/lib/seo/site';

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
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.excerpt,
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

/** Prevent a JSON value from terminating its containing script element. */
export function serializeJsonLd(data: JsonLdObject): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
