import { describe, expect, it } from 'vite-plus/test';

import { visibilityEvidenceHref } from './use-visibility-dashboard';

describe('visibilityEvidenceHref', () => {
  it('keeps the shared selection, drops the Brand page and evidence keys, and applies the slice', () => {
    const href = visibilityEvidenceHref(
      '?market=m-1&cohort=all&run=old&brand=Globex&metric=sov&cursor=c1&prompt=p1',
      { run: 'r-2', engine: 'gemini', competitor: null },
    );
    expect(Object.fromEntries(new URL(href, 'https://x.test').searchParams)).toEqual({
      market: 'm-1',
      cohort: 'all',
      run: 'r-2',
      tab: 'query-fanout',
      engine: 'gemini',
    });
    expect(href.startsWith('/visibility?')).toBe(true);
  });
});
