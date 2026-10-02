import { describe, expect, it } from 'vitest';
import {
  buildRequest,
  quoteDataset,
  scopeHash,
  canonicalJson,
  type RequestOptions,
} from '../src/search-intelligence/requests.ts';
import { reviewBody } from '../src/routes/search-intelligence-contracts.ts';

const target = {
  identity: 'primary',
  label: 'Brand',
  registrable_domain: 'example.com',
  hostname: 'www.example.com',
  origin: 'https://www.example.com',
  source_kind: 'owned',
};
const options: RequestOptions = {
  kind: 'ranking_keywords',
  target,
  comparison: null,
  location: 2840,
  language: 'en',
  limit: 1000,
  offset: 0,
  scope: 'exact_host',
  seed: '',
  grouping: 'as_is',
  order: 'volume',
  minVolume: 10,
  dateFrom: '',
  dateTo: '',
};
describe('reviewed Search Intelligence requests', () => {
  it('escapes non-ASCII text as UTF-16 code units for stable historical identities', () => {
    expect(canonicalJson({ emoji: '😀', accent: 'é' })).toBe(
      '{"accent":"\\u00e9","emoji":"\\ud83d\\ude00"}',
    );
  });
  it('uses broad domain intersections while preserving keyword order and acquisition filters', () => {
    const comparison = {
      ...target,
      registrable_domain: 'rival.example',
      hostname: 'shop.rival.example',
      origin: 'https://shop.rival.example',
    };
    for (const kind of ['missing_keywords', 'shared_keywords'] as const) {
      const built = buildRequest({
        ...options,
        kind,
        comparison,
        scope: 'domain_subdomains',
        order: 'traffic',
      });
      expect(built.payload).toMatchObject({
        target1: 'rival.example',
        target2: 'example.com',
        intersections: kind === 'shared_keywords',
        order_by: ['first_domain_serp_element.etv,desc', 'keyword_data.keyword,asc'],
        filters: ['keyword_data.keyword_info.search_volume', '>=', 10],
      });
      expect(built.payload.pages).toBeUndefined();
      expect(() => buildRequest({ ...options, kind, comparison, order: 'traffic' })).toThrow(
        'Unsupported acquisition order',
      );
    }
  });
  it('preserves exact-host constraints and stable dataset identity across pages', () => {
    const first = buildRequest(options),
      second = buildRequest({ ...options, limit: 20, offset: 1000 });
    expect(first.payload.filters).toEqual([
      ['ranked_serp_element.serp_item.domain', '=', 'www.example.com'],
      'and',
      ['keyword_data.keyword_info.search_volume', '>=', 10],
    ]);
    expect(scopeHash(options, first.payload)).toBe(scopeHash(options, second.payload));
    const broad = { ...options, scope: 'domain_subdomains' as const };
    expect(buildRequest(broad).payload.filters).toEqual([
      'keyword_data.keyword_info.search_volume',
      '>=',
      10,
    ]);
    expect(scopeHash(broad, buildRequest(broad).payload)).not.toBe(
      scopeHash(options, first.payload),
    );
  });
  it('keeps backlink exclusion and host boundaries separate and quotes all paged calls', () => {
    const result = buildRequest({ ...options, kind: 'backlinks', minVolume: null });
    expect(result.payload.filters).toEqual([
      [
        ['url_to', 'like', 'https://www.example.com/%'],
        'or',
        ['url_to', 'like', 'http://www.example.com/%'],
        'or',
        ['url_to', '=', 'https://www.example.com'],
        'or',
        ['url_to', '=', 'http://www.example.com'],
      ],
      'and',
      ['domain_from', '<>', 'example.com'],
      'and',
      ['domain_from', 'not_like', '%.example.com'],
    ]);
    expect(quoteDataset('ranking_keywords', 1001)).toEqual({
      calls: 2,
      rows: 1001,
      costMicrousd: 144120,
    });
    expect(quoteDataset('backlink_history', 13).costMicrousd).toBe(24468);
    expect(quoteDataset('referring_domains', 1001)).toEqual({
      calls: 2,
      rows: 1001,
      costMicrousd: 84036,
    });
  });
  it('rejects selections with no supported acquisition semantics', () => {
    for (const selection of [
      { kind: 'missing_keywords' },
      { kind: 'keyword_suggestions', seed: 'shoe', order: 'traffic' },
      { kind: 'backlinks', depth: 21001 },
      { kind: 'footprint', min_volume: 1 },
    ])
      expect(reviewBody.safeParse({ datasets: [selection] }).success).toBe(false);
    expect(
      reviewBody.parse({ datasets: [{ kind: 'keyword_suggestions', seed: 'shoe' }] }).datasets[0]
        ?.depth,
    ).toBe(1);
  });
});
