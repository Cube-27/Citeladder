import { BrandMark } from '@/components/ui/brand-mark';
import { Inline } from '@/components/ui/layout';
import { TableCell, TableCellLines } from '@/components/ui/table';
import { Absence } from '@/components/ui/absence';
import type { SortState, SourcesData } from '@/lib/visibility/sources';

/** The source's own mark and name, with the favicon a reader recognises first. */
export function SourceName({
  name,
  host,
  secondary,
}: Readonly<{ name: string; host: string | null; secondary?: string | null }>) {
  return (
    <Inline as="span">
      <BrandMark name={name} websiteUrl={host ? `https://${host}` : null} />
      <TableCellLines primary={name} secondary={secondary} />
    </Inline>
  );
}

/**
 * A numeric cell that marks an absent value rather than spelling it out.
 *
 * The formatters answer `null` for "nothing to show"; deciding what that MEANS
 * is the table's job, and every numeric column here means the same thing by it.
 * The reason is said once, on the column header, instead of once per row --
 * see `Absence` for why the mark is not simply blank.
 */
export function NumericCell({
  value,
  desktopOnly,
}: Readonly<{ value: string | null; desktopOnly?: boolean }>) {
  return (
    <TableCell numeric desktopOnly={desktopOnly}>
      {value ?? <Absence />}
    </TableCell>
  );
}

/**
 * A Retrieved cell. Null means no answer in the selection exposed what it
 * read, which is "Unavailable", never a read of zero.
 */
export function RetrievedCell({ value }: Readonly<{ value: string | null }>) {
  return (
    <TableCell numeric>
      {value ?? (
        <Absence
          state="unavailable"
          reason="No answer in this selection exposes the pages it read."
        />
      )}
    </TableCell>
  );
}

/** The Retrieved header's explanation, naming the engines whose reads are unknown. */
export function retrievedHint(
  base: string,
  retrieval: SourcesData['retrieval'] | undefined,
  engineLabel: (key: string) => string,
) {
  const unavailable = retrieval?.unavailable_engines ?? [];
  if (!unavailable.length) return base;
  return `${base} Not available for ${unavailable.map((key) => engineLabel(key)).join(', ')}, which do not expose the pages they read.`;
}

/** One sortable column's header state, from the table's single sort. */
export function sortProps(sort: SortState, onSort: (column: string) => void, column: string) {
  return {
    active: sort?.column === column,
    descending: sort?.direction === 'desc',
    onSort: () => onSort(column),
  };
}
