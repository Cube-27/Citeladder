import { describe, expect, it } from 'vitest';

import { columnLayout } from './data-table-columns';

describe('columnLayout', () => {
  it('hides a column and moves the end padding to the last shown one', () => {
    const { attributes, share } = columnLayout({
      columns: [
        { key: 'name', label: 'Crawler' },
        { key: 'breakdown', label: 'Breakdown' },
        { key: 'seen', label: 'Seen', kind: 'number', priority: 'low' },
      ],
      hidden: [2],
      selection: true,
    });
    expect(attributes).toEqual({
      'data-c1': 'select',
      'data-c2': 'start rest',
      'data-c3': 'start rest pad-end',
      'data-c4': 'end fixed s16 num hidden',
    });
    expect(share).toBe('50.000%');
  });

  it('encodes each column by its kind, after the selection column', () => {
    const { attributes, share } = columnLayout({
      columns: [
        { key: 'page', label: 'Page', kind: 'identity' },
        { key: 'visits', label: 'Visits', kind: 'number' },
        { key: 'seen', label: 'Last seen', kind: 'date' },
        { key: 'open', label: 'Open', kind: 'actions' },
      ],
      hidden: [],
      selection: true,
    });
    expect(attributes).toEqual({
      'data-c1': 'select',
      'data-c2': 'start rest',
      'data-c3': 'end fixed s16 num',
      'data-c4': 'start fixed s24 gutter num',
      'data-c5': 'end fixed s20',
    });
    expect(share).toBe('100.000%');
  });
});
