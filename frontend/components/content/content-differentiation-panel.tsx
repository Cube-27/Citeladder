'use client';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { textRole } from '@/components/ui/typography';
import type { ContentDifferentiationReport } from '@/lib/api/content';

import { useContentDifferentiation } from './content-screen-data';

const FEATURE_LABELS = {
  heading_topics: 'Heading topic',
  table_structures: 'Table structure',
  outbound_sources: 'Outbound source',
} as const;

type Feature = ContentDifferentiationReport['report']['gaps'][number];

function FeatureList({
  title,
  items,
  unique = false,
}: Readonly<{ title: string; items: Feature[]; unique?: boolean }>) {
  return (
    <section className="grid content-start gap-2">
      <h4 className={textRole('label')}>{title}</h4>
      {items.length === 0 ? (
        <p className="text-muted text-xs">None observed.</p>
      ) : (
        <ul className="grid gap-2">
          {items.map((item) => (
            <li key={`${item.feature}:${item.value}`} className="grid gap-0.5 text-xs">
              <span className={textRole('emphasis')}>{item.value}</span>
              <span className="text-muted">
                {FEATURE_LABELS[item.feature]} ·{' '}
                {unique
                  ? `not found in ${item.inspected_pages} inspected pages`
                  : `${item.observed_pages} of ${item.inspected_pages} inspected pages`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Report({ row, open }: Readonly<{ row: ContentDifferentiationReport; open: boolean }>) {
  const report = row.report;
  const provenance = report.provenance;
  const available = report.state === 'available';
  return (
    <details open={open} className="border-border-subtle grid gap-4 border-t py-3 first:border-t-0">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3">
        <span className="grid min-w-0 gap-0.5">
          <span className={textRole('objectTitle', 'break-words')}>{report.query}</span>
          <span className="text-muted text-xs">
            {provenance.inspected_page_count} of {provenance.selected_result_count} selected pages
            inspected · {report.gaps.length} gaps · {report.unique_contributions.length} unique
            contributions
          </span>
        </span>
        <Badge variant="status" value={available ? 'success' : 'warning'}>
          {available ? 'Available' : 'Insufficient evidence'}
        </Badge>
      </summary>
      <div className="grid gap-4">
        {available ? (
          <div className="grid gap-[var(--workspace-gap)] md:grid-cols-3">
            <FeatureList title="Common competitor gaps" items={report.gaps} />
            <FeatureList title="Already at parity" items={report.parity} />
            <FeatureList
              title="Unique in inspected set"
              items={report.unique_contributions}
              unique
            />
          </div>
        ) : (
          <Alert tone="info">
            {report.limitations[0] ?? 'There is not enough inspected evidence for a comparison.'}
          </Alert>
        )}
        <div className="grid gap-1 text-xs">
          <span className={textRole('label')}>Evidence limits</span>
          {report.limitations.map((limitation) => (
            <p key={limitation} className="text-muted">
              {limitation}
            </p>
          ))}
        </div>
      </div>
    </details>
  );
}

export function ContentDifferentiationPanel({ projectId }: Readonly<{ projectId: string }>) {
  const query = useContentDifferentiation(projectId);
  const rows = query.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Content differentiation</CardTitle>
        <CardDescription>
          Compare your selected page with inspected organic results for measured search prompts.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {query.isPending ? (
          <output className="text-secondary block text-sm">Loading differentiation reports…</output>
        ) : query.isError ? (
          <Alert tone="danger">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>Content differentiation reports could not be loaded.</span>
              <Button variant="secondary" size="sm" onClick={() => void query.refetch()}>
                Try again
              </Button>
            </div>
          </Alert>
        ) : rows.length === 0 ? (
          <p className="text-secondary text-sm">
            No differentiation reports yet. Reports appear after organic result pages have been
            inspected for a completed search audit.
          </p>
        ) : (
          <div>
            {rows.map((row, index) => (
              <Report key={row.id} row={row} open={index === 0} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
