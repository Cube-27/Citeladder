'use client';

import { useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';

import { Composer } from '@/components/agent/composer';
import { Conversation } from '@/components/agent/conversation';
import { OutputPane } from '@/components/agent/output-pane';
import { SkillPicker } from '@/components/agent/skill-picker';
import {
  useCancelRun,
  useChatDetail,
  useFollowUp,
  type FollowUp,
} from '@/components/agent/use-chat-turns';
import { PageShell } from '@/components/layout/page-shell';
import { ProjectLink } from '@/components/layout/scoped-link';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ReadError } from '@/components/ui/read-error';
import { Skeleton } from '@/components/ui/skeleton';
import { agentHandoffHref } from '@/lib/agent/handoff';
import { isRunActive } from '@/lib/agent/run-state';
import { useAgentAccess } from '@/lib/agent/use-agent-access';
import type { AgentChatDetail } from '@/lib/api/agent';
import { useProjectContext, useWorkspaceCapability } from '@/lib/project/project-context';

/** One chat: a single thread with its output inline and the composer pinned below. */
export function ChatScreen() {
  const { chatId = '' } = useParams();
  const { activeProjectId, activeWorkspaceId } = useProjectContext();
  const workspaceId = activeWorkspaceId ?? '';
  const query = useChatDetail(workspaceId, chatId);

  if (query.isError)
    return (
      <PageShell>
        <ReadError
          error={query.error}
          fallback="This chat could not be loaded."
          onRetry={() => void query.refetch()}
          pending={query.isFetching}
        />
      </PageShell>
    );
  if (!query.data)
    return (
      <PageShell>
        <Skeleton className="h-64 w-full" />
      </PageShell>
    );
  if (query.data.chat.project_id !== activeProjectId)
    return (
      <PageShell>
        <Alert tone="danger">This chat belongs to another project.</Alert>
      </PageShell>
    );
  return <ChatView key={chatId} detail={query.data} workspaceId={workspaceId} />;
}

function ChatView({
  detail,
  workspaceId,
}: Readonly<{ detail: AgentChatDetail; workspaceId: string }>) {
  const chatId = detail.chat.id;
  const access = useAgentAccess();
  const canEdit = useWorkspaceCapability('run');
  const runActive = isRunActive(detail.latest_run);
  const hasOutput = Boolean(detail.output?.latest_revision);
  const turn = useFollowUp(workspaceId, detail);
  const cancel = useCancelRun(workspaceId, chatId);
  const endRef = useRef<HTMLDivElement>(null);
  const latestRevisionId = detail.output?.latest_revision?.id;

  // Like any chat window: a new turn, run state or revision scrolls the thread
  // to its end, so the latest entry sits just above the pinned composer.
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [detail.messages.length, detail.latest_run?.status, latestRevisionId]);

  return (
    <PageShell
      measure="workflow"
      className="flex min-h-[calc(100dvh-var(--page-band-identity)-2*var(--content-gutter))] flex-col pb-0"
      actions={<ChatHeaderActions detail={detail} />}
    >
      <div className="grid min-w-0 flex-1 content-start gap-4">
        <Conversation
          detail={detail}
          output={
            detail.output ? (
              <OutputPane
                workspaceId={workspaceId}
                chatId={chatId}
                output={detail.output}
                runActive={runActive}
                canEdit={canEdit}
                canSend={access.canSend && !turn.pending}
                onRevise={(message) => turn.send(message)}
              />
            ) : null
          }
          onRefine={(instruction) => turn.send(instruction)}
          onStop={() => detail.latest_run && cancel.mutate({ chatId, runId: detail.latest_run.id })}
          stopping={cancel.isPending}
          canSend={access.canSend && !turn.pending}
        />
        {access.canSend ? null : <Alert tone="info">{access.message}</Alert>}
        <FollowUpFailure turn={turn} actionId={detail.chat.action_id} />
      </div>
      {/* The composer stays at the bottom of the window while the thread scrolls. */}
      <div className="bg-panel z-sticky sticky bottom-0 pt-3 pb-[var(--content-gutter)]">
        <Composer
          id="chat-message"
          label="Reply to the agent"
          value={turn.draft}
          onChange={turn.setDraft}
          onSubmit={() => turn.send(turn.draft)}
          pending={turn.pending}
          disabled={!access.canSend || runActive}
          placeholder={hasOutput ? 'Ask for a change to the output.' : 'Ask a follow-up.'}
          tools={
            <SkillPicker
              value={turn.skillId}
              onChange={turn.setSkillId}
              outputKind={detail.output?.kind}
              disabled={!access.canSend || runActive}
            />
          }
        />
      </div>
      <div ref={endRef} />
    </PageShell>
  );
}

export function FollowUpFailure({
  turn,
  actionId,
}: Readonly<{ turn: FollowUp; actionId: string | null }>) {
  if (!turn.failure) return null;
  return (
    <Alert tone="danger">
      {turn.failure.message}{' '}
      {turn.failure.startNewChat ? (
        <ProjectLink
          href={agentHandoffHref({ actionId, prompt: turn.lastMessage })}
          className="underline"
        >
          Start a new chat
        </ProjectLink>
      ) : null}
    </Alert>
  );
}

function ChatHeaderActions({ detail }: Readonly<{ detail: AgentChatDetail }>) {
  if (!detail.chat.action_id) return null;
  return (
    <Button asChild variant="ghost" size="sm">
      <ProjectLink href={`/agent/actions/${detail.chat.action_id}`}>Open Action</ProjectLink>
    </Button>
  );
}
