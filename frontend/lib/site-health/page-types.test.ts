import { describe, expect, it } from 'vitest';

import type { PageTypeScoreSummary } from '@/lib/api/types';
import { PAGE_TYPES, byPageTypeRows, pageTypeLabel, readPageTypeEvidence } from './page-types';

describe('pageTypeLabel (the single shared mapping)', () => {
  it('has a humanized label for every page type in the vocabulary', () => {
    for (const pageType of PAGE_TYPES) {
      expect(pageTypeLabel(pageType)).not.toBe(pageType);
      expect(pageTypeLabel(pageType).length).toBeGreaterThan(0);
    }
  });

  it('maps the multi-word and acronym types exactly', () => {
    expect(pageTypeLabel('about_contact')).toBe('About / Contact');
    expect(pageTypeLabel('faq')).toBe('FAQ');
    expect(pageTypeLabel('homepage')).toBe('Homepage');
    expect(pageTypeLabel('other')).toBe('Other');
  });

  it('falls back to title-casing an unknown type instead of rendering blank', () => {
    expect(pageTypeLabel('landing_page')).toBe('Landing Page');
  });
});

describe('byPageTypeRows (dashboard breakdown ordering)', () => {
  const bucket = (analyzed_count: number): PageTypeScoreSummary => ({
    analyzed_count,
    technical_score: 80,
    aeo_score: 62,
    overall_score: 71,
  });

  it('returns [] for an empty breakdown', () => {
    expect(byPageTypeRows({})).toEqual([]);
  });

  it('orders rows by the PAGE_TYPES display order, not insertion order', () => {
    const rows = byPageTypeRows({
      pricing: bucket(1),
      homepage: bucket(2),
      article: bucket(3),
    });
    expect(rows.map((row) => row.page_type)).toEqual(['homepage', 'article', 'pricing']);
  });

  it('spreads the analyzed count + mean scores onto each row', () => {
    const [row] = byPageTypeRows({ docs: bucket(7) });
    expect(row).toEqual({
      page_type: 'docs',
      analyzed_count: 7,
      technical_score: 80,
      aeo_score: 62,
      overall_score: 71,
    });
  });

  it('appends unknown types alphabetically after the known vocabulary', () => {
    const rows = byPageTypeRows({
      zebra_page: bucket(1),
      article: bucket(2),
      landing_page: bucket(3),
    });
    expect(rows.map((row) => row.page_type)).toEqual(['article', 'landing_page', 'zebra_page']);
  });
});

describe('readPageTypeEvidence (why-this-type disclosure reader)', () => {
  // The exact shape `PageTypeAssessment.to_evidence()` persists (snake_case).
  const persisted = {
    classifier_version: 'sh-classifier-1',
    classified_by: 'path_pattern',
    schema_suggested_type: 'product',
    confidence: 1.3,
    confidence_threshold: 0.5,
    signals: [
      {
        signal: 'path_pattern',
        page_type: 'article',
        weight: 0.8,
        detail: '^/(blog|news|guides)(/|$)',
      },
      { signal: 'structured_data', page_type: 'product', weight: 0.5, detail: 'Product' },
    ],
  };

  it('parses a full evidence record into the display view', () => {
    const view = readPageTypeEvidence(persisted, 'article');
    expect(view).toEqual({
      classifierVersion: 'sh-classifier-1',
      classifiedBy: 'path_pattern',
      schemaSuggestedType: 'product',
      confidence: 1.3,
      confidenceThreshold: 0.5,
      signals: [
        {
          signal: 'path_pattern',
          pageType: 'article',
          weight: 0.8,
          detail: '^/(blog|news|guides)(/|$)',
        },
        { signal: 'structured_data', pageType: 'product', weight: 0.5, detail: 'Product' },
      ],
      schemaConflict: true,
    });
  });

  it('flags no conflict when the schema suggestion matches the final type', () => {
    const view = readPageTypeEvidence(persisted, 'product');
    expect(view?.schemaConflict).toBe(false);
  });

  it('flags no conflict when there is no schema suggestion', () => {
    const view = readPageTypeEvidence({ ...persisted, schema_suggested_type: null }, 'article');
    expect(view?.schemaSuggestedType).toBeNull();
    expect(view?.schemaConflict).toBe(false);
  });

  it('returns null for absent or malformed evidence', () => {
    expect(readPageTypeEvidence(null, 'article')).toBeNull();
    expect(readPageTypeEvidence(undefined, 'article')).toBeNull();
    expect(readPageTypeEvidence('article', 'article')).toBeNull();
    expect(readPageTypeEvidence(42, 'article')).toBeNull();
    expect(readPageTypeEvidence([], 'article')).toBeNull();
    expect(readPageTypeEvidence({}, 'article')).toBeNull();
    // A required field of the wrong type sinks the whole record.
    expect(readPageTypeEvidence({ ...persisted, confidence: 'high' }, 'article')).toBeNull();
    expect(readPageTypeEvidence({ ...persisted, classified_by: 7 }, 'article')).toBeNull();
  });

  it('skips malformed signal entries and defaults a missing detail', () => {
    const view = readPageTypeEvidence(
      {
        ...persisted,
        signals: [
          'not-an-object',
          { signal: 'path_pattern', page_type: 'article' }, // no weight
          { signal: 'structured_data', page_type: 'product', weight: 0.5 }, // no detail
        ],
      },
      'article',
    );
    expect(view?.signals).toEqual([
      { signal: 'structured_data', pageType: 'product', weight: 0.5, detail: '' },
    ]);
  });
});
