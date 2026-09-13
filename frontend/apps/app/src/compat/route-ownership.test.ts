import { describe, expect, it } from 'vitest';

import { viteOwnedDestination } from './route-ownership';

const CURRENT_PROJECT = 'https://app.example/projects?project=11111111-1111-4111-8111-111111111111';

describe('viteOwnedDestination', () => {
  it('keeps migrated routes in the Vite router with their query and fragment', () => {
    expect(viteOwnedDestination('/onboarding?workspace=abc#step', CURRENT_PROJECT)).toBe(
      '/onboarding?workspace=abc#step',
    );
    expect(viteOwnedDestination('?project=next', CURRENT_PROJECT)).toBe('/projects?project=next');
    expect(viteOwnedDestination('/issues?severity=high', CURRENT_PROJECT)).toBe(
      '/issues?severity=high',
    );
    expect(viteOwnedDestination('/performance?range=90d', CURRENT_PROJECT)).toBe(
      '/performance?range=90d',
    );
  });

  it('recognizes only the shipped dynamic Website page route', () => {
    expect(viteOwnedDestination('/site/crawls/crawl-id/pages/page-id', CURRENT_PROJECT)).toBe(
      '/site/crawls/crawl-id/pages/page-id',
    );
    expect(viteOwnedDestination('/site/crawls/crawl-id', CURRENT_PROJECT)).toBeNull();
  });

  it('hands not-yet-migrated and cross-origin routes to the production ingress', () => {
    expect(viteOwnedDestination('/settings?tab=providers', CURRENT_PROJECT)).toBeNull();
    expect(viteOwnedDestination('/', CURRENT_PROJECT)).toBeNull();
    expect(viteOwnedDestination('https://docs.example/guide', CURRENT_PROJECT)).toBeNull();
  });
});
