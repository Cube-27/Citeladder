'use client';

import { ProjectLink } from '@/components/layout/scoped-link';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Pager, pageNumberControls, useTablePage } from '@/components/ui/pager';
import { TextLink } from '@/components/ui/text-link';
import type { Audit } from '@/lib/api/types';
import { auditBadgeValue, auditStatusLabel, formatDateTime } from '@/lib/runs/status';
import { useDisplayTimeZone } from '@/lib/display-timezone';

/** Rows per page on the runs table (client-side; the list arrives whole). */
const PAGE_SIZE = 10;

/**
 * Runs (audits) list table (F10, design.md §9.7).
 *
 * One row per audit: a run-status badge, the requested/completed/failed
 * counts, and the created timestamp. Each row links to the run detail page.
 * Client-side pagination footer (tabular page indicator + ghost buttons) per the
 * runs frame.
 */
export function RunsTable({ audits }: Readonly<{ audits: Audit[] }>) {
  const timeZone = useDisplayTimeZone();
  const { page, setPage, pageCount, from, to } = useTablePage(audits.length, PAGE_SIZE);
  const pagedAudits = audits.slice(from - 1, to);

  return (
    <div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Status</TableHead>
            <TableHead>Scope</TableHead>
            <TableHead numeric>Requested</TableHead>
            <TableHead numeric>Completed</TableHead>
            <TableHead numeric>Failed</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="sr-only">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pagedAudits.map((audit) => (
            <TableRow key={audit.id}>
              <TableCell>
                <Badge variant="run-status" value={auditBadgeValue(audit.status)}>
                  {auditStatusLabel(audit.status)}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge
                  variant="status"
                  value={audit.audit_scope === 'commerce' ? 'info' : 'success'}
                >
                  {audit.audit_scope === 'commerce' ? 'Commerce' : 'Brand'}
                </Badge>
              </TableCell>
              <TableCell numeric className="tabular-nums">
                {audit.requested_count}
              </TableCell>
              <TableCell numeric className="tabular-nums">
                {audit.completed_count}
              </TableCell>
              <TableCell numeric className="tabular-nums">
                {audit.failed_count}
              </TableCell>
              <TableCell className="text-secondary">
                {formatDateTime(audit.created_at, timeZone)}
              </TableCell>
              <TableCell>
                <TextLink asChild text="itemTitle">
                  <ProjectLink href={`/runs/${audit.id}`}>View</ProjectLink>
                </TextLink>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Pager
        frame="table"
        range={{ from, to, total: audits.length, noun: 'runs' }}
        {...pageNumberControls(page, pageCount, setPage)}
      />
    </div>
  );
}
