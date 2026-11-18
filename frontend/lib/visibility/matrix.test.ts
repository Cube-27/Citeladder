import { describe, expect, it } from 'vitest';

import type { MatrixCell, VisibilityMatrix } from '@citeladder/contracts/visibility-matrix';
import { cellAt, cellReading, matrixCsvRows } from './matrix';

const measured = (over: Partial<Extract<MatrixCell, { kind: 'measured' }>>): MatrixCell => ({
  kind: 'measured',
  answers: 12,
  mention_rate: 0.25,
  share_of_voice: 0.1,
  avg_position: null,
  win_rate: null,
  sentiment: null,
  ...over,
});

const empty: MatrixCell[][] = [];
// engine_brand[engine][brand]: two engines by two brands.
const grids: VisibilityMatrix['grids'] = {
  engine_topic: empty,
  engine_market: empty,
  engine_brand: [
    [measured({ mention_rate: 0.5 }), measured({ mention_rate: 0.2 })],
    [{ kind: 'not_run' }, measured({ mention_rate: 0.4 })],
  ],
  topic_market: empty,
  topic_brand: empty,
  market_brand: empty,
};

describe('performance matrix cells', () => {
  it('reads the same cell whichever axis holds the rows', () => {
    const byEngine = cellAt(grids, { rows: 'engine', columns: 'brand' }, 1, 0);
    const byBrand = cellAt(grids, { rows: 'brand', columns: 'engine' }, 0, 1);
    expect([byEngine, byBrand]).toEqual([{ kind: 'not_run' }, { kind: 'not_run' }]);
    expect(cellAt(grids, { rows: 'brand', columns: 'engine' }, 1, 0)).toMatchObject({
      mention_rate: 0.2,
    });
  });

  it('keeps not run, too few and not measured apart from a value', () => {
    const fewClassified = {
      mentions: 9,
      classified: 4,
      positive: 3,
      negative: 1,
      net_sentiment: 50,
    };
    const enough = { mentions: 30, classified: 25, positive: 15, negative: 5, net_sentiment: 40 };
    expect([
      cellReading({ kind: 'not_run' }, 'mention_rate'),
      cellReading(measured({ sentiment: fewClassified }), 'sentiment'),
      cellReading(measured({}), 'sentiment'),
      cellReading(measured({}), 'avg_position'),
      cellReading(measured({ sentiment: enough }), 'sentiment'),
      cellReading(measured({ avg_position: 2.345 }), 'avg_position'),
    ]).toEqual([
      { kind: 'not_run' },
      { kind: 'too_few', answers: 12 },
      { kind: 'not_measured', answers: 12 },
      { kind: 'not_measured', answers: 12 },
      { kind: 'value', value: 40, text: '+40', answers: 12 },
      { kind: 'value', value: 2.345, text: expect.stringMatching(/^2\.3/), answers: 12 },
    ]);
  });

  it('exports each cell as row, column, value and answers', () => {
    const readings = [
      [cellReading(measured({}), 'mention_rate'), cellReading({ kind: 'not_run' }, 'mention_rate')],
      [
        cellReading(measured({ answers: 3 }), 'avg_position'),
        cellReading({ kind: 'not_recorded' }, 'avg_position'),
      ],
    ];
    expect(matrixCsvRows(readings, ['ChatGPT', 'Gemini'], ['Acme', 'Globex'])).toEqual([
      ['ChatGPT', 'Acme', '25.0%', 12],
      ['ChatGPT', 'Globex', 'Not run', ''],
      ['Gemini', 'Acme', 'Not measured', 3],
      ['Gemini', 'Globex', 'Topic not recorded for this run', ''],
    ]);
  });
});
