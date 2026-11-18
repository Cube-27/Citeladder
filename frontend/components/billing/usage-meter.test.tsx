import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';

import type { UsageItem } from '@/lib/api/billing';
import { DISPLAY_TIME_ZONE_COOKIE } from '@/lib/display-timezone';

import { UsageTable } from './usage-meter';

/**
 * The rule this table exists to enforce is that `limit_state` is the ONLY
 * authority for what the numbers mean. An `unknown` allowance drawn as an empty
 * bar reads as "none left" when it means "we could not resolve this" — the user
 * then believes they are out of quota they may well have. `unlimited` drawn as
 * a bar is the mirror mistake. Both are asserted here as the ABSENCE of a
 * meter, beside a row that has one.
 */
function item(overrides: Partial<UsageItem> = {}): UsageItem {
  return {
    key: 'prompt_slots',
    capability_type: 'counter',
    unit: 'slots',
    limit_state: 'finite',
    allowance: 100,
    consumed: 10,
    reserved: 0,
    remaining: 90,
    window_started_at: null,
    resets_at: null,
    earliest_expiry: null,
    grants: [],
    ...overrides,
  } as UsageItem;
}

/** A metered table: the subject row, then a used finite row that always meters. */
function renderRow(subject: UsageItem) {
  render(<UsageTable items={[subject, item({ key: 'project_slots' })]} />);
  const [, row] = screen.getAllByRole('row');
  if (!row) throw new Error('no subject row');
  return row;
}

/** The row's cells as text, the quota first. */
const cells = (row: HTMLElement) =>
  within(row)
    .getAllByRole('cell')
    .map((cell) => cell.textContent);

describe('UsageTable', () => {
  beforeEach(() => {
    document.cookie = `${DISPLAY_TIME_ZONE_COOKIE}=UTC; Path=/`;
  });
  afterEach(() => {
    document.cookie = `${DISPLAY_TIME_ZONE_COOKIE}=; Path=/; Max-Age=0`;
  });

  it('names known counters in reader terms and humanises unknown keys', () => {
    render(
      <UsageTable
        items={[
          item({ key: 'prompt_runs_per_period', allowance: 150, consumed: 40, remaining: 110 }),
          item({ key: 'new_counter' }),
        ]}
      />,
    );
    const [, runs, other] = screen.getAllByRole('row');
    expect(cells(runs!).slice(0, 4)).toEqual(['Prompt runs', '40', '150', '110']);
    expect(cells(other!).slice(0, 4)).toEqual(['New counter', '10', '100', '90']);
    expect(screen.getByRole('meter', { name: 'Prompt runs' })).toHaveAttribute(
      'aria-valuetext',
      '40 of 150 runs',
    );
  });

  it('says an unresolved allowance is unavailable and draws no bar', () => {
    const row = renderRow(item({ limit_state: 'unknown', allowance: null, consumed: null }));
    expect(cells(row)[2]).toBe('—Not available');
    expect(within(row).queryByRole('meter')).toBeNull();
    expect(screen.getByRole('meter', { name: 'Projects' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'About Prompts' })).toHaveAccessibleDescription(
      'This allowance could not be resolved, so no usage is shown.',
    );
  });

  it('shows consumption with no ceiling for an unlimited allowance', () => {
    const row = renderRow(item({ limit_state: 'unlimited', allowance: null, consumed: 42 }));
    expect(cells(row).slice(0, 3)).toEqual(['Prompts', '42', 'Unlimited']);
    expect(within(row).queryByRole('meter')).toBeNull();
  });

  it('marks an unread consumption on an unlimited row as not measured, never zero', () => {
    const row = renderRow(item({ limit_state: 'unlimited', consumed: null }));
    expect(cells(row)[1]).toBe('—Not measured');
  });

  it('says an unused zero allowance is not included instead of drawing an empty bar', () => {
    const row = renderRow(item({ key: 'market_slots', allowance: 0, consumed: 0, remaining: 0 }));
    expect(cells(row).slice(0, 3)).toEqual(['Extra markets', '0', 'Not included']);
    expect(within(row).queryByRole('meter')).toBeNull();
  });

  it('still meters usage held over a zero allowance, as at the limit', () => {
    const row = renderRow(item({ allowance: 0, consumed: 2, remaining: 0 }));
    const meter = within(row).getByRole('meter');
    expect(meter).toHaveAttribute('aria-valuetext', '2 of 0 prompts');
    expect(meter).toHaveAttribute('data-meter-tone', 'negative');
  });

  it.each([
    [79, 'ink'],
    [80, 'warning'],
    [99, 'warning'],
    [100, 'negative'],
    [150, 'negative'],
  ])('tones %i of 100 used as %s', (consumed, tone) => {
    const row = renderRow(item({ allowance: 100, consumed, remaining: 0 }));
    expect(within(row).getByRole('meter')).toHaveAttribute('data-meter-tone', tone);
  });

  it('never overfills the bar past full', () => {
    // Over-consumption is possible (a reservation settling high); the bar must
    // clamp rather than overflow its track.
    const row = renderRow(item({ allowance: 100, consumed: 150, remaining: 0 }));
    const meter = within(row).getByRole('meter');
    expect(meter).toHaveAttribute('aria-valuenow', '100');
    expect(meter).toHaveAttribute('aria-valuetext', '150 of 100 prompts');
  });

  it('omits the Usage column, and every meter, when nothing is used', () => {
    render(<UsageTable items={[item({ consumed: 0, remaining: 100 })]} />);
    expect(screen.getAllByRole('columnheader').map((head) => head.textContent)).toEqual([
      'Quota',
      'Used',
      'Allowance',
      'Remaining',
    ]);
    expect(screen.queryByRole('meter')).toBeNull();
  });

  it.each([
    [{ reserved: 5 }, '5 prompts reserved.'],
    [{ resets_at: '2026-09-01T00:00:00Z' }, 'Resets Sep 1, 2026.'],
    [
      {
        key: 'ai_credits',
        capability_type: 'counter.consumable',
        earliest_expiry: '2026-09-15T00:00:00Z',
      },
      'Unused credits expire Sep 15, 2026.',
    ],
    [
      { capability_type: 'counter.occupancy', earliest_expiry: '2026-09-15T00:00:00Z' },
      'Ends Sep 15, 2026.',
    ],
    [
      { resets_at: '2026-09-01T00:00:00Z', earliest_expiry: '2026-09-15T00:00:00Z' },
      'Resets Sep 1, 2026.',
    ],
  ] as const)('notes what the figures leave out (%#)', (overrides, note) => {
    const subject = item(overrides as Partial<UsageItem>);
    render(<UsageTable items={[subject]} />);
    const hint = screen.getByRole('button', { name: /^About / });
    expect(hint).toHaveAccessibleDescription(note);
  });

  it('carries no note when nothing is reserved and no date applies', () => {
    render(<UsageTable items={[item({ key: 'project_slots' }), item()]} />);
    expect(screen.queryByRole('button', { name: /^About / })).toBeNull();
    expect(screen.getAllByRole('meter')).toHaveLength(2);
  });
});
