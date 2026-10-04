'use client';
import { useState } from 'react';
import type { z } from 'zod';
import type { aiTrafficPagesSchema } from '@citeladder/contracts/ai-traffic';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { DisplayTime } from '@/components/ui/display-time';
import { UrlPanel, TrafficLeg } from './url-panel';
import { TrafficNoResults } from './empty-state';
import type { TrafficFilters } from '@/lib/api/ai-traffic';

export function TrafficPages({
  data,
  filters = {},
}: Readonly<{ data: z.infer<typeof aiTrafficPagesSchema>; filters?: TrafficFilters }>) {
  const [urlHash, setUrlHash] = useState<string | null>(null),
    coverage = data.observed_crawl_coverage;
  return (
    <div className="grid gap-[var(--workspace-gap)]">
      <p className="type-caption">
        {coverage.label}:{' '}
        {coverage.share === null ? 'Unavailable' : (coverage.share * 100).toFixed(1) + '%'} of{' '}
        {coverage.known_pages} known pages. Inventory{' '}
        <DisplayTime value={coverage.inventory_date} /> ·{' '}
        {coverage.inventory_complete ? 'Complete inventory' : 'Limited inventory'}
        {coverage.sample_mode ? ' · Sampled inventory' : ''}
      </p>
      {data.items.length ? null : (
        <TrafficNoResults
          heading="No joinable paths were observed"
          description="Check each signal’s coverage for this window before interpreting absence."
        />
      )}
      {data.items.length ? (
        <Table>
          <caption className="sr-only">Path-level AI Traffic with separate signal units</caption>
          <TableHeader>
            <TableRow>
              <TableHead>Path</TableHead>
              <TableHead numeric>Crawler requests</TableHead>
              <TableHead numeric>AI referral sessions</TableHead>
              <TableHead numeric>Key events</TableHead>
              <TableHead numeric>Tracked citations</TableHead>
              <TableHead numeric>Open findings</TableHead>
              <TableHead>Last crawl</TableHead>
              <TableHead numeric>4xx / 5xx</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((r) => (
              <TableRow key={r.url_hash}>
                <TableCell>
                  <Button variant="ghost" size="sm" onClick={() => setUrlHash(r.url_hash)}>
                    {r.display_path}
                  </Button>
                </TableCell>
                <TableCell numeric>
                  <TrafficLeg leg={r.crawl} unit="requests" />
                </TableCell>
                <TableCell numeric>
                  <TrafficLeg leg={r.referrals} unit="sessions" />
                </TableCell>
                <TableCell numeric>{r.key_events ?? 'Unavailable'}</TableCell>
                <TableCell numeric>
                  <TrafficLeg leg={r.citations} unit="citations" />
                </TableCell>
                <TableCell numeric>
                  <TrafficLeg leg={r.findings} unit="findings" />
                </TableCell>
                <TableCell>
                  <DisplayTime value={r.last_crawl} />
                </TableCell>
                <TableCell numeric>
                  {r.errors_4xx ?? 'Unavailable'} / {r.errors_5xx ?? 'Unavailable'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
      <UrlPanel urlHash={urlHash} onClose={() => setUrlHash(null)} filters={filters} />
    </div>
  );
}
