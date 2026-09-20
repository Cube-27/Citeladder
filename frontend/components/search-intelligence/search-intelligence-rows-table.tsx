import type { Dispatch, SetStateAction } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Pressable } from '@/components/ui/pressable';
import { Checkbox } from '@/components/ui/checkbox';
import { sortIndicator } from '@/components/ui/sort-indicator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { SearchIntelligenceRow } from '@/lib/api/search-intelligence';
import { SEARCH_HANDOFF_MAX_ROWS } from '@/lib/config/search-intelligence';
import { formatSearchNumber } from './search-intelligence-format';

type Column = { field: keyof SearchIntelligenceRow; label: string; numeric?: boolean };
const columnsByKind: Record<string, Column[]> = {
  footprint: [
    { field: 'keyword', label: 'Keyword' },
    { field: 'search_volume', label: 'Volume', numeric: true },
    { field: 'difficulty', label: 'Difficulty', numeric: true },
    { field: 'intent', label: 'Intent' },
    { field: 'dataforseo_rank', label: 'DataForSEO rank', numeric: true },
  ],
  ranking_keywords: [
    { field: 'keyword', label: 'Keyword' },
    { field: 'rank_group', label: 'Position', numeric: true },
    { field: 'search_volume', label: 'Volume', numeric: true },
    { field: 'url', label: 'Ranking page' },
    { field: 'etv', label: 'Est. traffic', numeric: true },
  ],
  keyword_suggestions: [
    { field: 'keyword', label: 'Keyword' },
    { field: 'search_volume', label: 'Volume', numeric: true },
    { field: 'difficulty', label: 'Difficulty', numeric: true },
    { field: 'intent', label: 'Intent' },
  ],
  missing_keywords: [
    { field: 'keyword', label: 'Missing keyword' },
    { field: 'owned_rank_group', label: 'Owned rank', numeric: true },
    { field: 'rank_group', label: 'Competitor rank', numeric: true },
    { field: 'search_volume', label: 'Volume', numeric: true },
    { field: 'difficulty', label: 'Difficulty', numeric: true },
  ],
  shared_keywords: [
    { field: 'keyword', label: 'Shared keyword' },
    { field: 'owned_rank_group', label: 'Owned rank', numeric: true },
    { field: 'rank_group', label: 'Competitor rank', numeric: true },
    { field: 'search_volume', label: 'Volume', numeric: true },
  ],
  referring_domains: [
    { field: 'domain', label: 'Referring domain' },
    { field: 'backlinks', label: 'Backlinks', numeric: true },
    { field: 'dataforseo_rank', label: 'DataForSEO rank', numeric: true },
  ],
  destination_pages: [
    { field: 'url', label: 'Destination page' },
    { field: 'backlinks', label: 'Backlinks', numeric: true },
    { field: 'referring_main_domains', label: 'Referring domains', numeric: true },
    { field: 'dataforseo_rank', label: 'DataForSEO rank', numeric: true },
  ],
  citation_matches: [
    { field: 'domain', label: 'Cited domain' },
    { field: 'url', label: 'Cited URL' },
  ],
};

function displayValue(row: SearchIntelligenceRow, column: Column) {
  const result = row[column.field];
  if (column.numeric) return formatSearchNumber(result);
  if (result === null || result === undefined || result === '')
    return <span className="value-placeholder">Not measured</span>;
  return typeof result === 'object' ? JSON.stringify(result) : String(result);
}

export function SearchIntelligenceRowsTable({
  kind,
  rows: visibleRows,
  selectable,
  selectedEvidence,
  setSelectedEvidence,
  order,
  onSort,
  onSelect,
}: Readonly<{
  kind: string;
  rows: SearchIntelligenceRow[];
  selectable: boolean;
  selectedEvidence: Record<string, SearchIntelligenceRow>;
  setSelectedEvidence: Dispatch<SetStateAction<Record<string, SearchIntelligenceRow>>>;
  order: { sort: string; direction: 'asc' | 'desc' };
  onSort: (sort: string) => void;
  onSelect: (row: SearchIntelligenceRow) => void;
}>) {
  const columns = columnsByKind[kind] ?? columnsByKind.footprint;
  const selectedCount = Object.keys(selectedEvidence).length;
  return (
    <Table className="min-w-[900px] table-fixed">
      <colgroup>
        {selectable ? <col className="w-14" /> : null}
        {columns.map((column) => (
          <col key={column.field} className={column.numeric ? 'w-32' : undefined} />
        ))}
      </colgroup>
      <TableHeader>
        <TableRow>
          {selectable ? (
            <TableHead className="text-center">
              <Checkbox
                aria-label="Select current page"
                checked={
                  visibleRows.length > 0 &&
                  visibleRows.every((row) => Boolean(selectedEvidence[row.id]))
                }
                disabled={!visibleRows.length}
                onCheckedChange={() =>
                  setSelectedEvidence((current) => {
                    const next = { ...current };
                    if (visibleRows.every((row) => Boolean(next[row.id]))) {
                      visibleRows.forEach((row) => {
                        delete next[row.id];
                      });
                    } else {
                      visibleRows.forEach((row) => {
                        if (Object.keys(next).length < SEARCH_HANDOFF_MAX_ROWS) next[row.id] = row;
                      });
                    }
                    return next;
                  })
                }
              />
            </TableHead>
          ) : null}
          {columns.map((column) => (
            <SortableHead
              key={column.field}
              column={column}
              active={order.sort === column.field}
              descending={order.direction === 'desc'}
              onSort={() => onSort(column.field)}
            />
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {visibleRows.map((row) => (
          <TableRow key={row.id}>
            {selectable ? (
              <TableCell className="text-center">
                <Checkbox
                  aria-label={`Select evidence row ${row.id}`}
                  checked={Boolean(selectedEvidence[row.id])}
                  disabled={selectedCount >= SEARCH_HANDOFF_MAX_ROWS && !selectedEvidence[row.id]}
                  onCheckedChange={() =>
                    setSelectedEvidence((current) => {
                      if (current[row.id]) {
                        const next = { ...current };
                        delete next[row.id];
                        return next;
                      }
                      return { ...current, [row.id]: row };
                    })
                  }
                />
              </TableCell>
            ) : null}
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
            <TableCell colSpan={columns.length + (selectable ? 1 : 0)}>
              No saved rows match this view.
            </TableCell>
          </TableRow>
        ) : null}
      </TableBody>
    </Table>
  );
}

function SortableHead({
  column,
  active,
  descending,
  onSort,
}: Readonly<{
  column: Column;
  active: boolean;
  descending: boolean;
  onSort: () => void;
}>) {
  const { ariaSort, icon: Icon } = sortIndicator(active, descending, {
    ascending: ArrowUp,
    descending: ArrowDown,
    inactive: ArrowUpDown,
  });
  return (
    <TableHead numeric={column.numeric} aria-sort={ariaSort}>
      <Button
        variant="ghost"
        size="sm"
        onClick={onSort}
        className={column.numeric ? 'w-full justify-center' : 'w-full justify-start'}
      >
        <span className="truncate">{column.label}</span>
        <Icon className="size-4 shrink-0" aria-hidden />
      </Button>
    </TableHead>
  );
}
