'use client';

import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardEyebrow,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Donut, type DonutSegment } from '@/components/ui/donut';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { BuyerDestinationKind, BuyerDestinationMix } from '@/lib/api/types';
import { BUYER_DESTINATION_KIND_LABELS, formatPercent } from '@/lib/products/catalog';

/**
 * Colour follows the ENTITY (the merchant kind), never its rank — written out
 * in full so Tailwind's scanner sees every class.
 */
const KIND_SEGMENT_CLASS: Record<BuyerDestinationKind, string> = {
  brand_site: 'stroke-series-1',
  marketplace: 'stroke-series-2',
  retailer: 'stroke-series-3',
  other: 'stroke-series-4',
};

/**
 * Visibility › Destinations sub-tab: where answers send buyers. A `Donut`
 * of the persisted per-kind link shares (its generated ARIA label names every
 * segment and percentage, and the legend states each share in text) beside a
 * full per-domain merchant table (name, kind badge, link count, share). All
 * counts are persisted aggregates — domains arrive sanitized (no raw URLs).
 */
export function BuyerDestinationBreakdown({ mix }: Readonly<{ mix: BuyerDestinationMix }>) {
  const segments: DonutSegment[] = mix.by_kind.map((row) => ({
    label: BUYER_DESTINATION_KIND_LABELS[row.merchant_kind],
    value: row.count,
    colorClass: KIND_SEGMENT_CLASS[row.merchant_kind],
  }));

  return (
    <Card>
      <CardHeader>
        <div className="grid gap-1">
          <CardEyebrow>Where answers send buyers</CardEyebrow>
          <CardTitle>Buyer destinations</CardTitle>
          <CardDescription>
            Merchant links classified beside your product mentions in this run.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="grid gap-6">
        {mix.total === 0 ? (
          <p className="text-secondary text-sm">
            No buyer destinations measured in the selected run.
          </p>
        ) : (
          <>
            <Donut
              segments={segments}
              size={148}
              label="Buyer destinations by kind"
              centerLabel={String(mix.total)}
              centerCaption="destinations"
            />
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Merchant</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>Links</TableHead>
                  <TableHead>Share</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mix.by_domain.map((row) => (
                  <TableRow key={row.merchant_domain}>
                    <TableCell className="max-w-[280px] min-w-[180px]">
                      <div className="grid gap-0.5">
                        <span className="text-foreground truncate font-medium">
                          {row.merchant_name}
                        </span>
                        <span className="text-muted truncate text-xs">{row.merchant_domain}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="neutral">
                        {BUYER_DESTINATION_KIND_LABELS[row.merchant_kind]}
                      </Badge>
                    </TableCell>
                    <TableCell numeric className="text-secondary">
                      {row.count}
                    </TableCell>
                    <TableCell numeric className="text-secondary">
                      {formatPercent(row.count / mix.total)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </CardContent>
    </Card>
  );
}
