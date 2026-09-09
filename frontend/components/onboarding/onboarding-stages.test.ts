import { describe, expect, it } from 'vitest';

import { discoveryResults } from './onboarding-stages';

describe('discoveryResults', () => {
  it('renders the discovered website without its scheme or trailing slash', () => {
    const discovery = {
      input_data: { website_url: 'https://citeladder.com/' },
      competitors: [{ name: 'Example competitor' }],
    };

    expect(discoveryResults(discovery as never)).toEqual(['citeladder.com', 'Example competitor']);
  });
});
