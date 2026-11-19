import type { ReactNode } from 'react';

import type { EventKind } from '@/components/ui/step-chart-parts';
import { ChartTable } from '@/components/ui/chart-frame';
import { textRole } from '@/components/ui/typography';
import { Value } from '@/components/ui/value';
import { absent, type Formatted, formattedText } from '@/lib/format';

/* What a time-series chart says without drawing: its data types, its lines,
   the sentence and table a reader who cannot see it gets, and one period's rows.
   The app's AreaChart and the website's StepChart share them. */

export type TrendPoint = {
  /** The point in full ("10 Sep 2026 · run 4"): the tooltip's title and the table's column. */
  label: string;
  /** The short form under the axis, when `label` is too long to sit there. */
  axisLabel?: string;
  /** Null is a missing period: a `well` band with its word, never a drop to zero. */
  value: number | null;
  /** Measured under a changed method: marked across the plot, with its note. */
  versionChange?: { note: string } | null;
  /** When the point was measured; with every point stamped the x axis is real time. */
  timestamp?: number;
  /** Not comparable with the point before it: every line breaks here. */
  breakBefore?: boolean;
};

/** A further line read against the first: a rival, a second rate, "Other". */
export type TrendSeries = {
  label: string;
  values: readonly (number | null)[];
  /** The merged remainder, in `data-other`, so it never reads as a brand. */
  other?: boolean;
  /** Who the line is (a rival's domain), for its page-wide colour; defaults to `label`. */
  identity?: string;
  /** The brand's logo beside its name in the key and tooltip. */
  mark?: ReactNode;
};

/** Something that happened at a moment: an ink tick on the time axis with its flag. */
export type TrendEvent = { key: string; timestamp: number; label: string; kind?: EventKind };

/** The first line from `data`, then up to three further lines, each with the identity its colour follows. */
export function plottedLines({
  data,
  name,
  mark,
  series,
}: Readonly<{
  data: readonly TrendPoint[];
  name: string;
  mark: ReactNode;
  series: readonly TrendSeries[];
}>) {
  return [
    { name, mark, identity: name, values: data.map((point) => point.value), other: false },
    ...series.slice(0, 3).map((entry) => ({
      name: entry.label,
      mark: entry.mark,
      identity: entry.identity ?? entry.label,
      values: entry.values,
      other: entry.other ?? false,
    })),
  ];
}

/** A value as the chart prints it, or its absence. */
export function shownWith(format: (value: number) => string) {
  return (value: number | null | undefined): Formatted =>
    value === null || value === undefined ? absent() : format(value);
}

export type Shown = (value: number | null | undefined) => Formatted;

export function SeriesTable({
  label,
  data,
  lines,
  shown,
  eventLabels,
}: Readonly<{
  label: string;
  data: readonly TrendPoint[];
  lines: readonly Readonly<{ name: string; values: readonly (number | null)[] }>[];
  shown: Shown;
  eventLabels: readonly string[];
}>) {
  return (
    <ChartTable
      label={label}
      columns={data.map((entry) => entry.label)}
      rows={lines.map((line) => ({
        name: line.name,
        values: data.map((_, index) => formattedText(shown(line.values[index]))),
      }))}
      notes={[
        ...data.flatMap((entry) =>
          entry.versionChange
            ? [`Method changed at ${entry.label}: ${entry.versionChange.note}`]
            : [],
        ),
        ...eventLabels,
      ]}
    />
  );
}

/** Each line from its first measured point to its latest, in one sentence. */
export function summarise(
  label: string,
  data: readonly TrendPoint[],
  lines: readonly Readonly<{ name: string; values: readonly (number | null)[] }>[],
  shown: Shown,
) {
  const text = (value: number | null | undefined) => formattedText(shown(value));
  const parts = lines.flatMap((line) => {
    const first = line.values.findIndex((value) => value !== null);
    const last = lastMeasured(line.values);
    if (first < 0) return [`${line.name}: not measured`];
    return [
      `${line.name}: ${text(line.values[first])} on ${data[first]?.label ?? ''} to ${text(line.values[last])} on ${data[last]?.label ?? ''}`,
    ];
  });
  return `${label}. ${parts.join('; ')}.`;
}

/**
 * One period draws no line: each line is a compact row (name left, value
 * right) under one date for the set, and the frame drops its plot height
 * (`ChartFrame`). Over several periods the chart stays.
 */
export function SingleMeasurements({
  label,
  point,
  lines,
  format,
}: Readonly<{
  label: string;
  point: TrendPoint;
  lines: readonly Readonly<{ name: string; values: readonly (number | null)[] }>[];
  format: (value: number) => string;
}>) {
  return (
    <div data-single-measurement="" className="flex min-w-0 flex-col gap-2">
      <ul aria-label={label} className="flex min-w-0 flex-col">
        {lines.map((line) => {
          const value = line.values[0];
          return (
            <li key={line.name} className="flex min-w-0 items-center justify-between gap-4 py-1">
              <span className={textRole('body', 'text-ink-2 min-w-0 truncate')} title={line.name}>
                {line.name}
              </span>
              <Value
                className="shrink-0"
                value={value === null || value === undefined ? null : format(value)}
              />
            </li>
          );
        })}
      </ul>
      <p className={textRole('caption')}>{`Measured ${point.label}`}</p>
    </div>
  );
}

/** The index of the latest measured value, or -1. */
export function lastMeasured(values: readonly (number | null)[]) {
  for (let index = values.length - 1; index >= 0; index -= 1)
    if (values[index] !== null) return index;
  return -1;
}
