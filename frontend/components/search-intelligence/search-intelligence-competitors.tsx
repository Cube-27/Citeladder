import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { textRole } from '@/components/ui/typography';
import { Pressable } from '@/components/ui/pressable';
import type {
  SearchIntelligenceDataset,
  SearchIntelligenceReadiness,
} from '@/lib/api/search-intelligence';
import { datasetCount, formatSearchNumber } from './search-intelligence-format';

// A reviewed canonical host may be www while saved competitor identities use apex domains.
export function matchesCompetitor(origin: string, domain: string): boolean {
  if (!origin) return false;
  try {
    const host = new URL(origin).hostname;
    return host === domain || host === `www.${domain}`;
  } catch {
    return false;
  }
}

export function SearchIntelligenceCompetitors({
  datasets,
  competitors,
  onOpen,
}: Readonly<{
  datasets: SearchIntelligenceDataset[];
  competitors: SearchIntelligenceReadiness['competitors'];
  onOpen: (dataset: SearchIntelligenceDataset) => void;
}>) {
  return (
    <Card className="min-w-0">
      <CardHeader bordered>
        <CardTitle>Competitive footprint</CardTitle>
      </CardHeader>
      <CardContent flush>
        <Table className="min-w-[720px]">
          <TableHeader>
            <TableRow>
              <TableHead>Competitor</TableHead>
              <TableHead numeric>Organic keywords</TableHead>
              <TableHead numeric>Est. monthly traffic</TableHead>
              <TableHead numeric>Missing keywords</TableHead>
              <TableHead numeric>Shared keywords</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {competitors.map((competitor) => {
              const footprint = datasets.find(
                (item) =>
                  item.dataset_kind === 'footprint' &&
                  matchesCompetitor(item.target_origin, competitor.registrable_domain),
              );
              const comparison = (kind: string) =>
                datasets.find(
                  (item) =>
                    item.dataset_kind === kind &&
                    matchesCompetitor(item.comparison_origin, competitor.registrable_domain),
                );
              return (
                <TableRow key={competitor.identity}>
                  <TableCell>
                    <span className={textRole('bodyStrong', 'block')}>{competitor.label}</span>
                    <span className={textRole('meta')}>
                      {footprint?.target_hostname ?? competitor.hostname}
                    </span>
                  </TableCell>
                  <TableCell numeric>
                    {formatSearchNumber(footprint?.summary.organic_keywords)}
                  </TableCell>
                  <TableCell numeric>
                    {formatSearchNumber(footprint?.summary.estimated_monthly_traffic)}
                  </TableCell>
                  {['missing_keywords', 'shared_keywords'].map((kind) => {
                    const dataset = comparison(kind);
                    return (
                      <TableCell numeric key={kind}>
                        {dataset ? (
                          <Pressable
                            type="button"
                            className="text-accent-text w-auto text-center underline underline-offset-4"
                            aria-label={`${kind.replaceAll('_', ' ')} for ${competitor.label}`}
                            onClick={() => onOpen(dataset)}
                          >
                            {datasetCount(dataset)}
                          </Pressable>
                        ) : (
                          'Not fetched'
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {!competitors.length ? (
          <p className={textRole('body', 'p-4')}>No competitors saved for this project.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
