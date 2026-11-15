import { describe, expect, it } from 'vite-plus/test';

import {
  formatCount,
  formatDisplayDate,
  formatDisplayTimestamp,
  formatFigureCount,
  formatPercent,
  formatTimeZoneNote,
  readableUrl,
  sharedOrigin,
  shortUrlTitle,
  urlCellText,
} from './format';

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
    expect([0.92, 0.1, 0.1234, 0, 1].map(formatPercent)).toEqual([
      '92.0%',
      '10.0%',
      '12.3%',
      '0.0%',
      '100.0%',
    ]);
    expect(formatPercent(null)).toBe('Not measured');
  });
});

describe('counts', () => {
  it('groups thousands with no stray spaces, and abbreviates only stat cards above 100,000', () => {
    expect([0, 999, 50_000, 1_162_000].map(formatCount)).toEqual([
      '0',
      '999',
      '50,000',
      '1,162,000',
    ]);
    expect([50_000, 100_000, 1_234_567].map(formatFigureCount)).toEqual([
      '50,000',
      '100,000',
      '1.2M',
    ]);
  });
});

describe('dates and times', () => {
  it('prints a date, a date-time without its zone, and the zone once for a table', () => {
    const at = '2026-11-14T11:33:00Z';
    expect(formatDisplayDate(at, 'Asia/Kolkata')).toBe('Nov 14, 2026');
    expect(formatDisplayTimestamp(at, 'Asia/Kolkata')).toBe('Nov 14, 2026, 05:03 PM');
    expect(formatTimeZoneNote('Asia/Kolkata', new Date(at))).toBe('Times in GMT+5:30');
    // A zone with daylight saving states the offset of the instant it is asked about.
    expect(formatTimeZoneNote('America/New_York', new Date('2026-07-01T12:00:00Z'))).toBe(
      'Times in EDT',
    );
    expect(formatTimeZoneNote('UTC', new Date(at))).toBe('Times in UTC');
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
    expect(urlCellText('https://www.shop.test.evil.test/a', origin)).toBe(
      'https://www.shop.test.evil.test/a',
    );
  });
});
