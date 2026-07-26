'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardEyebrow, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { AttributionStatistical } from '@/lib/api/types';
import {
  INSUFFICIENT_STATISTICAL_COPY,
  STATISTICAL_CARD_TITLE,
  formatMoney,
} from '@/lib/products/attribution';
import { formatPercent } from '@/lib/products/catalog';

/**
 * The Layer-B `Statistical estimate` card — model output with an explicit
 * warning treatment, rendered ONLY when the backend offers a statistical
 * allocation for the window (`available` or `insufficient_data`;
 * `not_offered` renders nothing). Its estimates NEVER merge into the
 * deterministic A1/A2 cards, the delta, or any table footer. For
 * `insufficient_data` every estimate renders `—` beside the exact
 * insufficient-data copy. Allocations are filtered to the surrounding ISO
 * currency block; `ai_source` is a plain persisted string (it can carry an
 * unassigned bucket outside the deterministic source vocabulary).
 */
export function StatisticalAllocationCard({
  statistical,
  currency,
}: Readonly<{
  statistical: AttributionStatistical;
  /** The surrounding currency block; allocations in other codes never show. */
  currency: string | null;
}>) {
  if (statistical.state === 'not_offered') return null;

  const insufficient = statistical.state === 'insufficient_data';
  const allocations = statistical.allocations.filter((row) => row.currency === currency);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="grid gap-1">
          <CardEyebrow>Statistical · not deterministic</CardEyebrow>
          <CardTitle>{STATISTICAL_CARD_TITLE}</CardTitle>
          <CardDescription>
            Modelled allocation of unattributed orders. Not a measured value and never part of
            the A1, A2, or delta figures above.
          </CardDescription>
        </div>
        {insufficient ? (
          <Badge variant="status" value="warning">
            Insufficient data
          </Badge>
        ) : (
          <Badge variant="status" value="warning">
            Model output
          </Badge>
        )}
      </CardHeader>
      <CardContent className="grid gap-3">
        <p className="text-secondary text-sm">
          {insufficient ? (
            <>
              {INSUFFICIENT_STATISTICAL_COPY}
              {statistical.sample_size !== null
                ? ` Sample size ${statistical.sample_size} orders is below the reporting threshold.`
                : null}
            </>
          ) : (
            <>
              Estimated allocation of unattributed orders across AI sources
              {statistical.sample_size !== null
                ? ` · sample size ${statistical.sample_size} orders`
                : null}
              . Excluded from every deterministic total.
            </>
          )}
        </p>
        {allocations.length === 0 ? null : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>AI source</TableHead>
                <TableHead>Estimated revenue</TableHead>
                <TableHead>Estimated orders</TableHead>
                <TableHead>Estimated share</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allocations.map((row) => (
                <TableRow key={`${row.ai_source}:${row.currency}`}>
                  <TableCell className="text-foreground font-medium">{row.ai_source}</TableCell>
                  <TableCell numeric className="text-secondary">
                    {formatMoney(row.estimated_revenue, row.currency)}
                  </TableCell>
                  <TableCell numeric className="text-secondary">
                    {row.estimated_orders ?? '—'}
                  </TableCell>
                  <TableCell numeric className="text-secondary">
                    {formatPercent(row.estimated_share)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
