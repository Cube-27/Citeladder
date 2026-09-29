'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { DisplayTime } from '@/components/ui/display-time';
import { ReadError } from '@/components/ui/read-error';
import { Skeleton } from '@/components/ui/skeleton';
import { textRole } from '@/components/ui/typography';
import { diffLines } from '@/lib/agent/diff';
import { agentWriteFailure } from '@/lib/agent/errors';
import { OUTPUT_PHASE_LABEL } from '@/lib/agent/vocabulary';
import { agentMutations, agentQueries, type AgentRevision } from '@/lib/api/agent';
import { queryKeys } from '@/lib/api/query-keys';
import { ContentMarkdown } from '@/lib/markdown/markdown';
import { cn } from '@/lib/utils';

type View = { id: string; mode: 'view' | 'compare' } | null;

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
  const [viewing, setViewing] = useState<View>(null);
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
  const current = revisions.find((revision) => revision.id === latestRevisionId);
  const toggle = (id: string, mode: 'view' | 'compare') =>
    setViewing((open) => (open?.id === id && open.mode === mode ? null : { id, mode }));
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
              open={viewing?.id === revision.id ? viewing.mode : null}
              current={current}
              onToggle={(mode) => toggle(revision.id, mode)}
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
  current,
  onToggle,
  restoring,
  canRestore,
  onRestore,
}: Readonly<{
  revision: AgentRevision;
  latest: boolean;
  open: 'view' | 'compare' | null;
  current: AgentRevision | undefined;
  onToggle: (mode: 'view' | 'compare') => void;
  restoring: boolean;
  canRestore: boolean;
  onRestore: () => void;
}>) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className={textRole('itemTitle')}>Revision {revision.number}</span>
        <span className={textRole('caption')}>
          {revision.author === 'user' ? 'Your edit' : 'Agent'} ·{' '}
          {OUTPUT_PHASE_LABEL[revision.phase]}
          {revision.approved_at ? ' · Approved' : ''} · <DisplayTime value={revision.created_at} />
        </span>
        {latest ? <span className={textRole('caption')}>Current</span> : null}
        <span className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={open === 'view'}
          onClick={() => onToggle('view')}
        >
          {open === 'view' ? 'Hide' : 'View'}
        </Button>
        {latest || !current ? null : (
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={open === 'compare'}
            onClick={() => onToggle('compare')}
          >
            Compare with current
          </Button>
        )}
        {latest || !canRestore ? null : (
          <Button variant="secondary" size="sm" disabled={restoring} onClick={onRestore}>
            Restore
          </Button>
        )}
      </div>
      {open === 'view' ? (
        <div className="grid gap-2">
          <h4 className={textRole('itemTitle')}>{revision.title}</h4>
          <ContentMarkdown markdown={revision.body} density="compact" />
        </div>
      ) : null}
      {open === 'compare' && current ? <RevisionDiff before={revision} after={current} /> : null}
    </>
  );
}

const DIFF_LINE = {
  same: { mark: ' ', label: null, tone: 'text-muted' },
  removed: { mark: '−', label: 'Removed', tone: 'bg-danger-bg text-danger-text' },
  added: { mark: '+', label: 'Added', tone: 'bg-success-bg text-success-text' },
} as const;

/** What changed from this revision to the current one, line by line. */
function RevisionDiff({
  before,
  after,
}: Readonly<{ before: AgentRevision; after: AgentRevision }>) {
  const lines = diffLines(
    `# ${before.title}\n\n${before.body}`,
    `# ${after.title}\n\n${after.body}`,
  );
  if (lines === null)
    return (
      <p className={textRole('body')}>
        These revisions are too long to compare line by line. View each one instead.
      </p>
    );
  const changed = lines.filter((line) => line.kind !== 'same').length;
  const noun = changed === 1 ? 'line' : 'lines';
  const summary = changed === 0 ? 'no changes' : `${changed} changed ${noun}`;
  const occurrences = new Map<string, number>();
  const keyedLines = lines.map((line) => {
    const content = JSON.stringify([line.kind, line.text]);
    const occurrence = occurrences.get(content) ?? 0;
    occurrences.set(content, occurrence + 1);
    return { ...line, key: `${content}:${occurrence}` };
  });
  return (
    <div className="grid gap-2">
      <p className={textRole('caption')}>
        Revision {before.number} → current (revision {after.number}): {summary}
      </p>
      <ol
        aria-label={`Changes from revision ${before.number}`}
        className={textRole(
          'caption',
          'border-border-subtle grid overflow-x-auto rounded-[var(--radius-control)] border font-mono',
        )}
      >
        {keyedLines.map((line) => {
          const style = DIFF_LINE[line.kind];
          return (
            <li key={line.key} className={cn('flex gap-2 px-2 whitespace-pre-wrap', style.tone)}>
              <span aria-hidden>{style.mark}</span>
              {style.label ? <span className="sr-only">{style.label}:</span> : null}
              <span>{line.text || ' '}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
