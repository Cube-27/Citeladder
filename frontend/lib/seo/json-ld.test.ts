import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { POSTS } from '@/lib/marketing-content/blog';
import { toBlogPostSummary } from '@/lib/marketing-content/blog-index';
import {
  blogIndexJsonLd,
  organizationJsonLd,
  softwareApplicationJsonLd,
  websiteJsonLd,
} from './json-ld';

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
