import type { ReactNode } from 'react';

import {
  MarkerMark,
  SERIES_FILL,
  SERIES_STROKE,
  type MarkerShape,
  type SeriesTone,
} from '@/components/ui/step-chart-parts';
import { SHEET_FACE } from '@/components/ui/slip';
import { textRole } from '@/components/ui/typography';
import { cn } from '@/lib/utils';

/** The plot heights a chart may take: 160, 240 and 320. */
const FRAME_HEIGHT = {
  sm: 'min-h-[var(--chart-height-sm)]',
  md: 'min-h-[var(--chart-height-md)]',
  lg: 'min-h-[var(--chart-height-lg)]',
} as const;

export type FrameHeight = keyof typeof FRAME_HEIGHT;

/**
 * ChartFrame — the box every chart and every state standing in for it share
 *: the height role as a floor, so loading, a
 * read error or an empty selection hold the plot's footprint, and the text
 * summary assistive technology reads instead of the drawing. A drawing sized
 * by its own rows (a distribution of MeterRows) passes no `height`.
 */
export function ChartFrame({
  height,
  summary,
  children,
}: Readonly<{
  height?: FrameHeight;
  /** One or two sentences: what the chart shows and where it ends. */
  summary?: string;
  children: ReactNode;
}>) {
  return (
    <div
      data-chart-frame={height ?? 'auto'}
      className={cn('grid min-w-0 *:min-w-0', height && FRAME_HEIGHT[height])}
    >
      {summary ? <p className="sr-only">{summary}</p> : null}
      {children}
    </div>
  );
}

/** A series' key mark: a 12 × 2 rule in its ink, with its marker shape when it has one. */
export function SeriesSwatch({ tone, shape }: Readonly<{ tone: SeriesTone; shape?: MarkerShape }>) {
  if (shape)
    return (
      <svg
        aria-hidden
        width={16}
        height={10}
        viewBox="0 0 16 10"
        className="shrink-0 overflow-visible"
      >
        <line x1={0} x2={16} y1={5} y2={5} strokeWidth={2} className={SERIES_STROKE[tone]} />
        <MarkerMark
          x={8}
          y={5}
          shape={shape}
          className={cn(SERIES_STROKE[tone], tone === 'you' ? SERIES_FILL[tone] : 'fill-surface')}
        />
      </svg>
    );
  return (
    <span
      aria-hidden
      className={cn('rounded-mark inline-block h-0.5 w-3 shrink-0', SERIES_FILL[tone])}
    />
  );
}

export type KeyEntry = Readonly<{
  name: string;
  tone: SeriesTone;
  shape?: MarkerShape;
  value?: string;
}>;

/**
 * A chart's key, only when end labels would collide: one wrapping row of
 * swatch, name and latest value. Hidden from assistive technology, which
 * reads the chart's summary and table.
 */
export function ChartKey({
  entries,
  eventsLabel,
}: Readonly<{ entries: readonly KeyEntry[]; eventsLabel?: string }>) {
  const item = textRole(
    'caption',
    'inline-flex max-w-[min(100%,20rem)] min-w-0 items-center gap-2',
  );
  return (
    <ul aria-hidden className="flex min-w-0 flex-wrap gap-x-6 gap-y-2">
      {entries.map((entry) => (
        <li key={entry.name} className={item}>
          <SeriesSwatch tone={entry.tone} shape={entry.shape} />
          <span className="min-w-0 truncate" title={entry.name}>
            {entry.name}
          </span>
          {entry.value === undefined ? null : (
            <span className="type-data-sm text-ink shrink-0">{entry.value}</span>
          )}
        </li>
      ))}
      {eventsLabel ? (
        <li className={item}>
          <span aria-hidden className="bg-ink inline-block h-3 w-px shrink-0" />
          {eventsLabel}
        </li>
      ) : null}
    </ul>
  );
}

/** The tooltip: a sheet with the point's label and one mono value per series. */
export function ChartTipSheet({
  title,
  left,
  top,
  rows,
  note,
}: Readonly<{
  title: string;
  left: number;
  top: number;
  rows: readonly KeyEntry[];
  note?: string;
}>) {
  return (
    <div
      aria-hidden
      className={cn(
        SHEET_FACE,
        'rounded-sheet pointer-events-none absolute z-20 flex w-54 flex-col gap-1 p-3',
      )}
      style={{ left, top }}
    >
      <p className="type-data-sm text-ink-2">{title}</p>
      {rows.map((row) => (
        <div key={row.name} className={textRole('caption', 'flex items-center gap-2 text-ink')}>
          <SeriesSwatch tone={row.tone} />
          <span className="min-w-0 flex-1 truncate">{row.name}</span>
          <span className="type-data-sm">{row.value}</span>
        </div>
      ))}
      {note ? <p className={textRole('caption')}>{note}</p> : null}
    </div>
  );
}

/**
 * Every value of a chart, and every drawn marker, for a reader who cannot see
 * the plot: one row per series, values right-aligned under right-aligned heads.
 */
export function ChartTable({
  label,
  columns,
  rows,
  notes,
}: Readonly<{
  label: string;
  columns: readonly string[];
  rows: readonly Readonly<{ name: string; values: readonly string[] }>[];
  notes: readonly string[];
}>) {
  return (
    <div className="sr-only">
      <table>
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col">Series</th>
            {columns.map((column, index) => (
              <th key={`${column}-${index}`} scope="col" className="text-right">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name}>
              <th scope="row">{row.name}</th>
              {row.values.map((value, index) => (
                <td key={`${columns[index]}-${index}`} className="text-right tabular-nums">
                  {value}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {notes.length ? (
        <ul aria-label={`${label}: marked`}>
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
