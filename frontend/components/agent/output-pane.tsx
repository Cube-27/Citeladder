'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Download, Pencil, X } from 'lucide-react';
import { useState } from 'react';

import { OutputDeclaration } from '@/components/agent/action-declaration';
import { OutputEditor, type OutputDraft } from '@/components/agent/output-editor';
import { OutputHistory } from '@/components/agent/output-history';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { TabPanel, Tabs } from '@/components/ui/tabs';
import { textRole } from '@/components/ui/typography';
import { agentWriteFailure } from '@/lib/agent/errors';
import { downloadOutputMarkdown, outputMarkdown } from '@/lib/agent/export';
import { newIdempotencyKey } from '@/lib/agent/idempotency';
import { OUTPUT_PHASE_LABEL, outputKindLabel } from '@/lib/agent/vocabulary';
import { agentMutations, type AgentOutput, type AgentRevision } from '@/lib/api/agent';
import { queryKeys } from '@/lib/api/query-keys';
import { ContentMarkdown } from '@/lib/markdown/markdown';

type PaneTab = 'output' | 'sources' | 'history';

/**
 * The chat's deliverable. Edits, restores and outline approval are refused by
 * the server while a turn is queued or running, so the pane disables them
 * then rather than offering a control that will fail.
 */
export function OutputPane({
  workspaceId,
  chatId,
  output,
  runActive,
  canEdit,
  canSend,
  onClose,
}: Readonly<{
  workspaceId: string;
  chatId: string;
  output: AgentOutput;
  runActive: boolean;
  canEdit: boolean;
  canSend: boolean;
  onClose: () => void;
}>) {
  const revision = output.latest_revision;
  const [tab, setTab] = useState<PaneTab>('output');
  // Held here, not in the editor, so switching tabs cannot discard it.
  const [draft, setDraft] = useState<OutputDraft | null>(null);
  const editing = draft !== null;
  if (!revision) return null;
  const locked = runActive || !canEdit;
  return (
    <section aria-labelledby="output-title" className="grid content-start gap-3">
      <header className="grid gap-2">
        <div className="flex items-start gap-2">
          <h2 id="output-title" className={textRole('sectionTitle', 'min-w-0 flex-1')}>
            {revision.title}
          </h2>
          <Button variant="ghost" size="icon" aria-label="Close output" onClick={onClose}>
            <X className="size-4" aria-hidden />
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{outputKindLabel(output.kind)}</Badge>
          <Badge>{OUTPUT_PHASE_LABEL[output.phase]}</Badge>
          <span className={textRole('meta')}>Revision {revision.number}</span>
          {output.target_label ? (
            <span className={textRole('meta', 'truncate')}>{output.target_label}</span>
          ) : null}
        </div>
        {editing ? null : (
          <OutputActions
            revision={revision}
            locked={locked}
            onEdit={() => {
              setTab('output');
              setDraft({ baseRevisionId: revision.id, title: revision.title, body: revision.body });
            }}
          />
        )}
        <OutlineApproval
          workspaceId={workspaceId}
          chatId={chatId}
          revision={revision}
          runActive={runActive}
          canSend={canSend}
        />
        {editing ? null : (
          <OutputDeclaration workspaceId={workspaceId} output={output} runActive={runActive} />
        )}
      </header>
      <Tabs
        value={tab}
        onValueChange={setTab}
        ariaLabel="Output views"
        items={[
          { value: 'output', label: OUTPUT_PHASE_LABEL[output.phase] },
          { value: 'sources', label: 'Sources' },
          { value: 'history', label: 'History' },
        ]}
      >
        <TabPanel value="output" className="pt-3">
          {draft ? (
            <OutputEditor
              workspaceId={workspaceId}
              chatId={chatId}
              revision={revision}
              draft={draft}
              onChange={setDraft}
              onDone={() => setDraft(null)}
            />
          ) : (
            <ContentMarkdown markdown={revision.body} density="compact" />
          )}
        </TabPanel>
        <TabPanel value="sources" className="pt-3">
          <Sources refs={revision.source_refs} />
        </TabPanel>
        <TabPanel value="history" className="pt-3">
          {tab === 'history' ? (
            <OutputHistory
              workspaceId={workspaceId}
              chatId={chatId}
              latestRevisionId={revision.id}
              canRestore={!locked}
            />
          ) : null}
        </TabPanel>
      </Tabs>
    </section>
  );
}

function OutputActions({
  revision,
  locked,
  onEdit,
}: Readonly<{ revision: AgentRevision; locked: boolean; onEdit: () => void }>) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="secondary" size="sm" disabled={locked} onClick={onEdit}>
        <Pencil className="size-3.5" aria-hidden />
        Edit
      </Button>
      <CopyButton
        value={outputMarkdown(revision.title, revision.body)}
        size="sm"
        variant="secondary"
      >
        Copy
      </CopyButton>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => downloadOutputMarkdown(revision.title, revision.body)}
      >
        <Download className="size-3.5" aria-hidden />
        Export Markdown
      </Button>
    </div>
  );
}

/** "Use outline & write": the explicit approval that lets a draft be written. */
function OutlineApproval({
  workspaceId,
  chatId,
  revision,
  runActive,
  canSend,
}: Readonly<{
  workspaceId: string;
  chatId: string;
  revision: AgentRevision;
  runActive: boolean;
  canSend: boolean;
}>) {
  const queryClient = useQueryClient();
  const approve = useMutation({
    ...agentMutations.approveOutline(workspaceId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.agent.chat(chatId) }),
  });
  if (revision.phase !== 'outline' || revision.approved_at) return null;
  return (
    <div className="grid gap-2">
      <p className={textRole('body')}>
        Review the outline, edit it if needed, then approve it to write the draft.
      </p>
      {approve.isError ? (
        <Alert tone="danger">{agentWriteFailure(approve.error).message}</Alert>
      ) : null}
      <Button
        className="justify-self-start"
        disabled={!canSend || runActive || approve.isPending}
        onClick={() =>
          approve.mutate({ chatId, revisionId: revision.id, idempotencyKey: newIdempotencyKey() })
        }
      >
        Use outline &amp; write
      </Button>
    </div>
  );
}

const RECORD_LABEL: Record<string, string> = {
  opportunity: 'Recommendation',
  audit: 'Visibility run',
  visibility_result: 'Visibility answer',
  citation: 'Citation',
  prompt: 'Prompt',
  site_snapshot: 'Site Health snapshot',
  site_crawl: 'Site crawl',
  site_page: 'Site page',
  site_link: 'Internal link',
  traffic_snapshot: 'Traffic snapshot',
  demand_snapshot: 'Search Demand snapshot',
  query_snapshot: 'Search Console snapshot',
  query_row: 'Search Console query',
  search_run: 'Search Intelligence run',
  search_dataset: 'Search Intelligence dataset',
  search_row: 'Search Intelligence row',
  action: 'Action',
};

/** The persisted records this revision cites, counted by kind. */
function Sources({ refs }: Readonly<{ refs: string[] }>) {
  if (refs.length === 0)
    return <p className={textRole('body')}>This revision cites no CiteLadder records.</p>;
  const counts = new Map<string, number>();
  for (const ref of refs) {
    const kind = ref.startsWith('citeladder://') ? ref.slice(13).split('/')[0] : '';
    const label = RECORD_LABEL[kind] ?? 'CiteLadder record';
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return (
    <ul className="grid gap-1.5">
      {[...counts].map(([label, count]) => (
        <li key={label} className="flex justify-between gap-3">
          <span className={textRole('body')}>{label}</span>
          <span className={textRole('meta', 'tabular-nums')}>{count}</span>
        </li>
      ))}
    </ul>
  );
}
