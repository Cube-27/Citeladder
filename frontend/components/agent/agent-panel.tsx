'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { FollowUpFailure } from '@/components/agent/chat-screen';
import { Composer } from '@/components/agent/composer';
import { Conversation } from '@/components/agent/conversation';
import { SkillPicker } from '@/components/agent/skill-picker';
import { useComposerCommands } from '@/components/agent/use-composer-commands';
import { useFollowLatest } from '@/components/agent/use-follow-latest';
import {
  useCancelRun,
  useChatDetail,
  useCreateChat,
  useFollowUp,
} from '@/components/agent/use-chat-turns';
import { navigationMode } from '@/components/layout/nav-items';
import { ProjectLink } from '@/components/layout/scoped-link';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/drawer';
import { ReadError } from '@/components/ui/read-error';
import { Skeleton } from '@/components/ui/skeleton';
import { textRole } from '@/components/ui/typography';
import { contextChips, withoutContext, type AgentHandoff } from '@/lib/agent/handoff';
import { useAgentPanel } from '@/lib/agent/panel-context';
import { isRunActive } from '@/lib/agent/run-state';
import { useAgentAccess } from '@/lib/agent/use-agent-access';
import type { AgentChatDetail } from '@/lib/api/agent';
import { useProjectHref } from '@/lib/navigation/project-destination';
import { useProjectContext } from '@/lib/project/project-context';

const EMPTY_SEED: AgentHandoff = { context: {} };

/**
 * A right-side chat over the current Dashboard screen. It starts from the
 * screen's typed context and uses the same chats, runs and outputs as the
 * Agent workspace; **Open in Agent** continues the chat there.
 */
export function AgentPanel() {
  const panel = useAgentPanel();
  const pathname = useLocation().pathname ?? '';
  const { activeProjectId, activeWorkspaceId } = useProjectContext();
  const onDashboard = navigationMode(pathname) === 'dashboard';
  const setOpen = panel?.setOpen;
  // Leaving the Dashboard (Open in Agent, a workspace link) closes the panel,
  // so returning does not reopen it over the next screen.
  useEffect(() => {
    if (!onDashboard) setOpen?.(false);
  }, [onDashboard, setOpen]);
  if (!panel || !activeProjectId || !activeWorkspaceId) return null;
  const open = panel.open && onDashboard;
  const chatId = panel.chat?.projectId === activeProjectId ? panel.chat.chatId : null;
  const close = () => panel.setOpen(false);
  return (
    <Drawer
      open={open}
      onOpenChange={panel.setOpen}
      title="Agent"
      description="Ask about this screen. Chats are saved in the Agent workspace."
      closeLabel="Close agent"
      // The panel body lays out its own scroll area and bottom-pinned composer.
      bodyClassName="flex flex-col pb-0"
      bodyLabel="Agent conversation"
    >
      {chatId ? (
        <PanelChat
          key={`${activeWorkspaceId}:${chatId}`}
          workspaceId={activeWorkspaceId}
          chatId={chatId}
          projectId={activeProjectId}
          onLeave={close}
          toolbar={
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => panel.setChat(null)}>
                New chat
              </Button>
              <Button asChild variant="secondary" size="sm">
                <ProjectLink href={`/agent/chats/${chatId}`} onClick={close}>
                  Open in Agent
                </ProjectLink>
              </Button>
            </div>
          }
        />
      ) : (
        <PanelStart
          // A fresh draft for each open, from the context captured then.
          key={`${activeProjectId}:${panel.openCount}`}
          workspaceId={activeWorkspaceId}
          projectId={activeProjectId}
          seed={panel.seed ?? EMPTY_SEED}
          onStarted={(id) => panel.setChat({ projectId: activeProjectId, chatId: id })}
        />
      )}
    </Drawer>
  );
}

function PanelStart({
  workspaceId,
  projectId,
  seed,
  onStarted,
}: Readonly<{
  workspaceId: string;
  projectId: string;
  seed: AgentHandoff;
  onStarted: (chatId: string) => void;
}>) {
  const [message, setMessage] = useState(seed.prompt ?? '');
  const [context, setContext] = useState(seed.context);
  const [skillId, setSkillId] = useState<string | null>(seed.skillId ?? null);
  const commands = useComposerCommands({ workspaceId, projectId, onSkill: setSkillId });
  const access = useAgentAccess();
  const create = useCreateChat(workspaceId, projectId, onStarted);
  const hasContext = contextChips(context).length > 0;
  return (
    <PanelLayout
      composer={
        <Composer
          rows={2}
          id="agent-panel-message"
          label="Message the agent"
          value={message}
          onChange={setMessage}
          onSubmit={() =>
            create.start({
              message,
              skillId,
              actionId: seed.actionId,
              context,
              mentions: commands.mentions.map((mention) => mention.id),
            })
          }
          pending={create.pending}
          disabled={!access.canSend}
          placeholder="Ask about what you are looking at."
          chips={contextChips(context)}
          commands={commands}
          onRemoveChip={(chip) => setContext((current) => withoutContext(current, chip.key))}
          tools={
            <SkillPicker
              value={skillId}
              onChange={setSkillId}
              hasAction={Boolean(seed.actionId)}
              disabled={!access.canSend}
            />
          }
        />
      }
    >
      <div className="grid flex-1 content-center justify-items-center gap-2 py-4 text-center">
        <p className={textRole('sectionTitle')}>Ask about this screen</p>
        <p className={textRole('caption', 'max-w-xs')}>
          {hasContext
            ? 'The references below go with your question; remove any you do not need.'
            : 'The agent reads your CiteLadder evidence and answers with sources.'}
        </p>
      </div>
      {access.canSend ? null : <Alert tone="info">{access.message}</Alert>}
      {create.failure ? <Alert tone="danger">{create.failure.message}</Alert> : null}
    </PanelLayout>
  );
}

/** Scrolling content above a composer pinned to the drawer's bottom edge. */
function PanelLayout({
  children,
  composer,
  end,
}: Readonly<{ children: ReactNode; composer: ReactNode; end?: ReactNode }>) {
  return (
    <div className="flex min-h-full flex-1 flex-col gap-4">
      <div className="flex min-w-0 flex-1 flex-col gap-4">{children}</div>
      <div className="bg-elevated z-sticky sticky bottom-0 pt-2 pb-4">{composer}</div>
      {end}
    </div>
  );
}

function PanelChat({
  workspaceId,
  chatId,
  projectId,
  onLeave,
  toolbar,
}: Readonly<{
  workspaceId: string;
  chatId: string;
  projectId: string;
  onLeave: () => void;
  toolbar: ReactNode;
}>) {
  const query = useChatDetail(workspaceId, chatId);
  if (query.isError)
    return (
      <ReadError
        error={query.error}
        fallback="This chat could not be loaded."
        onRetry={() => void query.refetch()}
        pending={query.isFetching}
      />
    );
  if (!query.data) return <Skeleton className="h-48 w-full" />;
  if (query.data.chat.project_id !== projectId)
    return <Alert tone="danger">This chat belongs to another project.</Alert>;
  return (
    <PanelConversation
      workspaceId={workspaceId}
      detail={query.data}
      onLeave={onLeave}
      toolbar={toolbar}
    />
  );
}

function PanelConversation({
  workspaceId,
  detail,
  onLeave,
  toolbar,
}: Readonly<{
  workspaceId: string;
  detail: AgentChatDetail;
  onLeave: () => void;
  toolbar: ReactNode;
}>) {
  const chatId = detail.chat.id;
  const access = useAgentAccess();
  const navigate = useNavigate();
  const projectHref = useProjectHref();
  const runActive = isRunActive(detail.latest_run);
  const turn = useFollowUp(workspaceId, detail);
  const cancel = useCancelRun(workspaceId, chatId);
  // The panel is too narrow for the output editor; the workspace owns it.
  const openOutput = () => {
    onLeave();
    navigate(projectHref(`/agent/chats/${chatId}`));
  };
  const { endRef, showJump, jumpToLatest } = useFollowLatest(detail);
  return (
    <PanelLayout
      end={<div ref={endRef} />}
      composer={
        <>
          {showJump ? (
            <Button variant="secondary" size="sm" onClick={jumpToLatest}>
              Jump to latest
            </Button>
          ) : null}
          <Composer
            rows={2}
            id="agent-panel-reply"
            label="Reply to the agent"
            value={turn.draft}
            onChange={turn.setDraft}
            onSubmit={() => turn.send(turn.draft)}
            pending={turn.pending}
            disabled={!access.canSend}
            submissionDisabled={runActive}
            placeholder="Ask a follow-up. / picks a skill, @ mentions an Action."
            commands={turn.commands}
            tools={
              <SkillPicker
                value={turn.skillId}
                onChange={turn.setSkillId}
                outputKind={detail.output?.kind}
                inheritedSkillId={
                  detail.pinned_skill_id ??
                  (!detail.chat.action_id ? detail.output?.skill_id : null)
                }
                hasAction={Boolean(detail.chat.action_id)}
                disabled={!access.canSend || runActive}
              />
            }
          />
        </>
      }
    >
      {toolbar}
      <Conversation
        detail={detail}
        output={
          detail.output?.latest_revision ? (
            <div className="grid justify-items-start gap-2">
              <span className={textRole('itemTitle')}>{detail.output.latest_revision.title}</span>
              <Button variant="secondary" size="sm" onClick={openOutput}>
                Open output
              </Button>
            </div>
          ) : null
        }
        onRefine={turn.suggest}
        onRecover={turn.recover}
        hasDraft={Boolean(turn.draft.trim() || turn.commands.mentions.length)}
        sending={turn.pending}
        onStop={() => detail.latest_run && cancel.mutate({ chatId, runId: detail.latest_run.id })}
        stopping={cancel.isPending}
        canSend={access.canSend && !turn.pending}
      />
      {access.canSend ? null : <Alert tone="info">{access.message}</Alert>}
      <FollowUpFailure turn={turn} actionId={detail.chat.action_id} canSend={access.canSend} />
    </PanelLayout>
  );
}
