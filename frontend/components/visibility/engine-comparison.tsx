'use client';

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import type { Visibility } from '@/lib/api/types';
import {
  engineLabel,
  formatRate,
  visibleEngines,
  type VisibilityFilters,
} from '@/lib/visibility/dashboard';
import { textRole } from '@/components/ui/typography';

export function EngineComparison({
  visibility,
  filter,
  onSelect,
}: Readonly<{
  visibility: Visibility;
  filter: VisibilityFilters['engine'];
  onSelect?: (engine: string) => void;
}>) {
  const engines = visibleEngines(visibility, filter);
  return (
    <Card>
      <CardHeader>
        <CardTitle>By model</CardTitle>
        <CardDescription>Observed outcomes in the selected measurement</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {!engines.length ? (
          <p className="text-secondary p-[var(--card-padding)]">No model observations.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Model</TableHead>
                <TableHead numeric>Visibility</TableHead>
                <TableHead numeric>Owned citation rate</TableHead>
                <TableHead>Responses</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {engines.map((engine) => (
                <TableRow key={engine.logical_engine}>
                  <TableCell>
                    {onSelect ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onSelect(engine.logical_engine)}
                      >
                        {engineLabel(engine.logical_engine)}
                      </Button>
                    ) : (
                      engineLabel(engine.logical_engine)
                    )}
                    <p className={textRole('meta', 'text-secondary')}>
                      {visibility.model_provenance
                        .filter((item) => item.logical_engine === engine.logical_engine)
                        .map((item) => item.transport_model)
                        .join(', ')}
                    </p>
                  </TableCell>
                  <TableCell numeric>{formatRate(engine.brand_mention_rate)}</TableCell>
                  <TableCell numeric>{formatRate(engine.owned_citation_rate)}</TableCell>
                  <TableCell>
                    {engine.total_completed} measured
                    {engine.counts?.expected != null
                      ? ` / ${engine.counts.expected} expected`
                      : ' · expected count unavailable'}
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
