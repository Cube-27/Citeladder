'use client';

import { Info } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardEyebrow,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { CoPlacementMatrix } from '@/lib/products/catalog';

/**
 * Visibility › Co-placement sub-tab: answer executions where one of the
 * project's products and a competitor product appear in the same product
 * list. A real matrix — every competitor is a `<th scope="col">`, every own
 * product a `<th scope="row">`, and each cell is the persisted co-placement
 * count (`—` when the pair never co-appeared). The backend's truncation flag
 * surfaces as a header badge plus a notice; values are never color-carried.
 */
export function CompetitorCoPlacementMatrix({ matrix }: Readonly<{ matrix: CoPlacementMatrix }>) {
  const empty = matrix.rows.length === 0 || matrix.columns.length === 0;
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="grid gap-1">
          <CardEyebrow>Competitor products listed alongside yours</CardEyebrow>
          <CardTitle>Co-placement</CardTitle>
          <CardDescription>
            Answer executions where both products appear in the same product list.
          </CardDescription>
        </div>
        {matrix.truncated ? (
          <Badge variant="status" value="warning">
            Truncated
          </Badge>
        ) : null}
      </CardHeader>
      <CardContent className="p-0">
        {empty ? (
          <p className="text-secondary p-[var(--card-padding)] text-sm">
            No competitor co-placement measured in the selected run.
          </p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[200px]">Your product</TableHead>
                  {matrix.columns.map((column) => (
                    <TableHead key={column.key} scope="col" className="min-w-[140px]">
                      <span className="block truncate">{column.productName}</span>
                      <span className="text-muted block truncate text-xs font-normal">
                        {column.competitorName}
                      </span>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {matrix.rows.map((row) => (
                  <TableRow key={row.key}>
                    <TableHead scope="row" className="max-w-[280px] min-w-[200px] font-medium">
                      <span className="text-foreground block truncate">{row.productName}</span>
                      <span className="text-muted block truncate text-xs font-normal">
                        {row.sku}
                      </span>
                    </TableHead>
                    {row.cells.map((count, index) => (
                      <TableCell
                        key={matrix.columns[index]?.key ?? index}
                        numeric
                        className="text-secondary"
                      >
                        {count === null ? <span className="text-subtle">—</span> : count}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {matrix.truncated ? (
              <div className="border-border-subtle text-muted flex items-center gap-2 border-t px-4 py-2.5 text-xs">
                <Info className="size-3.5 shrink-0" aria-hidden />
                <span>
                  Showing the most frequent competitor pairs for this run — less frequent pairs are
                  truncated.
                </span>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
