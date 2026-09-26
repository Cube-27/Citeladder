'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { DisplayTime } from '@/components/ui/display-time';
import { ReadError } from '@/components/ui/read-error';
import { Skeleton } from '@/components/ui/skeleton';
import { textRole } from '@/components/ui/typography';
import { agentWriteFailure } from '@/lib/agent/errors';
import { OUTPUT_PHASE_LABEL } from '@/lib/agent/vocabulary';
import { agentMutations, agentQueries, type AgentRevision } from '@/lib/api/agent';
import { queryKeys } from '@/lib/api/query-keys';
import { ContentMarkdown } from '@/lib/markdown/markdown';

/**
 * Every revision of the output, newest first. Any earlier revision can be
 * viewed or restored; a restore appends a new revision rather than rewinding.
 */
export function OutputHistory({
  workspaceId,
  chatId,
  latestRevisionId,
  canRestore,
}: Readonly<{
  workspaceId: string;
  chatId: string;
  latestRevisionId: string;
  canRestore: boolean;
}>) {
  const query = useQuery(agentQueries.revisions(workspaceId, chatId, latestRevisionId));
  const [viewing, setViewing] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const restore = useMutation({
    ...agentMutations.restoreRevision(workspaceId),
    onSuccess: async () => {
      setViewing(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.agent.chat(chatId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.agent.revisions(chatId) }),
      ]);
    },
  });

  if (query.isError)
    return (
      <ReadError
        error={query.error}
        fallback="Revision history could not be loaded."
        onRetry={() => void query.refetch()}
        pending={query.isFetching}
      />
    );
  if (!query.data) return <Skeleton className="h-32 w-full" />;
  const revisions = [...query.data.items].sort((a, b) => b.number - a.number);
  return (
    <div className="grid gap-3">
      {restore.isError ? (
        <Alert tone="danger">{agentWriteFailure(restore.error).message}</Alert>
      ) : null}
      <ol aria-label="Revisions" className="divide-border-subtle grid divide-y">
        {revisions.map((revision) => (
          <li key={revision.id} className="grid gap-2 py-3">
            <RevisionRow
              revision={revision}
              latest={revision.id === latestRevisionId}
              open={viewing === revision.id}
              onToggle={() =>
                setViewing((current) => (current === revision.id ? null : revision.id))
              }
              restoring={restore.isPending}
              canRestore={canRestore}
              onRestore={() => restore.mutate({ chatId, revisionId: revision.id })}
            />
          </li>
        ))}
      </ol>
    </div>
  );
}

function RevisionRow({
  revision,
  latest,
  open,
  onToggle,
  restoring,
  canRestore,
  onRestore,
}: Readonly<{
  revision: AgentRevision;
  latest: boolean;
  open: boolean;
  onToggle: () => void;
  restoring: boolean;
  canRestore: boolean;
  onRestore: () => void;
}>) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className={textRole('bodyStrong')}>Revision {revision.number}</span>
        <span className={textRole('meta')}>
          {revision.author === 'user' ? 'Your edit' : 'Agent'} ·{' '}
          {OUTPUT_PHASE_LABEL[revision.phase]}
          {revision.approved_at ? ' · Approved' : ''} · <DisplayTime value={revision.created_at} />
        </span>
        {latest ? <span className={textRole('meta')}>Current</span> : null}
        <span className="flex-1" />
        <Button variant="ghost" size="sm" aria-expanded={open} onClick={onToggle}>
          {open ? 'Hide' : 'View'}
        </Button>
        {latest || !canRestore ? null : (
          <Button variant="secondary" size="sm" disabled={restoring} onClick={onRestore}>
            Restore
          </Button>
        )}
      </div>
      {open ? (
        <div className="grid gap-2">
          <h4 className={textRole('bodyStrong')}>{revision.title}</h4>
          <ContentMarkdown markdown={revision.body} density="compact" />
        </div>
      ) : null}
    </>
  );
}
