import { describe, expect, it } from 'vitest';

import {
  brandStepSchema,
  deriveDomain,
  normalizeIntent,
  normalizeWebsiteUrl,
  onboardingErrorMessage,
  onboardingToProjectInput,
  type BrandStepValues,
} from './forms';

const brand: BrandStepValues = {
  brand_name: '  Acme  ',
  website_url: 'acme.com',
  country_code: 'us',
  language_code: 'en',
  industry: 'Analytics',
  business_type: 'b2b',
  products_services: 'Monitoring',
  target_audience: 'Marketing teams',
  positioning: 'Fast',
  price_tier: 'mid_market',
  additional_context: '',
};

describe('normalizeWebsiteUrl', () => {
  it('adds a scheme to a bare host', () => {
    expect(normalizeWebsiteUrl('acme.com')).toBe('https://acme.com');
  });

  it('leaves an explicit scheme alone, including http', () => {
    expect(normalizeWebsiteUrl('https://acme.com')).toBe('https://acme.com');
    expect(normalizeWebsiteUrl('http://acme.com')).toBe('http://acme.com');
  });

  it('is empty for empty input rather than producing "https://"', () => {
    expect(normalizeWebsiteUrl('   ')).toBe('');
  });
});

describe('deriveDomain', () => {
  it('strips scheme, www and path', () => {
    expect(deriveDomain('https://www.acme.com/pricing')).toBe('acme.com');
    expect(deriveDomain('acme.co.uk')).toBe('acme.co.uk');
  });

  it('returns empty for input that cannot parse', () => {
    expect(deriveDomain('')).toBe('');
    expect(deriveDomain('   ')).toBe('');
  });
});

describe('brandStepSchema', () => {
  it('accepts a bare host and a full URL', () => {
    expect(brandStepSchema.safeParse({ ...brand, website_url: 'acme.com' }).success).toBe(true);
    expect(brandStepSchema.safeParse({ ...brand, website_url: 'https://acme.com' }).success).toBe(
      true,
    );
  });

  it('rejects a website with no dot', () => {
    expect(brandStepSchema.safeParse({ ...brand, website_url: 'acme' }).success).toBe(false);
  });

  it('requires a brand name', () => {
    expect(brandStepSchema.safeParse({ ...brand, brand_name: '   ' }).success).toBe(false);
  });
});

describe('normalizeIntent', () => {
  it('passes through the known enum values, casefolded', () => {
    expect(normalizeIntent('Discovery')).toBe('discovery');
    expect(normalizeIntent('  purchase ')).toBe('purchase');
  });

  it('maps anything unrecognised to unspecified rather than leaking it', () => {
    // The suggestion endpoint returns free text; PromptInput.intent is a strict
    // enum, so an unknown value must not reach the API.
    expect(normalizeIntent('vibes')).toBe('');
    expect(normalizeIntent('')).toBe('');
  });
});

describe('onboardingToProjectInput', () => {
  it('maps only selected competitors and domains, trimming as it goes', () => {
    const input = onboardingToProjectInput(
      brand,
      [
        { id: 'globex', name: ' Globex ', domains: ['globex.com'], selected: true },
        { id: 'initech', name: 'Initech', domains: [], selected: false },
      ],
      [
        { id: 'acme-com', domain: 'acme.com', selected: true },
        { id: 'acme-dev', domain: 'acme.dev', selected: false },
      ],
    );

    expect(input.brand_name).toBe('Acme');
    expect(input.name).toBe('Acme');
    expect(input.website_url).toBe('https://acme.com');
    expect(input.country_code).toBe('US');
    expect(input.owned_domains).toEqual(['acme.com']);
    expect(input.competitors).toEqual([{ name: 'Globex', aliases: [], domains: ['globex.com'] }]);
  });

  it('sends the defaults onboarding never asks about', () => {
    const input = onboardingToProjectInput(brand, [], []);
    expect(input.benchmark_mode).toBe('consumer_like');
    expect(input.default_repetitions).toBe(1);
    expect(input.brand).toEqual({ aliases: [] });
    expect(input.unintended_domains).toEqual([]);
  });
});

describe('onboardingErrorMessage', () => {
  it('prefers the transport-unwrapped detail', () => {
    expect(onboardingErrorMessage(new Error('Brand already exists.'))).toBe(
      'Brand already exists.',
    );
  });

  it('falls back for non-errors', () => {
    expect(onboardingErrorMessage(null)).toMatch(/something went wrong/i);
  });
});
