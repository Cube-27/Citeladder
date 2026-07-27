'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { aiSourceLabel } from '@/lib/analytics/series';
import {
  formatConversionRate,
  formatMoney,
  sourceRowKeys,
  type AttributionCurrencyBlock,
} from '@/lib/products/attribution';

/**
 * Attribution › By source: the per-`ai_source` deterministic table for one
 * ISO currency block. Each method reports in its OWN columns — A1 and A2 are
 * never summed into a combined total, and there is deliberately no footer.
 * Rows are the union of the block's A1/A2 source keys; a source measured by
 * only one method renders `—` on the other side.
 */
export function AttributionSourceTable({ block }: Readonly<{ block: AttributionCurrencyBlock }>) {
  const keys = sourceRowKeys(block);
  return (
    <Card>
      <CardHeader>
        <div className="grid gap-1">
          <CardTitle>Revenue by AI source</CardTitle>
          <CardDescription>
            Each method reported in its own columns — A1 and A2 are never summed into a combined
            total.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {keys.length === 0 ? (
          <p className="text-secondary p-[var(--card-padding)] text-sm">
            No per-source attribution rows in this window.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>AI source</TableHead>
                <TableHead>A1 revenue</TableHead>
                <TableHead>A1 orders</TableHead>
                <TableHead>A1 AOV</TableHead>
                <TableHead>A1 conversion</TableHead>
                <TableHead>A2 revenue</TableHead>
                <TableHead>A2 orders</TableHead>
                <TableHead>A2 AOV</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((key) => {
                const a1 = block.a1?.by_ai_source.find((row) => row.ai_source === key);
                const a2 = block.a2?.by_ai_source.find((row) => row.ai_source === key);
                const source = a1?.ai_source ?? a2?.ai_source;
                if (!source) return null;
                return (
                  <TableRow key={key}>
                    <TableCell>
                      <Badge variant="neutral">{aiSourceLabel(source)}</Badge>
                    </TableCell>
                    <TableCell numeric className="text-secondary">
                      {formatMoney(a1?.metrics.revenue, block.currency)}
                    </TableCell>
                    <TableCell numeric className="text-secondary">
                      {a1?.metrics.orders ?? '—'}
                    </TableCell>
                    <TableCell numeric className="text-secondary">
                      {formatMoney(a1?.metrics.average_order_value, block.currency)}
                    </TableCell>
                    <TableCell numeric className="text-secondary">
                      {formatConversionRate(a1?.metrics.conversion_rate)}
                    </TableCell>
                    <TableCell numeric className="text-secondary">
                      {formatMoney(a2?.metrics.revenue, block.currency)}
                    </TableCell>
                    <TableCell numeric className="text-secondary">
                      {a2?.metrics.orders ?? '—'}
                    </TableCell>
                    <TableCell numeric className="text-secondary">
                      {formatMoney(a2?.metrics.average_order_value, block.currency)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
