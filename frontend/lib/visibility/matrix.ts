/**
 * Display helpers for the Insights performance matrix. Values are projected
 * from the read, never recomputed; a cell keeps not run, too few and not
 * measured apart, and only a measured value takes a heat tint.
 */
import type {
  MatrixCell,
  MatrixDimension,
  MatrixPair,
  VisibilityMatrix,
} from '@citeladder/contracts/visibility-matrix';
import type { MATRIX_METRICS } from '@/lib/config/visibility';
import { formatPositionExact, formatRate } from '@/lib/visibility/dashboard';
import { sentimentReading } from '@/lib/visibility/perception';

export type MatrixMetric = (typeof MATRIX_METRICS)[number]['value'];

export type CellReading =
  | { kind: 'not_run' }
  | { kind: 'too_few'; answers: number }
  | { kind: 'not_measured'; answers: number }
  | { kind: 'value'; value: number; text: string; answers: number };

const ORDER: readonly MatrixDimension[] = ['engine', 'topic', 'market', 'brand'];

/** The cell of row item `row` against column item `column`, whichever pair order the read stores. */
export function cellAt(
  grids: VisibilityMatrix['grids'],
  axes: { rows: MatrixDimension; columns: MatrixDimension },
  row: number,
  column: number,
): MatrixCell | undefined {
  const flipped = ORDER.indexOf(axes.rows) > ORDER.indexOf(axes.columns);
  const [first, second] = flipped ? [axes.columns, axes.rows] : [axes.rows, axes.columns];
  const grid = grids[pairKey(first, second)];
  return flipped ? grid?.[column]?.[row] : grid?.[row]?.[column];
}

function pairKey(first: MatrixDimension, second: MatrixDimension): MatrixPair {
  const key = `${first}_${second}`;
  switch (key) {
    case 'engine_topic':
    case 'engine_market':
    case 'engine_brand':
    case 'topic_market':
    case 'topic_brand':
    case 'market_brand':
      return key;
    default:
      throw new Error(`no matrix pair ${key}`);
  }
}

export function cellReading(cell: MatrixCell | undefined, metric: MatrixMetric): CellReading {
  if (!cell || cell.kind === 'not_run') return { kind: 'not_run' };
  const { answers } = cell;
  if (metric === 'sentiment') {
    const reading = sentimentReading(cell.sentiment);
    if (reading.kind === 'too_few') return { kind: 'too_few', answers };
    const net = cell.sentiment?.net_sentiment ?? null;
    if (reading.kind !== 'value' || net === null) return { kind: 'not_measured', answers };
    return { kind: 'value', value: net, text: reading.net, answers };
  }
  const value = cell[metric];
  if (value === null) return { kind: 'not_measured', answers };
  const text = metric === 'avg_position' ? formatPositionExact(value) : formatRate(value);
  return { kind: 'value', value, text, answers };
}

/**
 * Each value's place from low (0) to high (1) among the values shown, so the
 * tint compares cells on screen. A lower position is better, so it reads high.
 */
export function heatScale(values: readonly number[], metric: MatrixMetric) {
  const low = Math.min(...values);
  const high = Math.max(...values);
  return (value: number) => {
    const place = high > low ? (value - low) / (high - low) : 1;
    return metric === 'avg_position' ? 1 - place : place;
  };
}

/** The matrix on screen as CSV rows: row label, column label, value, answers. */
export function matrixCsvRows(
  readings: readonly (readonly CellReading[])[],
  rowLabels: readonly string[],
  columnLabels: readonly string[],
): (string | number)[][] {
  return readings.flatMap((row, i) =>
    row.map((reading, j) => [
      rowLabels[i] ?? '',
      columnLabels[j] ?? '',
      reading.kind === 'value' ? reading.text : READING_LABELS[reading.kind],
      reading.kind === 'not_run' ? '' : reading.answers,
    ]),
  );
}

export const READING_LABELS = {
  not_run: 'Not run',
  too_few: 'Too few',
  not_measured: 'Not measured',
} as const;
