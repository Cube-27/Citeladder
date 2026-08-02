'use client';

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
import { formatPercent, type AttributeFrequencyGroup } from '@/lib/products/catalog';

/**
 * Visibility › Attributes sub-tab: how often each attribute dimension appears
 * in the windows around the project's own-product mentions. One semantic
 * table grouped by attribute group (a `<th>` section row per group), integer
 * mention counts, and a share-of-group bar whose percentage is also rendered
 * as text (never color-only). Counts are persisted aggregates added across
 * the selected projection's rows — evidence is never re-scored here.
 */
export function AttributeFrequencyPanel({
  groups,
}: Readonly<{ groups: AttributeFrequencyGroup[] }>) {
  return (
    <Card>
      <CardHeader>
        <div className="grid gap-1">
          <CardEyebrow>Mention frequency by dimension</CardEyebrow>
          <CardTitle>Attribute dimensions</CardTitle>
          <CardDescription>
            How often each dimension appears in the windows around your product mentions.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {groups.length === 0 ? (
          <p className="text-secondary p-[var(--card-padding)] text-sm">
            No attribute mentions measured in the selected run.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dimension</TableHead>
                <TableHead>Mentions</TableHead>
                <TableHead className="min-w-40">Share of group</TableHead>
              </TableRow>
            </TableHeader>
            {groups.map((group) => (
              <TableBody key={group.group}>
                <TableRow>
                  <TableHead scope="colgroup" colSpan={3} className="bg-neutral-bg/40">
                    {group.group}
                  </TableHead>
                </TableRow>
                {group.dimensions.map((row) => (
                  <TableRow key={`${group.group}:${row.dimension}`}>
                    <TableCell className="text-foreground">{row.dimension}</TableCell>
                    <TableCell numeric className="text-secondary">
                      {row.count === 0 ? <span className="text-subtle">—</span> : row.count}
                    </TableCell>
                    <TableCell>
                      <ShareOfGroupBar
                        label={`${group.group} · ${row.dimension}`}
                        count={row.count}
                        total={group.total}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            ))}
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Horizontal share bar with the percentage stated in text beside it (and in
 * the ARIA label), so share is never carried by the bar alone. A zero-count
 * dimension renders the null placeholder, never `0%`.
 */
function ShareOfGroupBar({
  label,
  count,
  total,
}: Readonly<{ label: string; count: number; total: number }>) {
  if (total === 0 || count === 0) return <span className="text-subtle">—</span>;
  const share = count / total;
  return (
    <span className="flex items-center gap-2">
      <span
        className="bg-neutral-bg h-2 w-full max-w-30 overflow-hidden rounded-full"
        role="img"
        aria-label={`${label}: ${formatPercent(share)} of group`}
      >
        <span
          className="bg-accent block h-full rounded-full"
          style={{ width: `${Math.max(share * 100, 0)}%` }}
        />
      </span>
      <span className="text-muted mono text-xs">{formatPercent(share)}</span>
    </span>
  );
}
