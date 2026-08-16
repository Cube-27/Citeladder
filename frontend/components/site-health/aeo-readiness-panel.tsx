'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Drawer } from '@/components/ui/drawer';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { siteHealthQueries } from '@/lib/api/site-health';
import type { ReadinessDimension } from '@/lib/api/types';

function coverageLabel(value: number | null) {
  return value === null ? 'Unavailable' : `${Math.round(value * 100)}%`;
}

function pageLabel(url: string) {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname}`;
  } catch {
    return url;
  }
}

const OUTCOME_ORDER: Record<string, number> = { fail: 0, error: 1, pass: 2, not_applicable: 3 };

/**
 * Evidence is a right-side sheet rather than an in-cell disclosure: a dimension
 * can carry dozens of persisted evaluations, and expanding them inside a table
 * cell inflated a single row past the height of the viewport.
 */
function EvidenceDrawer({
  dimension,
  crawlId,
  onClose,
}: Readonly<{ dimension: ReadinessDimension | null; crawlId: string; onClose: () => void }>) {
  const links = [...(dimension?.evidence_links ?? [])].sort(
    (left, right) =>
      (OUTCOME_ORDER[left.outcome] ?? 9) - (OUTCOME_ORDER[right.outcome] ?? 9) ||
      left.normalized_url.localeCompare(right.normalized_url),
  );
  return (
    <Drawer
      open={Boolean(dimension)}
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={`${dimension?.label ?? ''} evidence`}
      description="Persisted rule evaluations behind this dimension, failures first."
      closeLabel="Close evidence"
    >
      <ul className="divide-border-subtle divide-y">
        {links.map((link) => (
          <li key={link.evaluation_id} className="grid gap-1 py-2.5 first:pt-0">
            <div className="flex items-baseline justify-between gap-3">
              <Link
                className="text-accent-text truncate text-sm hover:underline"
                href={`/site/crawls/${crawlId}/pages/${link.site_url_id}`}
              >
                {pageLabel(link.normalized_url)}
              </Link>
              <span
                className={
                  link.outcome === 'fail'
                    ? 'text-danger-text shrink-0 text-xs font-medium'
                    : 'text-subtle shrink-0 text-xs'
                }
              >
                {link.outcome.replace('_', ' ')}
              </span>
            </div>
            <span className="text-muted text-xs">{link.rule_id}</span>
          </li>
        ))}
      </ul>
    </Drawer>
  );
}

export function AeoReadinessPanel({
  projectId,
  crawlId,
}: Readonly<{ projectId: string; crawlId: string }>) {
  const readiness = useQuery(siteHealthQueries.aeoReadiness(projectId, crawlId));
  const [evidenceKey, setEvidenceKey] = useState<string | null>(null);

  if (readiness.isLoading) {
    return (
      <p role="status" className="text-secondary text-sm">
        Loading persisted AEO evaluations…
      </p>
    );
  }
  if (readiness.isError) {
    return <Alert tone="danger">Could not load AEO Readiness.</Alert>;
  }
  if (!readiness.data || readiness.data.state === 'unavailable') {
    return (
      <Alert tone="info">
        AEO Readiness will appear after a usable crawl has persisted page evaluations.
      </Alert>
    );
  }

  const data = readiness.data;
  return (
    <div className="grid min-w-0 gap-6" data-testid="aeo-readiness">
      {data.state === 'incomplete' || data.limitations.length ? (
        <Alert tone="warning">{data.limitations.join(' ')}</Alert>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>AEO Readiness</CardTitle>
          <CardDescription className="max-w-3xl">
            Seven presentation dimensions over {data.analysis_count} analyzed page
            {data.analysis_count === 1 ? '' : 's'}. Counts are persisted rule outcomes—not a new
            score. One count is one rule evaluated on one page, so a dimension totals more than the
            page count.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dimension</TableHead>
                <TableHead numeric>Pass</TableHead>
                <TableHead numeric>Fail</TableHead>
                <TableHead numeric>Not applicable</TableHead>
                <TableHead>Coverage</TableHead>
                <TableHead>Evidence</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.dimensions.map((dimension) => (
                <TableRow key={dimension.key}>
                  <TableCell>
                    <span className="font-medium">{dimension.label}</span>
                    <span className="text-subtle block text-xs">
                      {dimension.rule_ids.length} mapped rules
                    </span>
                  </TableCell>
                  <TableCell numeric>{dimension.pass_count}</TableCell>
                  <TableCell
                    numeric
                    className={dimension.fail_count ? 'text-danger-text font-medium' : undefined}
                  >
                    {dimension.fail_count}
                  </TableCell>
                  <TableCell numeric>{dimension.not_applicable_count}</TableCell>
                  <TableCell>
                    <span className="tabular-nums">{coverageLabel(dimension.coverage)}</span>
                    <span className="text-subtle block text-xs">
                      {dimension.observed_evaluation_count} of {dimension.expected_evaluation_count}
                    </span>
                  </TableCell>
                  <TableCell>
                    {dimension.evidence_links.length ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-accent-text hover:text-accent-hover -mx-2"
                        onClick={() => setEvidenceKey(dimension.key)}
                      >
                        View {dimension.evidence_links.length} evidence link
                        {dimension.evidence_links.length === 1 ? '' : 's'}
                      </Button>
                    ) : (
                      <span className="text-subtle text-xs">No persisted evaluations</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <EvidenceDrawer
        dimension={data.dimensions.find((dimension) => dimension.key === evidenceKey) ?? null}
        crawlId={crawlId}
        onClose={() => setEvidenceKey(null)}
      />
      <p className="text-subtle text-xs">
        Taxonomy {data.taxonomy_version} · Analyzer {data.analyzer_version}
      </p>
    </div>
  );
}
