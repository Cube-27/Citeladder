import { afterEach, describe, expect, it } from 'vite-plus/test';

import { absoluteUrl, siteOrigin } from './site';

const original = process.env.PUBLIC_WEBSITE_ORIGIN;

afterEach(() => {
  if (original === undefined) delete process.env.PUBLIC_WEBSITE_ORIGIN;
  else process.env.PUBLIC_WEBSITE_ORIGIN = original;
});

describe('website metadata origin', () => {
  it('uses the configured website host for absolute links', () => {
    process.env.PUBLIC_WEBSITE_ORIGIN = 'https://citeladder.com';
    expect(siteOrigin()?.origin).toBe('https://citeladder.com');
    expect(absoluteUrl('/faq')).toBe('https://citeladder.com/faq');
  });

  it('does not guess a development hostname', () => {
    delete process.env.PUBLIC_WEBSITE_ORIGIN;
    expect(siteOrigin()).toBeNull();
  });
});
