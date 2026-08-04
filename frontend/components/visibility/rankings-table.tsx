import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { NO_RANKINGS_MESSAGE, RankingRowsTable } from '@/components/visibility/ranking-rows';
import type { Visibility } from '@/lib/api/types';
import { sortedRankings } from '@/lib/visibility/dashboard';

/**
 * "Competitors" card (design.md §9.6): the dense brand-vs-competitor table
 * (shared `RankingRowsTable`) under a title + one-line description. Rows
 * arrive SOV-sorted from B6; `sortedRankings` keeps that order stable.
 */
export function RankingsTable({
  visibility,
  history,
}: Readonly<{ visibility: Visibility; history?: ReadonlyMap<string, number[]> }>) {
  const rows = sortedRankings(visibility.rankings);

  return (
    <Card>
      <CardHeader bordered>
        <CardTitle>Competitors</CardTitle>
        <CardDescription>How your brand compares in the same answers</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <p className="text-secondary p-[var(--card-padding)] text-sm">{NO_RANKINGS_MESSAGE}</p>
        ) : (
          <RankingRowsTable rows={rows} history={history} />
        )}
      </CardContent>
    </Card>
  );
}
