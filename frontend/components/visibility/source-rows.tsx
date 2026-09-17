'use client';

import type { z } from 'zod';
import type { visibilitySourcesSchema } from '@/lib/api/schemas/visibility-evidence';
import { Button } from '@/components/ui/button';
import { ProjectLink } from '@/components/layout/scoped-link';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { textRole } from '@/components/ui/typography';
import { setUrlParams } from '@/lib/navigation/url-state';
import { formatRate } from '@/lib/visibility/dashboard';
import type { useVisibilityFilters } from '@/lib/visibility/use-visibility-dashboard';

export type SourceRow = z.infer<typeof visibilitySourcesSchema>['items'][number];
export type SourceFilters = ReturnType<typeof useVisibilityFilters>;

/**
 * A cited page's route to the action it produced.
 *
 * Only a page this project has a record for can carry one, and only after a
 * qualified rule fired on it. Everything else reads as what it is — inventory,
 * or a page nobody has read — rather than being papered over with a generic
 * suggestion to improve something.
 */
function PageAction({
  row,
  onInspectPage,
}: Readonly<{ row: SourceRow; onInspectPage: (urlHash: string) => void }>) {
  if (row.opportunity_id) {
    return (
      <ProjectLink href={`/opportunities?selected=${row.opportunity_id}`}>
        Open opportunity
      </ProjectLink>
    );
  }
  // Read from the page record, not from the identity: a citation resolves to
  // an identity whether or not this project has ever looked at that page, so
  // keying the label on `url_hash` reported an unread page as one with
  // nothing to do.
  //
  // A page this project HAS a record for opens its detail, where the explicit
  // inspect command lives. A page it has no record for has nothing to open,
  // and offering a detail that 404s would be worse than the plain sentence.
  if (!row.inspection_state || !row.url_hash) {
    return <span className={textRole('meta', 'text-secondary')}>Not inspected</span>;
  }
  return (
    <Button variant="ghost" size="sm" onClick={() => onInspectPage(row.url_hash!)}>
      View page
    </Button>
  );
}

function SourceTableRow({
  row,
  domain,
  filters,
  activeRunId,
  onInspectPage,
}: Readonly<{
  row: SourceRow;
  domain: string | null;
  filters: SourceFilters;
  activeRunId: string | null;
  onInspectPage: (urlHash: string) => void;
}>) {
  return (
    <TableRow>
      <TableCell>
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            domain
              ? filters.openEvidence({ run: activeRunId, domain, url: row.key })
              : setUrlParams({
                  source_domain: row.key,
                  source_offset: null,
                  source_as_of: null,
                })
          }
        >
          {row.key || 'Domain unavailable'}
        </Button>
      </TableCell>
      <TableCell numeric>{row.responses}</TableCell>
      <TableCell numeric>{formatRate(row.response_rate)}</TableCell>
      <TableCell numeric className="hidden md:table-cell">
        {row.prompts}
      </TableCell>
      {domain ? (
        <TableCell>
          <PageAction row={row} onInspectPage={onInspectPage} />
        </TableCell>
      ) : null}
    </TableRow>
  );
}

/** The cited domains, or the pages on one of them once a domain is selected. */
export function SourceTable({
  rows,
  domain,
  filters,
  activeRunId,
  onInspectPage,
}: Readonly<{
  rows: SourceRow[];
  domain: string | null;
  filters: SourceFilters;
  activeRunId: string | null;
  onInspectPage: (urlHash: string) => void;
}>) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{domain ? 'Page' : 'Domain'}</TableHead>
          <TableHead numeric>Answers</TableHead>
          <TableHead numeric>Share of answers</TableHead>
          <TableHead numeric className="hidden md:table-cell">
            Prompts
          </TableHead>
          {/* Only pages carry an action; a domain row is a group, not a target. */}
          {domain ? <TableHead>Action</TableHead> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <SourceTableRow
            key={row.key}
            row={row}
            domain={domain}
            filters={filters}
            activeRunId={activeRunId}
            onInspectPage={onInspectPage}
          />
        ))}
      </TableBody>
    </Table>
  );
}
