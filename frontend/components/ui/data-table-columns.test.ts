import { describe, expect, it } from 'vitest';

import { columnLayout } from './data-table-columns';

const ROW = 'tr:not([data-table-state])';

describe('columnLayout', () => {
  it('hides a column and moves the end padding to the last shown one', () => {
    const css = columnLayout({
      columns: [
        { key: 'name', label: 'Crawler' },
        { key: 'breakdown', label: 'Breakdown' },
        { key: 'seen', label: 'Seen', kind: 'number', priority: 'low' },
      ],
      hidden: [2],
      selection: true,
      scope: 't1',
    });
    expect(css.split('\n')).toEqual([
      '[data-data-table-frame="t1"] { --data-table-share: 50.000%; }',
      `[data-data-table-frame="t1"] ${ROW} > :nth-child(1) { width: calc(var(--spacing) * 10); min-width: calc(var(--spacing) * 10); padding-inline-end: calc(var(--spacing) * 2); }`,
      `[data-data-table-frame="t1"] ${ROW} > :nth-child(2) { text-align: start; width: var(--data-table-share); max-width: 0; min-width: 25ch; }`,
      `[data-data-table-frame="t1"] ${ROW} > :nth-child(3) { text-align: start; width: var(--data-table-share); max-width: 0; min-width: 25ch; padding-inline-end: calc(var(--spacing) * 4); }`,
      `[data-data-table-frame="t1"] ${ROW} > :nth-child(4) { text-align: end; width: 1px; white-space: nowrap; min-width: calc(var(--spacing) * 16); }`,
      `[data-data-table-frame="t1"] ${ROW} > :nth-child(4) > :is(.truncate, :has(.truncate)) { width: max-content; max-width: 40ch; }`,
      `[data-data-table-frame="t1"] tbody > ${ROW} > :nth-child(4) { font-variant-numeric: tabular-nums; }`,
      '[data-data-table-frame="t1"] tr:not(:has(> [colspan])) > :nth-child(4) { display: none; }',
    ]);
  });

  it('adds a gutter where a start-aligned column follows an end-aligned one', () => {
    const css = columnLayout({
      columns: [
        { key: 'visits', label: 'Visits', kind: 'number' },
        { key: 'seen', label: 'Last seen', kind: 'date' },
        { key: 'page', label: 'Page', kind: 'identity' },
      ],
      hidden: [],
      selection: false,
      scope: 't2',
    });
    expect(css).toContain(
      `[data-data-table-frame="t2"] ${ROW} > :nth-child(2) { text-align: start; width: 1px; white-space: nowrap; min-width: calc(var(--spacing) * 24); padding-inline-start: calc(var(--spacing-cell-x) + calc(var(--spacing) * 3)); }`,
    );
    expect(css).toContain(
      `[data-data-table-frame="t2"] ${ROW} > :nth-child(3) { text-align: start; width: var(--data-table-share); max-width: 0; min-width: 25ch; }`,
    );
    expect(css).toContain('--data-table-share: 100.000%;');
  });
});
