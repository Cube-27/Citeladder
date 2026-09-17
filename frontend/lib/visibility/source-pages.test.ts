import { describe, expect, it } from 'vite-plus/test';

import { absenceBasis, citedByLabel, pageStateLabel, presenceLabel } from './source-pages';

/**
 * "Nobody looked" and "we looked and you are not there" are different
 * sentences. Every surface reading a cited page goes through these labels, so
 * this is where the two are kept apart.
 */
describe('cited-page vocabulary', () => {
  it('never renders an unread page as an absence', () => {
    expect(presenceLabel('not_inspected')).toBe('Not inspected');
    expect(presenceLabel('not_detected')).toBe('Not found on the page');
    expect(pageStateLabel('blocked')).toBe('Publisher blocks automated access');
  });

  it('drops a token it has no words for rather than leaking it', () => {
    expect(presenceLabel('invented_state')).toBeNull();
    expect(pageStateLabel('invented_state')).toBeNull();
  });

  it('qualifies an absence with the method and the coverage behind it', () => {
    expect(absenceBasis('not_detected', 'exact_alias', 4200)).toBe(
      'Searched 4,200 characters of readable text for the exact name.',
    );
  });

  it('says outright that nothing matched, rather than naming a null method', () => {
    expect(absenceBasis('not_detected', 'none', 4200)).toBe(
      'Searched 4,200 characters of readable text; no form of the name matched.',
    );
  });

  it('offers no basis for a positive finding, which has its own passage', () => {
    expect(absenceBasis('present', 'exact_alias', 4200)).toBeNull();
  });

  it('offers no basis for a page nobody read, where nothing was searched', () => {
    expect(absenceBasis('not_detected', null, 0)).toBeNull();
  });

  it('counts answers, and says so in the reader s terms', () => {
    expect(citedByLabel(1)).toBe('Cited by 1 answer');
    expect(citedByLabel(4)).toBe('Cited by 4 answers');
    expect(citedByLabel(0)).toBe('Not cited in analyzed answers');
  });
});
