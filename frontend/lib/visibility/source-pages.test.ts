import { describe, expect, it } from 'vite-plus/test';

import { absenceBasis, pageStanding, presenceLabel } from './source-pages';

/**
 * "Nobody looked" and "we looked and you are not there" are different
 * sentences. Every surface reading a cited page goes through these labels, so
 * this is where the two are kept apart.
 */
describe('cited-page vocabulary', () => {
  it('never renders an unread page as an absence', () => {
    expect(presenceLabel('not_inspected')).toBe('Not inspected');
    expect(presenceLabel('not_detected')).toBe('Not found on the page');
  });

  it('drops a token it has no words for rather than leaking it', () => {
    expect(presenceLabel('invented_state')).toBeNull();
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

  it('never tells an ambiguous or partial verdict that nothing matched', () => {
    // `ambiguous` means a match WAS found and could not be quoted; `partial`
    // means too little was read. One shared fallback lied to both.
    expect(absenceBasis('ambiguous', null, 4200)).toContain('could not be quoted');
    expect(absenceBasis('partial', null, 4200)).toContain('not enough of it');
    expect(absenceBasis('not_detected', null, 4200)).toContain('no form of the name matched');
  });

  it('offers no basis for a positive finding, which has its own passage', () => {
    expect(absenceBasis('present', 'exact_alias', 4200)).toBeNull();
  });

  it('offers no basis for a page nobody read, where nothing was searched', () => {
    expect(absenceBasis('not_detected', null, 0)).toBeNull();
  });
});

describe('where you stand on a cited page', () => {
  const page = (overrides: Partial<Parameters<typeof pageStanding>[0] & object> = {}) => ({
    state: 'inspected',
    reason: null,
    read_at: '2026-10-01T00:00:00Z',
    extracted_chars: 4200,
    page_format: 'listicle',
    page_format_method: 'heading_evidence',
    source_class: 'editorial_third_party',
    entities: [
      {
        kind: 'brand' as const,
        name: 'Acme',
        presence: 'not_detected',
        match_method: 'none',
        passages: [],
      },
      {
        kind: 'competitor' as const,
        name: 'Globex',
        presence: 'present',
        match_method: 'exact_alias',
        passages: ['Globex leads.'],
      },
    ],
    action_id: null,
    ...overrides,
  });

  it('calls a read page with rivals and without you an opportunity', () => {
    expect(pageStanding(page())).toBe('gap');
  });

  it('never judges a page nobody read, and says why it was not read', () => {
    expect(pageStanding(page({ read_at: null, entities: [] }))).toBe('not_read');
    expect(pageStanding(page({ read_at: null, state: 'blocked', entities: [] }))).toBe('blocked');
    expect(pageStanding(null)).toBe('untracked');
  });

  it("does not offer a competitor's own page as somewhere to be listed", () => {
    expect(pageStanding(page({ source_class: 'competitor_owned' }))).toBe('competitor');
  });

  it('reports you listed once your name is on the page', () => {
    const listed = page().entities.map((entity) =>
      entity.kind === 'brand' ? { ...entity, presence: 'present' } : entity,
    );
    expect(pageStanding(page({ entities: listed }))).toBe('listed');
  });
});
