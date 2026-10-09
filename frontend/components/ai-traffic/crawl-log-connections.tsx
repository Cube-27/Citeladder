'use client';
import { useState } from 'react';
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
import { ReadError, readErrorProps } from '@/components/ui/read-error';
import { EditorialSectionHeader } from '@/components/ui/workspace';
import { DisplayTime } from '@/components/ui/display-time';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { CrawlLogSetup, CrawlLogSetupSubmit, CrawlLogCredential } from './crawl-log-setup';
import { collectionPointLabel, words } from '@/lib/ai-traffic/vocabulary';
export function CrawlLogConnections({
  open,
  onOpenChange,
  headerWhenEmpty = true,
}: Readonly<{
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Overview already offers Connect on its Crawlers card, so it hides an empty section. */
  headerWhenEmpty?: boolean;
}> = {}) {
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
      headerWhenEmpty={headerWhenEmpty}
    />
  );
}
function Connections({
  headerWhenEmpty,
  ...input
}: CrawlConnectionInput & { headerWhenEmpty: boolean }) {
  const model = useCrawlConnections(input);
  const { sources, canManage, open, setOpen, setIssued, mutation } = model;
  const [revoking, setRevoking] = useState<z.infer<typeof crawlSourceSchema> | null>(null);
  const showHeader = headerWhenEmpty || Boolean(sources.data?.items.length);
  const setupAvailable = !sources.isError && sources.data?.ingestion_enabled === true;
  return (
    <section id="crawl-log-connections" className="grid gap-3" aria-label="Crawl log connections">
      {showHeader ? (
        <EditorialSectionHeader
          title="Crawl logs"
          actions={
            <Button
              size="sm"
              onClick={() => {
                setIssued(null);
                setOpen(true);
              }}
              disabled={!canManage}
            >
              Connect crawl logs
            </Button>
          }
        />
      ) : null}
      {sources.isError ? (
        <ReadError {...readErrorProps(sources)} fallback="Could not read crawl log sources" />
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
          onRevoke={setRevoking}
        />
      ) : null}
      <RevokeSourceDialog source={revoking} mutation={mutation} onClose={() => setRevoking(null)} />
      {mutation.isError && !open ? <Alert tone="danger">{mutation.error.message}</Alert> : null}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setIssued(null);
        }}
        title="Connect crawl logs"
        description={
          setupAvailable
            ? 'Choose the collection method you operate. One live source per host; uploads are backfill.'
            : 'Crawl log collection availability'
        }
        className="w-144"
        footer={setupAvailable ? <CrawlLogSetupSubmit model={model} /> : undefined}
      >
        <CrawlLogCredential issued={model.issued} />
        <SetupAvailability model={model} />
      </Dialog>
    </section>
  );
}
function SetupAvailability({ model }: Readonly<{ model: ReturnType<typeof useCrawlConnections> }>) {
  const { sources, mutation } = model;
  if (sources.isError)
    return (
      <ReadError {...readErrorProps(sources)} fallback="Could not read crawl log availability" />
    );
  if (!sources.data) return <output>Checking crawl log availability…</output>;
  if (sources.data.ingestion_enabled) return <CrawlLogSetup model={model} />;
  return (
    <>
      {mutation.isError ? <Alert tone="danger">{mutation.error.message}</Alert> : null}
      <Alert tone="info">
        Crawl log ingestion is not enabled for this environment. Source creation and file uploads
        are unavailable until CiteLadder enables ingestion for this environment.
      </Alert>
    </>
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
  onRevoke: (source: z.infer<typeof crawlSourceSchema>) => void;
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
              <div className="grid gap-0.5">
                <span>{s.host}</span>
                <span className="type-caption">
                  {words(s.setup)} · {words(s.connection)} · {words(s.status)}
                </span>
              </div>
            </TableCell>
            <TableCell>
              {collectionPointLabel(s.collection_point)} · {words(s.sampling.kind)}
              {s.sampling.kind === 'sampled' ? ' ' + s.sampling.rate : ''}
              {s.sampling.kind === 'filtered' ? ' ' + s.sampling.description : ''}
            </TableCell>
            <TableCell>
              <div className="grid gap-0.5">
                <span>
                  Accepted: <DisplayTime value={s.last_accepted_batch} fallback="Awaiting data" />
                </span>
                <span className="type-caption">
                  Processed:{' '}
                  <DisplayTime value={s.last_processed_at} fallback="Awaiting processing" />
                </span>
              </div>
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
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => onRevoke(s)}
                    aria-label={`Revoke ${s.host}`}
                  >
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
/** Revoking stops ingestion for a host, so it is confirmed by name. */
function RevokeSourceDialog({
  source,
  mutation,
  onClose,
}: Readonly<{
  source: z.infer<typeof crawlSourceSchema> | null;
  mutation: ReturnType<typeof useCrawlConnections>['mutation'];
  onClose: () => void;
}>) {
  return (
    <Dialog
      open={source !== null}
      onOpenChange={(next) => {
        if (!next && !mutation.isPending) onClose();
      }}
      title="Revoke crawl log source"
      description={source ? `Stop accepting logs for ${source.host}?` : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={!source}
            pending={mutation.isPending}
            pendingLabel="Revoking…"
            onClick={() =>
              source && mutation.mutate({ kind: 'revoke', id: source.id }, { onSettled: onClose })
            }
          >
            Revoke source
          </Button>
        </>
      }
    >
      <p className="type-body">
        New batches and uploads for this host are refused. Requests already received stay in your
        reports.
      </p>
    </Dialog>
  );
}
