import { afterEach, describe, expect, it } from 'vite-plus/test';
import { clearPendingIntent, readPendingIntent } from './pending-pricing-intent';
import {
  capturePublicPricingSelection,
  parsePublicPricingSelection,
  publicPricingSelectionHref,
} from './public-pricing-selection';

afterEach(clearPendingIntent);

describe('public pricing handoff', () => {
  it('captures only bounded selection fields on the app origin before login', () => {
    const href = publicPricingSelectionHref(
      { kind: 'checkout', catalog_key: 'tier_2', quantity: 1, byok: true },
      new URL('https://app.citeladder.com'),
    );
    const url = new URL(href);
    expect(url.origin).toBe('https://app.citeladder.com');
    expect(capturePublicPricingSelection(url)).toBe(true);
    expect(readPendingIntent()?.catalog_key).toBe('tier_2');
    expect(readPendingIntent()?.billing_details).toBeNull();
  });

  it.each([
    'kind=refund&catalog_key=tier_2&quantity=1&byok=1',
    'kind=checkout&catalog_key=tier_2&quantity=1001&byok=1',
    'kind=checkout&catalog_key=tier_2&quantity=1&byok=maybe',
    'kind=checkout&catalog_key=tier_2&quantity=1&byok=1&byok=0',
    'kind=checkout&catalog_key=..%2Fsecret&quantity=1&byok=1',
  ])('rejects invalid handoff %s', (query) => {
    expect(parsePublicPricingSelection(new URLSearchParams(query))).toBeNull();
  });

  it('discards an older pending selection when a new handoff is malformed', () => {
    capturePublicPricingSelection(
      new URL(
        'https://app.citeladder.com/pricing?kind=checkout&catalog_key=tier_2&quantity=1&byok=1',
      ),
    );
    expect(readPendingIntent()).not.toBeNull();
    capturePublicPricingSelection(new URL('https://app.citeladder.com/pricing?kind=refund'));
    expect(readPendingIntent()).toBeNull();
  });
});
