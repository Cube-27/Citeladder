/** Referral redaction and repeatable event identity. */
import { describe, expect, it } from 'vitest';

import { referralEventFields, sanitizeReferralUrl } from '../src/referrals/events.ts';

describe('referralEventFields', () => {
  it('removes credentials and private parameters while retaining allowed attribution', () => {
    const url = sanitizeReferralUrl(
      'https://user:password@chatgpt.com/path?utm_source=chatgpt&email=private%40example.test#secret',
    );
    const parsed = new URL(url);
    expect([parsed.username, parsed.password, parsed.hash]).toEqual(['', '', '']);
    expect([...parsed.searchParams]).toEqual([['utm_source', 'chatgpt']]);
    expect(sanitizeReferralUrl('javascript:alert(1)')).toBe('');
    const row = {
      dataset: 'ga4_referrer_daily',
      date: '2026-07-20',
      dimension_key: 'https://chatgpt.com/ | 20260720',
    };
    const first = referralEventFields(row);
    expect(first).toMatchObject({ referrer_host: 'chatgpt.com' });
    expect(referralEventFields(row)?.content_hash).toBe(first?.content_hash);
    expect(referralEventFields({ ...row, date: '2026-07-21' })?.content_hash).not.toBe(
      first?.content_hash,
    );
  });
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
