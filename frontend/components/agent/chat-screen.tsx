'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router-dom';

import { Composer } from '@/components/agent/composer';
import { Conversation } from '@/components/agent/conversation';
import { OutputPane } from '@/components/agent/output-pane';
import { SkillPicker } from '@/components/agent/skill-picker';
import { PageShell } from '@/components/layout/page-shell';
import { ProjectLink } from '@/components/layout/scoped-link';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/drawer';
import { ReadError } from '@/components/ui/read-error';
import { Skeleton } from '@/components/ui/skeleton';
import { agentWriteFailure } from '@/lib/agent/errors';
import { agentHandoffHref } from '@/lib/agent/handoff';
import { isRunActive } from '@/lib/agent/run-state';
import { useAgentAccess } from '@/lib/agent/use-agent-access';
import { agentMutations, agentQueries, type AgentChatDetail } from '@/lib/api/agent';
import { queryKeys } from '@/lib/api/query-keys';
import { AGENT_RUN_POLL_MS } from '@/lib/config/agent';
import { useProjectContext, useWorkspaceCapability } from '@/lib/project/project-context';

const newKey = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;

/**
 * One chat: the conversation on the left and its output on the right. Reads
 * never run the agent, so while a turn is active the persisted chat is polled
 * until the run reaches a terminal state.
 */
export function ChatScreen() {
  const { chatId = '' } = useParams();
  const { activeProjectId, activeWorkspaceId } = useProjectContext();
  const workspaceId = activeWorkspaceId ?? '';
  const query = useQuery({
    ...agentQueries.chat(workspaceId, chatId),
    enabled: Boolean(workspaceId && chatId),
    refetchInterval: (state) =>
      isRunActive(state.state.data?.latest_run) ? AGENT_RUN_POLL_MS : false,
  });

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
  const [paneOpen, setPaneOpen] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const openOutput = () => {
    setPaneOpen(true);
    setSheetOpen(true);
  };
  const turn = useFollowUp(workspaceId, detail);
  const cancel = useCancel(workspaceId, chatId);

  const pane = detail.output ? (
    <OutputPane
      workspaceId={workspaceId}
      chatId={chatId}
      output={detail.output}
      runActive={runActive}
      canEdit={canEdit}
      canSend={access.canSend}
      onClose={() => {
        setPaneOpen(false);
        setSheetOpen(false);
      }}
    />
  ) : null;

  return (
    <PageShell
      title={detail.chat.title}
      actions={
        <ChatHeaderActions detail={detail} onOpenOutput={hasOutput ? openOutput : undefined} />
      }
    >
      <div className="grid gap-[var(--page-section-gap)] min-[1100px]:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="grid content-start gap-4">
          <Conversation
            detail={detail}
            onOpenOutput={openOutput}
            onRefine={(instruction) => turn.send(instruction)}
            onStop={() =>
              detail.latest_run && cancel.mutate({ chatId, runId: detail.latest_run.id })
            }
            stopping={cancel.isPending}
            canSend={access.canSend && !turn.pending}
          />
          {access.canSend ? null : <Alert tone="info">{access.message}</Alert>}
          <FollowUpFailure turn={turn} actionId={detail.chat.action_id} />
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
        {pane && paneOpen ? <div className="hidden min-[1100px]:block">{pane}</div> : null}
      </div>
      {pane ? (
        <div className="min-[1100px]:hidden">
          <Drawer
            open={sheetOpen}
            onOpenChange={setSheetOpen}
            title="Output"
            hideHeader
            closeLabel="Back to chat"
            className="w-screen max-w-none"
          >
            {pane}
          </Drawer>
        </div>
      ) : null}
    </PageShell>
  );
}

function FollowUpFailure({
  turn,
  actionId,
}: Readonly<{ turn: ReturnType<typeof useFollowUp>; actionId: string | null }>) {
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

function ChatHeaderActions({
  detail,
  onOpenOutput,
}: Readonly<{ detail: AgentChatDetail; onOpenOutput?: () => void }>) {
  return (
    <>
      {detail.chat.action_id ? (
        <Button asChild variant="ghost" size="sm">
          <ProjectLink href={`/agent/actions/${detail.chat.action_id}`}>
            {detail.chat.target_label ?? 'Open Action'}
          </ProjectLink>
        </Button>
      ) : null}
      {onOpenOutput ? (
        <Button variant="secondary" size="sm" onClick={onOpenOutput}>
          <FileText className="size-3.5" aria-hidden />
          Output
        </Button>
      ) : null}
    </>
  );
}

/** A follow-up turn: revises the chat's output when there is one. */
function useFollowUp(workspaceId: string, detail: AgentChatDetail) {
  const chatId = detail.chat.id;
  const [draft, setDraft] = useState('');
  const [skillId, setSkillId] = useState<string | null>(null);
  const [lastMessage, setLastMessage] = useState('');
  const queryClient = useQueryClient();
  const mutation = useMutation({
    ...agentMutations.sendMessage(workspaceId),
    onSuccess: async () => {
      setDraft('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.agent.chat(chatId) }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.agent.chatLists(detail.chat.project_id),
        }),
      ]);
    },
  });
  const send = (message: string) => {
    const text = message.trim();
    if (!text) return;
    setLastMessage(text);
    mutation.mutate({
      chatId,
      message: text,
      skillId: skillId ?? undefined,
      idempotencyKey: newKey(),
    });
  };
  return {
    draft,
    setDraft,
    skillId,
    setSkillId,
    lastMessage,
    send,
    pending: mutation.isPending,
    failure: mutation.isError ? agentWriteFailure(mutation.error) : null,
  };
}

function useCancel(workspaceId: string, chatId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    ...agentMutations.cancelRun(workspaceId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.agent.chat(chatId) }),
  });
}
