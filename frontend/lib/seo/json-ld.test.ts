import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { organizationJsonLd, softwareApplicationJsonLd, websiteJsonLd } from './json-ld';

const ORIGINAL = process.env.NEXT_PUBLIC_SITE_URL;

afterEach(() => {
  vi.unstubAllEnvs();
  if (ORIGINAL === undefined) {
    delete process.env.NEXT_PUBLIC_SITE_URL;
  } else {
    process.env.NEXT_PUBLIC_SITE_URL = ORIGINAL;
  }
});

describe('organizationJsonLd', () => {
  it('emits the entity anchor on the production fallback origin', () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    vi.stubEnv('NODE_ENV', 'production');
    const data = organizationJsonLd();
    expect(data).not.toBeNull();
    expect(data?.['@type']).toBe('Organization');
    expect(data?.url).toBe('https://citeladder.com/');
    expect(data?.logo).toBe('https://citeladder.com/citeladder-logo.svg');
    expect(data?.['@id']).toBe('https://citeladder.com/#organization');
  });

  it('resolves logo and @id against the configured origin, not the apex', () => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://app.citeladder.com';
    const data = organizationJsonLd();
    expect(data?.url).toBe('https://app.citeladder.com/');
    expect(data?.logo).toBe('https://app.citeladder.com/citeladder-logo.svg');
    expect(data?.['@id']).toBe('https://app.citeladder.com/#organization');
    expect((websiteJsonLd()?.publisher as Record<string, unknown> | undefined)?.['@id']).toBe(
      data?.['@id'],
    );
    expect(
      (softwareApplicationJsonLd()?.publisher as Record<string, unknown> | undefined)?.['@id'],
    ).toBe(data?.['@id']);
  });
});
