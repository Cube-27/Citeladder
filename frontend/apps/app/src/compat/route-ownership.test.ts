import { describe, expect, it } from 'vitest';

import { viteOwnedDestination } from './route-ownership';

const CURRENT_PROJECT = 'https://app.example/projects?project=11111111-1111-4111-8111-111111111111';

describe('viteOwnedDestination', () => {
  it('keeps migrated routes in the Vite router with their query and fragment', () => {
    expect(viteOwnedDestination('/onboarding?workspace=abc#step', CURRENT_PROJECT)).toBe(
      '/onboarding?workspace=abc#step',
    );
    expect(viteOwnedDestination('?project=next', CURRENT_PROJECT)).toBe('/projects?project=next');
  });

  it('hands not-yet-migrated and cross-origin routes to the production ingress', () => {
    expect(viteOwnedDestination('/settings?tab=providers', CURRENT_PROJECT)).toBeNull();
    expect(viteOwnedDestination('/', CURRENT_PROJECT)).toBeNull();
    expect(viteOwnedDestination('https://docs.example/guide', CURRENT_PROJECT)).toBeNull();
  });
});
