import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { POSTS } from '@/lib/marketing-content/blog';
import { toBlogPostSummary } from '@/lib/marketing-content/blog-index';
import {
  blogIndexJsonLd,
  organizationJsonLd,
  researchArticleJsonLd,
  serializeJsonLd,
  softwareApplicationJsonLd,
  websiteJsonLd,
} from './json-ld';

describe('serializeJsonLd', () => {
  it('escapes every < so a value cannot close its script element', () => {
    expect(serializeJsonLd({ name: 'a</script><b' })).toBe(
      String.raw`{"name":"a\u003c/script>\u003cb"}`,
    );
  });
});

const ORIGINAL = process.env.PUBLIC_WEBSITE_ORIGIN;

afterEach(() => {
  vi.unstubAllEnvs();
  if (ORIGINAL === undefined) {
    delete process.env.PUBLIC_WEBSITE_ORIGIN;
  } else {
    process.env.PUBLIC_WEBSITE_ORIGIN = ORIGINAL;
  }
});

describe('organizationJsonLd', () => {
  it('emits the entity anchor on the configured website origin', () => {
    process.env.PUBLIC_WEBSITE_ORIGIN = 'https://citeladder.com';
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('PUBLIC_APP_ORIGIN', 'https://app.citeladder.com');
    const data = organizationJsonLd();
    expect(data).not.toBeNull();
    expect(data?.['@type']).toBe('Organization');
    expect(data?.url).toBe('https://citeladder.com/');
    expect(data?.logo).toBe('https://citeladder.com/citeladder-logo.svg');
    expect(data?.['@id']).toBe('https://citeladder.com/#organization');
  });

  it('resolves logo and @id against the configured origin, not the apex', () => {
    process.env.PUBLIC_WEBSITE_ORIGIN = 'https://example.test';
    const data = organizationJsonLd();
    expect(data?.url).toBe('https://example.test/');
    expect(data?.logo).toBe('https://example.test/citeladder-logo.svg');
    expect(data?.['@id']).toBe('https://example.test/#organization');
    expect(data?.contactPoint).toMatchObject({
      '@type': 'ContactPoint',
      email: 'contact@citeladder.com',
      url: 'https://example.test/contact',
    });
    expect((websiteJsonLd()?.publisher as Record<string, unknown> | undefined)?.['@id']).toBe(
      data?.['@id'],
    );
    expect(
      (softwareApplicationJsonLd()?.publisher as Record<string, unknown> | undefined)?.['@id'],
    ).toBe(data?.['@id']);
  });
});

describe('blogIndexJsonLd', () => {
  it('lists dated posts, then the research guides the page shows, in one numbered list', () => {
    process.env.PUBLIC_WEBSITE_ORIGIN = 'https://example.test';
    const post = toBlogPostSummary(POSTS[0]!);
    const data = blogIndexJsonLd({
      posts: [post],
      guides: [{ title: 'GEO vs SEO', path: '/blog/geo-vs-seo' }],
    });
    expect(data?.mainEntity).toEqual({
      '@type': 'ItemList',
      numberOfItems: 2,
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          url: `https://example.test/blog/${post.slug}`,
          name: post.title,
        },
        {
          '@type': 'ListItem',
          position: 2,
          url: 'https://example.test/blog/geo-vs-seo',
          name: 'GEO vs SEO',
        },
      ],
    });
  });
});

describe('researchArticleJsonLd', () => {
  it('credits the organization and dates a guide only by its review date', () => {
    process.env.PUBLIC_WEBSITE_ORIGIN = 'https://example.test';
    const organization = {
      '@type': 'Organization',
      '@id': 'https://example.test/#organization',
      name: 'CiteLadder',
      url: 'https://example.test/',
    };
    expect(
      researchArticleJsonLd({
        title: 'GEO vs SEO',
        slug: '/blog/geo-vs-seo',
        meta_description: 'Where to spend effort.',
        reviewed_at: '2026-10-06',
      }),
    ).toEqual({
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: 'GEO vs SEO',
      description: 'Where to spend effort.',
      inLanguage: 'en',
      url: 'https://example.test/blog/geo-vs-seo',
      mainEntityOfPage: { '@type': 'WebPage', '@id': 'https://example.test/blog/geo-vs-seo' },
      author: organization,
      publisher: organization,
      dateModified: '2026-10-06',
    });
  });
});
