import type { ReactNode } from 'react';

import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
  TableRowHeader,
} from '@/components/ui/table';
import { Absence } from '@/components/ui/absence';
import { Tooltip } from '@/components/ui/tooltip';
import { textRole } from '@/components/ui/typography';
import { absenceOf } from '@/lib/format';
import { cn } from '@/lib/utils';

/** A heat tint from 0 (low) to 1 (high): the accent washed in up to half strength, as `HeatValue`. */
const heat = (place: number) =>
  `color-mix(in srgb, var(--color-accent) ${Math.round(4 + 46 * Math.min(1, Math.max(0, place)))}%, var(--color-surface))`;
const HATCH = 'repeating-linear-gradient(135deg, transparent 0 6px, var(--color-rule) 6px 7px)';

export type HeatValue =
  | { kind: 'value'; text: string; detail: string; tint: number }
  /** Not run, too few, not measured: hatched, never tinted as a value. */
  | { kind: 'void'; label: string };

type HeatTableProps = Readonly<{
  labelledBy: string;
  corner: string;
  columns: readonly { key: string; header: ReactNode }[];
  rows: readonly { key: string; header: ReactNode; cells: readonly HeatValue[] }[];
}>;

/**
 * HeatTable — a matrix of figures: row labels in a fixed column, then one
 * centred column per item, each cell a heat-tinted value over its basis.
 */
export function HeatTable({ labelledBy, corner, columns, rows }: HeatTableProps) {
  return (
    <Table fixed ariaLabelledBy={labelledBy}>
      <TableHeader>
        <TableRow>
          <TableHead className="w-40">{corner}</TableHead>
          {columns.map((column) => (
            <TableHead key={column.key} className="text-center">
              {column.header}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.key}>
            <TableRowHeader>{row.header}</TableRowHeader>
            {row.cells.map((cell, index) => (
              <td key={columns[index]?.key ?? index} className="p-0.5 text-center">
                {cell.kind === 'void' ? (
                  <div
                    className="rounded-mark flex min-h-10 flex-col items-center justify-center"
                    style={{ backgroundImage: HATCH }}
                  >
                    <i className={textRole('caption')}>
                      <Absence state={absenceOf(cell.label) ?? 'not_measured'} label={cell.label} />
                    </i>
                  </div>
                ) : (
                  <div
                    className="rounded-mark flex min-h-10 flex-col items-center justify-center"
                    style={{ background: heat(cell.tint) }}
                  >
                    <span className={textRole('label', 'tabular-nums')}>{cell.text}</span>
                    <span className={textRole('caption')}>{cell.detail}</span>
                  </div>
                )}
              </td>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** The heat table's foot: a note, then the Low → High tint scale. */
export function HeatScale({ note }: Readonly<{ note: string }>) {
  return (
    <div className={textRole('caption', 'flex items-center gap-2')}>
      <span className="flex-1">{note}</span>
      <span>Low</span>
      <i
        aria-hidden
        className="h-1.5 w-30 rounded-full"
        style={{ background: `linear-gradient(90deg, ${heat(0)}, ${heat(1)})` }}
      />
      <span>High</span>
    </div>
  );
}

export type RankChip = { key: string; mark: ReactNode; name: string; detail: string; own: boolean };

/**
 * RankTable — each segment's leaders as chips in place columns; your own chip
 * takes the accent wash. A segment without leaders reads `empty` across.
 */
export function RankTable({
  labelledBy,
  corner,
  places,
  rows,
}: Readonly<{
  labelledBy: string;
  corner: string;
  places: number;
  rows: readonly { key: string; header: ReactNode; chips: readonly RankChip[]; empty: ReactNode }[];
}>) {
  const columns = Array.from({ length: places }, (_, index) => index);
  return (
    <Table fixed ariaLabelledBy={labelledBy}>
      <TableHeader>
        <TableRow>
          <TableHead className="w-54">{corner}</TableHead>
          {columns.map((index) => (
            <TableHead key={index} className="text-center">
              #{index + 1}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.key}>
            <TableRowHeader>{row.header}</TableRowHeader>
            {row.chips.length === 0 ? (
              <td colSpan={places} className="p-1 text-center">
                {row.empty}
              </td>
            ) : (
              columns.map((index) => {
                const chip = row.chips[index];
                return (
                  <td key={chip?.key ?? index} className="p-1">
                    {chip ? (
                      <div
                        className={cn(
                          'rounded-mark flex h-[var(--control-md)] items-center justify-center gap-1 overflow-hidden px-2 whitespace-nowrap',
                          chip.own
                            ? textRole('captionStrong', 'bg-accent-wash text-accent-text')
                            : textRole('caption', 'bg-well text-ink'),
                        )}
                      >
                        {chip.mark}
                        <span className="min-w-0 truncate">{chip.name}</span>
                        <span className="opacity-80">{chip.detail}</span>
                      </div>
                    ) : null}
                  </td>
                );
              })
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** The rank table's key: other brands on the well, yours on the accent wash. */
export function RankLegend() {
  return (
    <div className={textRole('caption', 'flex items-center gap-4')}>
      <span className="inline-flex items-center gap-2">
        <i aria-hidden className="rounded-mark bg-well size-2.5" />
        <span>Other brands</span>
      </span>
      <span className="inline-flex items-center gap-2">
        <i aria-hidden className="rounded-mark bg-accent-wash size-2.5" />
        <span>Your brand</span>
      </span>
    </div>
  );
}

/**
 * An axis label: a leading mark, the text cut to one line, then a trailing tag
 * or a faint note whose tooltip explains it ("· renamed").
 */
export function AxisItemLabel({
  lead,
  text,
  trail,
  note,
}: Readonly<{
  lead?: ReactNode;
  text: string;
  trail?: ReactNode;
  note?: { label: string; tip: string };
}>) {
  return (
    <span className="inline-flex max-w-full min-w-0 items-center gap-2">
      {lead}
      <span className="min-w-0 truncate">{text}</span>
      {trail}
      {note ? (
        <Tooltip content={note.tip}>
          <button type="button" className={textRole('caption', 'whitespace-nowrap')}>
            {note.label}
          </button>
        </Tooltip>
      ) : null}
    </span>
  );
}
