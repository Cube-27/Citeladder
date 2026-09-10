import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { RankingRow } from '@/lib/api/types';
import { RankingRowsTable } from './ranking-rows';

function row(overrides: Partial<RankingRow> = {}): RankingRow {
  return {
    name: 'Acme',
    is_brand: false,
    logo_url: null,
    website_url: null,
    mention_rate: 0.5,
    citation_rate: 0.25,
    share_of_voice: 0.4,
    mention_count: 5,
    sentiment: null,
    avg_position: null,
    ...overrides,
  };
}

describe('RankingRowsTable', () => {
  it('discloses an empty selection', () => {
    render(<RankingRowsTable rows={[]} />);
    expect(screen.getByText('No measured responses in this selection.')).toBeVisible();
  });
  it('sorts presence rates and breaks ties deterministically without inventing ranks', () => {
    render(
      <RankingRowsTable
        rows={[
          row({ name: 'Zulu' }),
          row({ name: 'Acme' }),
          row({ name: 'Leader', mention_rate: 1 }),
        ]}
      />,
    );
    const rows = screen.getAllByRole('row').slice(1);
    expect(within(rows[0]).getByText('Leader')).toBeVisible();
    expect(within(rows[1]).getByText('Acme')).toBeVisible();
    expect(screen.queryByRole('columnheader', { name: /rank/i })).toBeNull();
  });
  it('identifies the brand and shows actual citation measurements', () => {
    render(<RankingRowsTable rows={[row({ is_brand: true })]} />);
    expect(screen.getByText('You')).toBeVisible();
    expect(screen.getByRole('columnheader', { name: 'Citations' })).toBeVisible();
    expect(screen.queryByRole('columnheader', { name: 'Sentiment' })).toBeNull();
  });
  it('distinguishes measured zero, unavailable rates, and incomparable changes', () => {
    render(
      <RankingRowsTable
        rows={[row({ mention_rate: 0 }), row({ name: 'Unknown', mention_rate: null })]}
      />,
    );
    expect(screen.getByText('0%')).toBeVisible();
    const unknown = screen.getByText('Unknown').closest('tr')!;
    expect(within(unknown).getByText('Not measured')).toBeVisible();
    // With no prior run, NO brand has a change, so the column is not drawn at
    // all; the reason is stated once above the table.
    expect(screen.queryByRole('columnheader', { name: 'Change' })).toBeNull();
  });
  it('opens the exact same-response competitor gap', () => {
    const onSelect = vi.fn();
    render(
      <RankingRowsTable
        rows={[row({ name: 'Globex', gap_count: 3, visibility_delta: 0.3 })]}
        onSelect={onSelect}
      />,
    );
    expect(screen.getByText('+0.3 pp')).toBeVisible();
    fireEvent.click(
      screen.getByRole('button', { name: 'Show the 3 answers naming Globex but not you' }),
    );
    expect(onSelect).toHaveBeenCalledWith('Globex');
  });
  it('prefers the matched-subset change when the run has one', () => {
    render(
      <RankingRowsTable
        rows={[
          row({
            visibility_delta: 2,
            matched_visibility_delta: 10,
            matched_visibility_rate: 0.6,
            matched_response_count: 4,
          }),
        ]}
      />,
    );
    // Which comparison produced the number is explained once above the table,
    // so the cell shows the number and nothing else.
    expect(screen.getByText('+10.0 pp')).toBeVisible();
    expect(screen.queryByText('Matched subset')).toBeNull();
  });
});
