import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { organizationJsonLd, softwareApplicationJsonLd, websiteJsonLd } from './json-ld';

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
    expect((websiteJsonLd()?.publisher as Record<string, unknown> | undefined)?.['@id']).toBe(
      data?.['@id'],
    );
    expect(
      (softwareApplicationJsonLd()?.publisher as Record<string, unknown> | undefined)?.['@id'],
    ).toBe(data?.['@id']);
  });
});
