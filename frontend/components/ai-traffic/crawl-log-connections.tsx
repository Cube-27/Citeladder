import { useState, type ReactNode } from 'react';
import { useMutation } from '@tanstack/react-query';
import { aiTrafficMutations } from '@/lib/api/ai-traffic';
import { useProjectContext, useWorkspaceCapability } from '@/lib/project/project-context';
import {
  useCrawlConnections,
  type CrawlConnectionInput,
} from '@/lib/ai-traffic/use-crawl-connections';
import type { crawlSourceSchema } from '@citeladder/contracts/ai-traffic';
import type { z } from 'zod';
import { ActionButton } from '@/components/ui/actions';
import { Button } from '@/components/ui/button';
import { StateBlock } from '@/components/ui/state-block';
import { ConfirmDialog, Dialog, type ConfirmRequest } from '@/components/ui/dialog';
import { mutationNoticeForError } from '@/lib/api/mutation-notice';
import { Stack } from '@/components/ui/layout';
import { DisplayTime } from '@/components/ui/display-time';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { TableActionsCell, TableCell, TableCellLines, TableRow } from '@/components/ui/table';
import {
  CrawlLogSetup,
  CrawlLogSetupSubmit,
  CrawlLogCredential,
  IssuedToken,
} from './crawl-log-setup';
import { CrawlLogAvailabilityNotice } from './crawl-log-availability';
import {
  collectionPointLabel,
  stallReasonLabel,
  verificationFailureLabel,
  words,
} from '@/lib/ai-traffic/vocabulary';
import { SinkFilterUpdates } from './gcp-pull-setup';
import { CRAWL_LOG_SETUPS } from '@/lib/config/crawl-logs';
import { ICONS } from '@/lib/icons';
import { Notice, readErrorProps } from '@/components/ui/notice';
import { Section, SectionHeader, SectionTitle } from '@/components/ui/section';

const SOURCE_COLUMNS: readonly DataTableColumn[] = [
  { key: 'source', label: 'Source' },
  { key: 'collection', label: 'Collection and sampling', priority: 'low' },
  { key: 'freshness', label: 'Freshness', width: 'stamp', priority: 'low' },
  { key: 'diagnostics', label: 'Diagnostics' },
  { key: 'manage', label: 'Manage', width: 'rowActions' },
];
const setupLabel = (setup: string) =>
  CRAWL_LOG_SETUPS.find((option) => option.value === setup)?.label ?? words(setup);
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
  const [rotating, setRotating] = useState<z.infer<typeof crawlSourceSchema> | null>(null);
  const showHeader = headerWhenEmpty || Boolean(sources.data?.items.length);
  const { setupAvailable, unavailable } = setupState(sources);
  const connect = unavailable ? undefined : (
    <ActionButton
      action="connectCrawlLogs"
      onClick={() => {
        setIssued(null);
        setOpen(true);
      }}
      disabled={!canManage}
    />
  );
  const body = (
    <>
      {sources.isError ? (
        <StateBlock
          kind="error"
          {...readErrorProps(sources)}
          title="Couldn't load the crawl log sources"
          fallback="The request failed or timed out."
        />
      ) : null}
      {sources.data ? (
        <CrawlLogAvailabilityNotice
          availability={sources.data.availability}
          workspaceId={model.workspaceId}
        />
      ) : null}
      {sources.data?.items.length ? (
        <SourceDiagnostics
          items={sources.data.items}
          canManage={canManage}
          onRotate={setRotating}
          onRevoke={setRevoking}
          onSetup={(id) => {
            setIssued({ id, token: null, setup: 'gcp_pubsub_pull' });
            setOpen(true);
          }}
        />
      ) : null}
      {sources.data ? (
        <SinkFilterUpdates
          data={sources.data}
          projectId={input.projectId}
          workspaceId={input.workspaceId}
          canManage={canManage}
        />
      ) : null}
      <ConfirmDialog
        pending={mutation.isPending}
        onCancel={() => setRevoking(null)}
        request={revokeRequest(revoking, (id) =>
          model.issueSource({ kind: 'revoke', id }, () => setRevoking(null)),
        )}
      />
      <RotateTokenDialog
        source={rotating}
        projectId={input.projectId}
        workspaceId={input.workspaceId}
        onClose={() => setRotating(null)}
      />
      {mutation.isError && !open ? (
        <Notice
          kind="mutation"
          notice={mutationNoticeForError(mutation.error, { action: 'update the crawl-log source' })}
        />
      ) : null}
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
        width="wide"
        footer={setupAvailable ? <CrawlLogSetupSubmit model={model} /> : undefined}
      >
        <CrawlLogCredential model={model} />
        <SetupAvailability model={model} />
      </Dialog>
    </>
  );
  if (!showHeader)
    return (
      <Stack as="section" id="crawl-log-connections" aria-label="Crawl log connections">
        {body}
      </Stack>
    );
  // The body keeps its place in the tree, so an open setup dialog survives the read settling.
  return (
    <Section id="crawl-log-connections" aria-label="Crawl log connections">
      <ConnectionsHead empty={sources.data?.items.length === 0} connect={connect} />
      <Stack className="empty:hidden">{body}</Stack>
    </Section>
  );
}

/**
 * A card like every other connection on the page: title left, its one action
 * right. With no source yet it is the compact empty state, its action the one way in.
 */
function ConnectionsHead({ empty, connect }: Readonly<{ empty: boolean; connect: ReactNode }>) {
  if (empty && connect)
    return (
      <StateBlock
        kind="empty"
        icon={ICONS.connect}
        heading="No crawl logs connected"
        description="Connect your server or CDN logs to see which AI crawlers fetch your pages and how often."
        action={connect}
      />
    );
  return (
    <SectionHeader actions={connect}>
      <SectionTitle>Crawl logs</SectionTitle>
    </SectionHeader>
  );
}

/** Revoking stops ingestion for a host, so it is confirmed by name. */
function revokeRequest(
  source: z.infer<typeof crawlSourceSchema> | null,
  onRevoke: (id: string) => void,
): ConfirmRequest | null {
  if (!source) return null;
  return {
    title: 'Revoke crawl log source',
    body: `Stop accepting logs for ${source.host}? New batches and uploads for this host are refused. Requests already received stay in your reports.`,
    confirmLabel: 'Revoke source',
    destructive: true,
    onConfirm: () => onRevoke(source.id),
  };
}

/**
 * Setup opens only on a read that says collection is available. An unavailable
 * workspace gets the explanation, not a setup it cannot complete; a pending or
 * failed read keeps the button, and the dialog explains the read.
 */
function setupState(sources: ReturnType<typeof useCrawlConnections>['sources']) {
  const availability = sources.data?.availability;
  return {
    setupAvailable: !sources.isError && availability === 'available',
    unavailable: availability !== undefined && availability !== 'available',
  };
}
function SetupAvailability({ model }: Readonly<{ model: ReturnType<typeof useCrawlConnections> }>) {
  const { sources, mutation } = model;
  if (sources.isError)
    return (
      <Notice
        kind="read"
        {...readErrorProps(sources)}
        title="Couldn't load crawl log availability"
        fallback="The request failed or timed out."
      />
    );
  if (!sources.data) return <output>Checking crawl log availability…</output>;
  if (sources.data.availability === 'available') return <CrawlLogSetup model={model} />;
  return (
    <>
      {mutation.isError ? (
        <Notice
          kind="mutation"
          notice={mutationNoticeForError(mutation.error, { action: 'update the crawl-log source' })}
        />
      ) : null}
      <CrawlLogAvailabilityNotice
        availability={sources.data.availability}
        workspaceId={model.workspaceId}
      />
    </>
  );
}
/** Why a source is stalled; a failed subscription check also says which check. */
function StallDetail({ source }: Readonly<{ source: z.infer<typeof crawlSourceSchema> }>) {
  if (!source.stall_reason) return null;
  const failure = source.pull?.verification_failure;
  return (
    <>
      {' · '}
      <span>
        {stallReasonLabel(source.stall_reason)}
        {failure ? ' ' + verificationFailureLabel(failure) : ''}
      </span>
    </>
  );
}
function SourceDiagnostics({
  items,
  canManage,
  onRotate,
  onRevoke,
  onSetup,
}: Readonly<{
  items: z.infer<typeof crawlSourceSchema>[];
  canManage: boolean;
  onRotate: (source: z.infer<typeof crawlSourceSchema>) => void;
  onRevoke: (source: z.infer<typeof crawlSourceSchema>) => void;
  /** Reopen a Google Cloud source's setup commands and subscription check. */
  onSetup: (id: string) => void;
}>) {
  return (
    <DataTable label="Crawl log source diagnostics" columns={SOURCE_COLUMNS} rowLines={2}>
      {items.map((s) => (
        <TableRow key={s.id}>
          <TableCell>
            <TableCellLines
              primary={s.host}
              secondary={
                <>
                  {setupLabel(s.setup)} · {words(s.connection)} · {words(s.state)}
                  <StallDetail source={s} />
                </>
              }
            />
          </TableCell>
          <TableCell>
            {collectionPointLabel(s.collection_point)} · {words(s.sampling.kind)}
            {s.sampling.kind === 'sampled' ? ' ' + s.sampling.rate : ''}
            {s.sampling.kind === 'filtered' ? ' ' + s.sampling.description : ''}
          </TableCell>
          <TableCell>
            <TableCellLines
              primary={
                <>
                  Accepted: <DisplayTime value={s.last_accepted_batch} fallback="Awaiting data" />
                </>
              }
              secondary={
                <>
                  Processed:{' '}
                  <DisplayTime value={s.last_processed_at} fallback="Awaiting processing" />
                  {s.pull ? (
                    <>
                      {' · '}Drained:{' '}
                      <DisplayTime value={s.pull.last_drained_at} fallback="Not drained yet" />
                    </>
                  ) : null}
                </>
              }
            />
          </TableCell>
          <TableCell>
            {s.rejected_lines} rejected · {s.overlapping_lines} overlapping ·{' '}
            {s.unsupported_uploads} unsupported uploads · {s.unsupported_batches} unsupported
            batches
          </TableCell>
          <TableActionsCell>
            {canManage && s.status === 'active' ? (
              <>
                {s.kind === 'webhook' ? (
                  <Button variant="secondary" onClick={() => onRotate(s)}>
                    Rotate token
                  </Button>
                ) : null}
                {s.kind === 'pull' ? (
                  <Button
                    variant="secondary"
                    onClick={() => onSetup(s.id)}
                    aria-label={`Set up and verify ${s.host}`}
                  >
                    Set up and verify
                  </Button>
                ) : null}
                <ActionButton
                  action="revoke"
                  onClick={() => onRevoke(s)}
                  aria-label={`Revoke ${s.host}`}
                />
              </>
            ) : null}
          </TableActionsCell>
        </TableRow>
      ))}
    </DataTable>
  );
}
type RotateTokenProps = Readonly<{
  source: z.infer<typeof crawlSourceSchema>;
  projectId: string;
  workspaceId: string;
  onClose: () => void;
}>;
/** Each rotation starts fresh: a new source remounts the dialog and its mutation. */
function RotateTokenDialog({
  source,
  ...props
}: Omit<RotateTokenProps, 'source'> & Readonly<{ source: RotateTokenProps['source'] | null }>) {
  return source ? <RotateToken key={source.id} source={source} {...props} /> : null;
}
/**
 * Rotation has its own dialog and mutation: it shows only the rotation, its
 * failure with a retry, and the new token, never the new-source form.
 */
function RotateToken({ source, projectId, workspaceId, onClose }: RotateTokenProps) {
  const rotate = useMutation(aiTrafficMutations.source({ workspaceId, projectId }));
  const run = () => rotate.mutate({ kind: 'rotate', id: source.id });
  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !rotate.isPending) onClose();
      }}
      title="Rotate token"
      description={`Issue a new token for ${source.host}? The current token stops working.`}
      footer={
        rotate.isSuccess ? (
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose} disabled={rotate.isPending}>
              Cancel
            </Button>
            <Button
              variant="primary"
              pending={rotate.isPending}
              pendingLabel="Rotating…"
              onClick={run}
            >
              {rotate.isError ? 'Rotate again' : 'Rotate token'}
            </Button>
          </>
        )
      }
    >
      {rotate.isError ? (
        <Notice
          kind="mutation"
          notice={mutationNoticeForError(rotate.error, { action: 'rotate the token' })}
        />
      ) : null}
      {rotate.isSuccess ? <IssuedToken issued={{ ...rotate.data, setup: source.setup }} /> : null}
    </Dialog>
  );
}
