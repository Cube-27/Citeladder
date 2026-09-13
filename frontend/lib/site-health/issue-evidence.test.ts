import { describe, expect, it } from 'vitest';

import { evidenceFacts } from './issue-evidence';

// Every evidence blob below is a verbatim row from a real persisted crawl
// (hiutdenim.co.uk, 200 pages) — the shapes these formatters have to survive.
describe('evidenceFacts', () => {
  it('names the absent notations rather than restating the title', () => {
    expect(
      evidenceFacts('aeo.structured_data_present', {
        types: [],
        block_count: 0,
        has_json_ld: false,
        has_microdata: false,
      }),
    ).toEqual(['JSON-LD', 'Microdata']);
    expect(
      evidenceFacts('aeo.open_graph_present', {
        has_og_title: false,
        property_count: 0,
        has_og_description: false,
      }),
    ).toEqual(['og:title', 'og:description']);
    expect(
      evidenceFacts('technical.canonical_present', { present: false, canonical_url: '' }),
    ).toEqual(['<link rel="canonical">']);
  });

  it('stays silent about the signal that passed', () => {
    expect(
      evidenceFacts('aeo.content_date_present', { has_published: true, has_modified: false }),
    ).toEqual(['dateModified']);
  });

  it('reads an empty list as absent, not as a satisfied flag', () => {
    // `currency: []` is truthy in JavaScript; read as a plain flag it hid the
    // one property this check actually failed on.
    expect(
      evidenceFacts('aeo.offer_freshness_signal', {
        offer: true,
        reason: 'offer_currency_missing',
        currency: [],
        timestamp: '',
        expiry_state: 'not_declared',
      }),
    ).toEqual(['priceCurrency', 'priceValidUntil']);
  });

  it('identifies each offending control by selector, never by ordinal', () => {
    expect(
      evidenceFacts('web.accessibility_form_names', {
        control_count: 16,
        missing_accessible_name: 2,
        missing_control_descriptors: [
          { id: '', tag: 'input', name: 'q', type: 'search', ordinal: 5 },
          { id: '', tag: 'select', name: '', type: 'select', ordinal: 16 },
        ],
      }),
    ).toEqual(['input[name="q"]', 'select']);
  });

  it('prefers an id, then a name, then a type when naming a control', () => {
    expect(
      evidenceFacts('web.accessibility_form_names', {
        missing_control_descriptors: [
          { tag: 'input', id: 'search', name: 'q', type: 'text' },
          { tag: 'input', id: '', name: '', type: 'email' },
          { tag: 'textarea', id: '', name: '', type: 'textarea' },
        ],
      }),
    ).toEqual(['input#search', 'input[type="email"]', 'textarea']);
  });

  it('tallies a repeated heading skip instead of repeating the line', () => {
    expect(
      evidenceFacts('web.accessibility_heading_order', {
        level_skips: 4,
        heading_levels: [1, 4, 1, 4, 1, 4, 3, 5],
        skips: [
          { to: 4, from: 1, scope: 'full_document' },
          { to: 4, from: 1, scope: 'full_document' },
          { to: 4, from: 1, scope: 'full_document' },
          { to: 5, from: 3, scope: 'full_document' },
        ],
      }),
    ).toEqual(['h1 → h4 ×3', 'h3 → h5']);
  });

  it('writes missing schema properties in dotted schema.org notation', () => {
    expect(
      evidenceFacts('aeo.schema_required_valid', {
        schema_type: 'Product',
        expected_types: ['Product'],
        missing: ['offers.priceCurrency', 'offers.availability'],
        checked_blocks: 1,
      }),
    ).toEqual(['Product.offers.priceCurrency', 'Product.offers.availability']);
  });

  it('states a schema mismatch as expected versus found', () => {
    expect(
      evidenceFacts('aeo.schema_matches_content', {
        expected_types: ['Product'],
        found_types: ['Article'],
      }),
    ).toEqual(['Product expected, Article found']);
  });

  it('names only the unmet atoms of a composite contract', () => {
    expect(
      evidenceFacts('aeo.product_answer_facts', {
        threshold: 'all_required_and_applicable',
        atoms: [
          { name: 'identity', outcome: 'missing', required: true },
          { name: 'offer', outcome: 'satisfied', required: true },
          { name: 'availability', outcome: 'missing', required: true },
          { name: 'variants', outcome: 'not_applicable', required: false },
        ],
      }),
    ).toEqual(['identity', 'availability']);
  });

  it('keeps the numbers that ARE the finding', () => {
    expect(evidenceFacts('technical.ttfb_band', { ttfb_ms: 828, threshold_ms: 800 })).toEqual([
      '828 ms · budget 800 ms',
    ]);
    expect(
      evidenceFacts('web.accessibility_image_alt', {
        image_count: 12,
        missing_alt: 3,
        decorative_alt: 1,
      }),
    ).toEqual(['alt ×3']);
  });

  it('falls back to the evaluator reason when a check is about a relationship', () => {
    expect(
      evidenceFacts('aeo.question_headings', { reason: 'no_question_answer_relationships' }),
    ).toEqual(['no question answer relationships']);
  });

  it('never leaks identifiers through the unknown-rule fallback', () => {
    expect(
      evidenceFacts('architecture.something_new', {
        count: 2,
        site_url_ids: ['e123eceb-5eeb-48ef-9942-74b056817a0e'],
        evaluation_id: 'a3dc635f-ee46-4014-bf3e-2dd700458c29',
      }),
    ).toEqual(['count 2']);
  });

  it('says nothing when nothing can be said without inventing it', () => {
    expect(evidenceFacts('aeo.product_brand_identity', { brands: [], visible_brands: [] })).toEqual(
      ['brand'],
    );
    expect(evidenceFacts('technical.unknown_rule', {})).toEqual([]);
  });
});
