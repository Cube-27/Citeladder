import { Pressable } from '@/components/ui/pressable';
import {
  SortableTableHead,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { SearchIntelligenceRow } from '@/lib/api/search-intelligence';
import { SEARCH_COLUMNS_BY_KIND, type SearchColumn } from '@/lib/config/search-intelligence';
import { formatSearchNumber } from './search-intelligence-format';

function displayValue(row: SearchIntelligenceRow, column: SearchColumn) {
  const result = row[column.field];
  if (column.numeric) return formatSearchNumber(result, column.precision ?? 0);
  if (result === null || result === undefined || result === '')
    return <span className="value-placeholder">Not measured</span>;
  return typeof result === 'object' ? JSON.stringify(result) : String(result);
}

export function SearchIntelligenceRowsTable({
  kind,
  rows: visibleRows,
  order,
  onSort,
  onSelect,
}: Readonly<{
  kind: string;
  rows: SearchIntelligenceRow[];
  order: { sort: string; direction: 'asc' | 'desc' };
  onSort: (sort: string) => void;
  onSelect: (row: SearchIntelligenceRow) => void;
}>) {
  const columns = SEARCH_COLUMNS_BY_KIND[kind] ?? SEARCH_COLUMNS_BY_KIND.footprint;
  return (
    <Table minWidth={kind === 'ranking_keywords' ? 'xl' : 'lg'} className="table-fixed">
      <colgroup>
        {columns.map((column) => (
          <col key={column.field} className={column.numeric ? 'w-28' : 'w-48'} />
        ))}
      </colgroup>
      <TableHeader>
        <TableRow>
          {columns.map((column) =>
            column.detail ? (
              <TableHead key={column.field} numeric={column.numeric}>
                {column.label}
              </TableHead>
            ) : (
              <SortableTableHead
                key={column.field}
                label={column.label}
                numeric={column.numeric}
                active={order.sort === column.field}
                descending={order.direction === 'desc'}
                onSort={() => onSort(column.field)}
              />
            ),
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {visibleRows.map((row) => (
          <TableRow key={row.id}>
            {columns.map((column) => (
              <TableCell
                key={column.field}
                numeric={column.numeric}
                className="truncate"
                title={String(row[column.field] ?? '')}
              >
                {column === columns[0] ? (
                  <Pressable
                    type="button"
                    className="focus-ring text-accent-text block max-w-full truncate text-left"
                    aria-label={`View evidence for ${row.keyword || row.domain || row.url}`}
                    onClick={() => onSelect(row)}
                  >
                    {displayValue(row, column)}
                  </Pressable>
                ) : (
                  displayValue(row, column)
                )}
              </TableCell>
            ))}
          </TableRow>
        ))}
        {!visibleRows.length ? (
          <TableRow>
            <TableCell colSpan={columns.length}>No saved rows match this view.</TableCell>
          </TableRow>
        ) : null}
      </TableBody>
    </Table>
  );
}
