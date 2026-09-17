import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vite-plus/test';

import { renderWithProviders as render } from '@/test/render';

import { CompetitorGapRow, type CompetitorGapPage } from './competitor-gap-row';

/**
 * The finding this row carries is the product's whole claim about a page it
 * does not own: these rivals are on it, here is the line that says so, and you
 * are not there.
 *
 * What these lock down is the pair of substitutions that would quietly destroy
 * that claim — a competitor name shown without the passage behind it, and an
 * absence presented as a finding without saying how hard anyone looked.
 */
const PAGE: CompetitorGapPage = {
  url_hash: 'a'.repeat(64),
  canonical_url: 'https://publisher.example/best-crm',
  registrable_domain: 'publisher.example',
  page_format: 'listicle',
  title: 'Best CRM tools',
  extracted_chars: 4200,
  answers_citing: 3,
  brand_state: 'not_detected',
  brand_match_method: 'none',
  competitors: [
    {
      entity_kind: 'competitor',
      entity_name: 'Globex',
      state: 'present',
      match_method: 'exact_alias',
      match_count: 2,
      passages: ['Globex leads the field for small teams.'],
      limitations: [],
    },
  ],
  opportunity_id: null,
  opportunity_title: null,
  limitations: [],
};

describe('a page where a rival appears and the brand does not', () => {
  it('shows the rival and the quoted line together, with no interaction', () => {
    render(<CompetitorGapRow page={PAGE} onOpenPage={vi.fn()} />);

    expect(screen.getByText('Globex')).toBeTruthy();
    // The proof is on screen beside the name, not one click away.
    expect(screen.getByText(/Globex leads the field for small teams\./)).toBeTruthy();
    expect(screen.getByText('Cited by 3 answers')).toBeTruthy();
    expect(screen.getByText('Listicle')).toBeTruthy();
  });

  it('qualifies the absence with how it was searched for', () => {
    render(<CompetitorGapRow page={PAGE} onOpenPage={vi.fn()} />);

    // No passage can prove an absence, so the coverage and the matching method
    // are what stands in for one.
    expect(screen.getByText(/Searched 4,200 characters of readable text/)).toBeTruthy();
  });

  it('says there is no action rather than inventing one', () => {
    render(<CompetitorGapRow page={PAGE} onOpenPage={vi.fn()} />);

    expect(screen.getByText('No action yet')).toBeTruthy();
  });

  it('routes to the opportunity once a qualified rule has produced one', () => {
    render(
      <CompetitorGapRow
        page={{
          ...PAGE,
          opportunity_id: '11111111-1111-4111-8111-111111111111',
          opportunity_title: 'Get listed on publisher.example',
        }}
        onOpenPage={vi.fn()}
      />,
    );

    expect(screen.getByText('Get listed on publisher.example')).toBeTruthy();
    expect(screen.queryByText('No action yet')).toBeNull();
  });
});
