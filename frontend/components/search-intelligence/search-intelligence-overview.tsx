import { Database } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Stack } from '@/components/ui/layout';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { textRole } from '@/components/ui/typography';
import type { SearchIntelligenceDataset } from '@/lib/api/search-intelligence';
import { formatEvidenceValue } from './search-intelligence-format';

export function SearchIntelligenceOverview({
  datasets,
  competitors,
  ownedHostname,
  onNavigate,
}: Readonly<{
  datasets: SearchIntelligenceDataset[];
  competitors: { identity: string; label: string; hostname: string; origin: string }[];
  ownedHostname: string;
  onNavigate: (tab: 'keywords' | 'competitors' | 'backlinks') => void;
}>) {
  const footprint = datasets.find(
    (item) => item.dataset_kind === 'footprint' && item.target_hostname === ownedHostname,
  );
  const backlinks = datasets.find(
    (item) => item.dataset_kind === 'backlink_summary' && item.target_hostname === ownedHostname,
  );
  if (!footprint && !backlinks)
    return (
      <EmptyState
        icon={Database}
        heading="Your search-market view starts here"
        description="Review the estimated cost, then run your first analysis to save evidence."
      />
    );
  const metrics = [
    ['Organic keywords', footprint?.summary.organic_keywords],
    ['Estimated monthly traffic', footprint?.summary.estimated_monthly_traffic],
    ['Top-10 keywords', footprint?.summary.top_10_keywords],
    ['Referring domains', backlinks?.summary.referring_main_domains],
    ['Backlinks', backlinks?.summary.backlinks],
  ] as const;
  return (
    <Stack gap="workspace">
      <div className="border-border bg-panel grid overflow-hidden rounded-[var(--radius-card)] border sm:grid-cols-2 lg:grid-cols-5">
        {metrics.map(([label, value]) => (
          <div
            key={label}
            className="border-border-subtle grid gap-1 border-b p-4 last:border-0 sm:border-r lg:border-b-0"
          >
            <span className={textRole('label')}>{label}</span>
            <span className={textRole('metricSm')}>
              {value === null || value === undefined ? 'Not measured' : formatEvidenceValue(value)}
            </span>
          </div>
        ))}
      </div>
      <Card>
        <CardHeader bordered className="flex-row items-center justify-between">
          <CardTitle>Competitive footprint</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => onNavigate('competitors')}>
            Explore competitors
          </Button>
        </CardHeader>
        <CardContent flush>
          {competitors.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Confirmed competitor</TableHead>
                  <TableHead numeric>Missing keywords</TableHead>
                  <TableHead numeric>Shared keywords</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {competitors.map((competitor) => {
                  const missing = datasets.find(
                    (item) =>
                      item.dataset_kind === 'missing_keywords' &&
                      item.comparison_origin === competitor.origin,
                  );
                  const shared = datasets.find(
                    (item) =>
                      item.dataset_kind === 'shared_keywords' &&
                      item.comparison_origin === competitor.origin,
                  );
                  return (
                    <TableRow key={competitor.identity}>
                      <TableCell>
                        {competitor.label} · {competitor.hostname}
                      </TableCell>
                      <TableCell numeric>{missing?.provider_total ?? 'Not acquired'}</TableCell>
                      <TableCell numeric>{shared?.provider_total ?? 'Not acquired'}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <p className={textRole('body', 'p-4')}>
              No confirmed competitors are saved for this project.
            </p>
          )}
        </CardContent>
      </Card>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => onNavigate('keywords')}>
          Explore ranking keywords
        </Button>
        <Button variant="secondary" onClick={() => onNavigate('backlinks')}>
          Explore referring domains
        </Button>
      </div>
      <p className={textRole('meta')}>
        Provider estimates and observed rankings are separate from first-party Search Demand data.
      </p>
    </Stack>
  );
}
