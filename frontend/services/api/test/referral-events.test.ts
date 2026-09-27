/**
 * Where the event mapping deliberately departs from the retired Python: a
 * referrer `urlsplit` rejects no longer fails the whole artifact's ingest.
 * Every other mapping is held to Python by the frozen golden masters.
 */
import { describe, expect, it } from 'vitest';

import { referralEventFields } from '../src/referrals/events.ts';

describe('referralEventFields', () => {
  it('persists an unparseable referrer as empty and keeps the row', () => {
    const fields = referralEventFields({
      dataset: 'ga4_referrer_daily',
      date: '2026-07-20',
      dimension_key: 'https://[broken/path?ref=x | 20260720',
    });
    expect(fields).toMatchObject({ referrer_url: '', referrer_host: '' });
    expect(fields?.raw.dimension_key).toBe('https://[broken/path?ref=x | 20260720');
  });
});
