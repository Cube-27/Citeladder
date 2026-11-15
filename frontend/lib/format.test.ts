import { describe, expect, it } from 'vite-plus/test';

import { formatPercent, readableUrl, sharedOrigin, shortUrlTitle, urlCellText } from './format';

describe('readableUrl', () => {
  it('decodes a doubly encoded path to what a reader expects', () => {
    expect(readableUrl('https://shop.test/Women%2527s-Clothing/Tops%2520%2526%2520Tees')).toBe(
      "https://shop.test/Women's-Clothing/Tops & Tees",
    );
  });

  it('keeps a malformed escape as text instead of failing', () => {
    expect(readableUrl('/sale-100%-off')).toBe('/sale-100%-off');
  });
});

describe('shortUrlTitle', () => {
  it('names a page by its host and its last path segment', () => {
    expect(
      shortUrlTitle(
        'https://www.bestandless.com.au/Categories/Women/Women%2527s-Clothing/Women%2527s-Dresses/WR3458_PAISLEY?colour=blue',
      ),
    ).toBe('bestandless.com.au/…/WR3458_PAISLEY');
    expect(shortUrlTitle('https://acme.test/pricing')).toBe('acme.test/pricing');
    expect(shortUrlTitle('https://acme.test/')).toBe('acme.test');
  });

  it('only makes text that is not a web address readable', () => {
    expect(shortUrlTitle('best crm for small teams')).toBe('best crm for small teams');
    expect(shortUrlTitle('mailto:sales%40acme.test')).toBe('mailto:sales@acme.test');
  });
});

describe('formatPercent', () => {
  it('prints one decimal for every rate, so 92.0% sits beside 10.0%', () => {
    expect([0.92, 0.1, 0.1234, 0].map(formatPercent)).toEqual(['92.0%', '10.0%', '12.3%', '0.0%']);
    expect(formatPercent(null)).toBe('Not measured');
  });
});

describe('URL cells', () => {
  it('drops the origin a whole column shares and keeps it when the origins differ', () => {
    const urls = ['https://www.shop.test/journal/a', 'https://www.shop.test/'];
    const origin = sharedOrigin(urls);
    expect(origin).toBe('https://www.shop.test');
    expect(urls.map((url) => urlCellText(url, origin))).toEqual(['/journal/a', '/']);
    expect(sharedOrigin([...urls, 'https://other.test/x'])).toBeNull();
    expect(sharedOrigin(['/relative/path'])).toBeNull();
    expect(urlCellText('https://other.test/Women%27s', origin)).toBe("https://other.test/Women's");
  });
});
