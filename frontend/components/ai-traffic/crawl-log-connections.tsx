'use client';
import { useProjectContext, useWorkspaceCapability } from '@/lib/project/project-context';
import {
  useCrawlConnections,
  type CrawlConnectionInput,
} from '@/lib/ai-traffic/use-crawl-connections';
import type { crawlSourceSchema } from '@citeladder/contracts/ai-traffic';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Alert } from '@/components/ui/alert';
import { ReadError } from '@/components/ui/read-error';
import { DisplayTime } from '@/components/ui/display-time';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { CrawlLogSetup } from './crawl-log-setup';
export function CrawlLogConnections({
  open,
  onOpenChange,
}: Readonly<{ open?: boolean; onOpenChange?: (open: boolean) => void }> = {}) {
  const { activeProject } = useProjectContext(),
    canManage = useWorkspaceCapability('manage_credentials');
  if (!activeProject) return null;
  return (
    <Connections
      key={activeProject.workspace_id + activeProject.id}
      projectId={activeProject.id}
      workspaceId={activeProject.workspace_id}
      website={activeProject.website_url}
      canManage={canManage}
      open={open}
      onOpenChange={onOpenChange}
    />
  );
}
function Connections(input: CrawlConnectionInput) {
  const model = useCrawlConnections(input);
  const { sources, canManage, open, setOpen, setIssued, mutation } = model;
  return (
    <section id="crawl-log-connections" className="grid gap-4" aria-label="Crawl log connections">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="type-section-title">Crawl logs</h2>
        <Button
          onClick={() => {
            setIssued(null);
            setOpen(true);
          }}
          disabled={!canManage}
        >
          Connect crawl logs
        </Button>
      </div>
      {sources.isError ? (
        <ReadError
          error={sources.error}
          fallback="Could not read crawl log sources"
          onRetry={() => sources.refetch()}
        />
      ) : null}
      {sources.data && !sources.data.ingestion_enabled ? (
        <Alert tone="info">Ingestion is not enabled for this environment.</Alert>
      ) : null}
      {sources.data?.items.length ? (
        <SourceDiagnostics
          items={sources.data.items}
          canManage={canManage}
          onRotate={(id) => {
            setOpen(true);
            mutation.mutate({ kind: 'rotate', id });
          }}
          onRevoke={(id) => mutation.mutate({ kind: 'revoke', id })}
        />
      ) : null}
      {mutation.isError && !open ? <Alert tone="danger">{mutation.error.message}</Alert> : null}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setIssued(null);
        }}
        title="Connect crawl logs"
        description="Choose the collection method you operate. One live source per host; uploads are backfill."
      >
        <CrawlLogSetup model={model} />
      </Dialog>
    </section>
  );
}
function SourceDiagnostics({
  items,
  canManage,
  onRotate,
  onRevoke,
}: Readonly<{
  items: z.infer<typeof crawlSourceSchema>[];
  canManage: boolean;
  onRotate: (id: string) => void;
  onRevoke: (id: string) => void;
}>) {
  return (
    <Table>
      <caption className="sr-only">Crawl log source diagnostics</caption>
      <TableHeader>
        <TableRow>
          <TableHead>Source</TableHead>
          <TableHead>Collection and sampling</TableHead>
          <TableHead>Freshness</TableHead>
          <TableHead>Diagnostics</TableHead>
          <TableHead>Manage</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((s) => (
          <TableRow key={s.id}>
            <TableCell>
              {s.host}
              <br />
              {s.setup} · {s.connection} · {s.status}
            </TableCell>
            <TableCell>
              {s.collection_point} · {s.sampling.kind}
              {s.sampling.kind === 'sampled'
                ? ' ' + s.sampling.rate
                : s.sampling.kind === 'filtered'
                  ? ' ' + s.sampling.description
                  : ''}
            </TableCell>
            <TableCell>
              Accepted: <DisplayTime value={s.last_accepted_batch} fallback="Awaiting data" />
              <br />
              Processed: <DisplayTime value={s.last_processed_at} fallback="Awaiting processing" />
            </TableCell>
            <TableCell>
              {s.rejected_lines} rejected · {s.overlapping_lines} overlapping ·{' '}
              {s.unsupported_uploads} unsupported uploads · {s.unsupported_batches} unsupported
              batches
            </TableCell>
            <TableCell>
              {canManage && s.status === 'active' ? (
                <div className="flex gap-2">
                  {s.kind === 'webhook' ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        onRotate(s.id);
                      }}
                    >
                      Rotate token
                    </Button>
                  ) : null}
                  <Button size="sm" variant="secondary" onClick={() => onRevoke(s.id)}>
                    Revoke
                  </Button>
                </div>
              ) : null}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
