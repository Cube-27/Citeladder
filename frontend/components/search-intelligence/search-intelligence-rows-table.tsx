import type { DataTableColumn } from '@/components/ui/data-table';
import { Pressable } from '@/components/ui/pressable';
import { TextLink } from '@/components/ui/text-link';
import { ClampText } from '@/components/ui/clamp-text';
import { TableCell, TableRow, UrlText } from '@/components/ui/table';
import type { SearchIntelligenceRow } from '@/lib/api/search-intelligence';
import { SEARCH_COLUMNS_BY_KIND, type SearchColumn } from '@/lib/config/search-intelligence';
import { Absence } from '@/components/ui/absence';
import { sharedOrigin } from '@/lib/format';
import { SearchValue } from './search-intelligence-value';

function cellText(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.length ? value.join(', ') : null;
  if (typeof value === 'number') return String(value);
  return typeof value === 'string' ? value : null;
}

/** Fields that hold a page address: one line, the path's tail kept, without the column's shared origin. */
const URL_FIELDS: ReadonlySet<string> = new Set(['url', 'url_from']);

function displayValue(row: SearchIntelligenceRow, column: SearchColumn, origin: string | null) {
  const result = row[column.field];
  if (column.currencyField)
    return <SearchValue value={result} currency={cellText(row[column.currencyField])} />;
  if (column.numeric) return <SearchValue value={result} />;
  if (URL_FIELDS.has(column.field) && typeof result === 'string' && result)
    return <UrlText url={result} origin={origin} />;
  return cellText(result) ?? <Absence />;
}

function columnsFor(kind: string) {
  return SEARCH_COLUMNS_BY_KIND[kind] ?? SEARCH_COLUMNS_BY_KIND.footprint;
}

/** Text columns that hold one short word ("commercial", "Yes"), not a name. */
const SHORT_TEXT_FIELDS: ReadonlySet<string> = new Set(['intent', 'dofollow']);

/**
 * What a column holds: the first is the row's identity (the keyword, query,
 * page or domain); a page address is a url; a one-word field a status.
 */
function columnKind(column: SearchColumn, first: boolean): DataTableColumn['kind'] {
  if (first) return URL_FIELDS.has(column.field) ? 'url' : 'identity';
  if (column.numeric) return 'number';
  if (URL_FIELDS.has(column.field)) return 'url';
  return SHORT_TEXT_FIELDS.has(column.field) ? 'status' : 'text';
}

/**
 * Figures take the figure width, so the identity and the columns before the
 * low-priority tail (CPC, difficulty, intent) fit the main column at 982; the
 * tail hides where the frame has no room. A second text column is a name.
 */
function columnWidth(column: SearchColumn, first: boolean): DataTableColumn['width'] {
  if (first || URL_FIELDS.has(column.field)) return 'flex';
  if (column.numeric) return 'figure';
  return SHORT_TEXT_FIELDS.has(column.field) ? 'status' : 'name';
}

/**
 * A dataset kind's columns for the shared `DataTable`: every column but a
 * detail one sorts on the server.
 */
export function searchIntelligenceColumns({
  kind,
  order,
  onSort,
}: Readonly<{
  kind: string;
  order: { sort: string; direction: 'asc' | 'desc' };
  onSort: (sort: string) => void;
}>): DataTableColumn[] {
  return columnsFor(kind).map((column, index) => ({
    key: column.field,
    label: column.label,
    kind: columnKind(column, index === 0),
    width: columnWidth(column, index === 0),
    ...(column.low ? { priority: 'low' as const } : {}),
    sort: column.detail
      ? undefined
      : {
          active: order.sort === column.field,
          descending: order.direction === 'desc',
          onSort: () => onSort(column.field),
        },
  }));
}

/** One page of saved rows; the first cell opens the row's evidence. */
export function SearchIntelligenceRows({
  kind,
  rows,
  onSelect,
}: Readonly<{
  kind: string;
  rows: SearchIntelligenceRow[];
  onSelect: (row: SearchIntelligenceRow) => void;
}>) {
  const columns = columnsFor(kind);
  const origins = new Map(
    columns
      .filter((column) => URL_FIELDS.has(column.field))
      .map((column) => [
        column.field,
        sharedOrigin(rows.flatMap((row) => cellText(row[column.field]) ?? [])),
      ]),
  );
  return rows.map((row) => (
    <TableRow key={row.id}>
      {columns.map((column) => (
        <TableCell key={column.field} numeric={column.numeric}>
          {column === columns[0] ? (
            <TextLink asChild text="body" underline="hover">
              <Pressable
                type="button"
                className="flex max-w-full min-w-0 text-left"
                aria-label={`View evidence for ${row.keyword || row.domain || row.url}`}
                onClick={() => onSelect(row)}
              >
                {/* The row's identity keeps its host: a backlink's source site is the finding. */}
                {URL_FIELDS.has(column.field) ? (
                  displayValue(row, column, null)
                ) : (
                  <ClampText>{displayValue(row, column, null)}</ClampText>
                )}
              </Pressable>
            </TextLink>
          ) : (
            displayValue(row, column, origins.get(column.field) ?? null)
          )}
        </TableCell>
      ))}
    </TableRow>
  ));
}
