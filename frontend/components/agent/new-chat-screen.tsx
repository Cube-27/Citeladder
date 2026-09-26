'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { ActionStatusBadge } from '@/components/agent/action-status-badge';
import { Composer } from '@/components/agent/composer';
import { SkillPicker } from '@/components/agent/skill-picker';
import { useCreateChat } from '@/components/agent/use-chat-turns';
import { PageShell } from '@/components/layout/page-shell';
import { ProjectLink } from '@/components/layout/scoped-link';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Stack } from '@/components/ui/layout';
import { panelClasses } from '@/components/ui/panel';
import { SectionTitle, textRole } from '@/components/ui/typography';
import { useAgentAccess } from '@/lib/agent/use-agent-access';
import {
  agentHandoffHref,
  contextChips,
  parseAgentHandoff,
  withoutContext,
} from '@/lib/agent/handoff';
import { approachLabel, targetKindLabel } from '@/lib/agent/vocabulary';
import { actionsQueries, type Action } from '@/lib/api/actions';
import { AGENT_TOP_ACTIONS } from '@/lib/config/agent';
import { useProjectHref } from '@/lib/navigation/project-destination';
import { useProjectContext } from '@/lib/project/project-context';

const STARTERS = [
  'What should I focus on this week?',
  'Create content for our highest-demand topic.',
  'Fix our most important technical issue.',
] as const;

/**
 * New chat: ask a question, request a deliverable, or pick up an Action.
 * An evidence-screen handoff arrives as typed references in the URL and is
 * shown as removable context before the first message is sent.
 */
export function NewChatScreen() {
  const { activeProjectId, activeWorkspaceId } = useProjectContext();
  const [searchParams] = useSearchParams();
  const handoffKey = searchParams.toString();
  return activeProjectId && activeWorkspaceId ? (
    <NewChat
      key={`${activeProjectId}:${handoffKey}`}
      workspaceId={activeWorkspaceId}
      projectId={activeProjectId}
      searchParams={searchParams}
    />
  ) : (
    <PageShell measure="workflow">
      <Alert tone="info">Select or create a project to start a chat.</Alert>
    </PageShell>
  );
}

function NewChat({
  workspaceId,
  projectId,
  searchParams,
}: Readonly<{ workspaceId: string; projectId: string; searchParams: URLSearchParams }>) {
  const handoff = useMemo(() => parseAgentHandoff(searchParams), [searchParams]);
  const [message, setMessage] = useState(handoff.prompt ?? '');
  const [context, setContext] = useState(handoff.context);
  const [skillId, setSkillId] = useState<string | null>(null);
  const access = useAgentAccess();
  const navigate = useNavigate();
  const projectHref = useProjectHref();
  const create = useCreateChat(workspaceId, projectId, (chatId) =>
    navigate(projectHref(`/agent/chats/${chatId}`)),
  );
  const failure = create.failure;
  // Shares AttachedAction's cache entry. An Action that failed to load is
  // dropped, as that notice promises, rather than failing the whole chat.
  const attached = useQuery({
    ...actionsQueries.detail(workspaceId, handoff.actionId ?? ''),
    enabled: Boolean(handoff.actionId),
  });

  const submit = () =>
    create.start({
      message,
      skillId,
      actionId: attached.isError ? undefined : handoff.actionId,
      context,
    });

  return (
    <PageShell measure="workflow">
      <Stack gap="section">
        {handoff.actionId ? (
          <AttachedAction workspaceId={workspaceId} actionId={handoff.actionId} />
        ) : null}
        {access.canSend ? null : <Alert tone="info">{access.message}</Alert>}
        {failure ? <Alert tone="danger">{failure.message}</Alert> : null}
        <Composer
          id="new-chat-message"
          label="Message the agent"
          value={message}
          onChange={setMessage}
          onSubmit={submit}
          pending={create.pending}
          disabled={!access.canSend}
          placeholder="Ask a question or describe the work you need."
          chips={contextChips(context)}
          onRemoveChip={(chip) => setContext((current) => withoutContext(current, chip.key))}
          tools={<SkillPicker value={skillId} onChange={setSkillId} disabled={!access.canSend} />}
        />
        <fieldset className="flex flex-wrap gap-2" aria-label="Starter prompts">
          {STARTERS.map((starter) => (
            <Button
              key={starter}
              variant="secondary"
              size="sm"
              disabled={!access.canSend}
              onClick={() => setMessage(starter)}
            >
              {starter}
            </Button>
          ))}
        </fieldset>
        {handoff.actionId ? null : <TopActions workspaceId={workspaceId} projectId={projectId} />}
      </Stack>
    </PageShell>
  );
}

function AttachedAction({
  workspaceId,
  actionId,
}: Readonly<{ workspaceId: string; actionId: string }>) {
  const query = useQuery(actionsQueries.detail(workspaceId, actionId));
  if (query.isError)
    return <Alert tone="danger">This Action is unavailable. The chat will start without it.</Alert>;
  if (!query.data) return null;
  const action = query.data;
  return (
    <section aria-label="Working on" className={panelClasses({ pad: 'compact' }, 'grid gap-1')}>
      <span className={textRole('eyebrow')}>Working on</span>
      <div className="flex flex-wrap items-center gap-2">
        <ProjectLink
          href={`/agent/actions/${action.id}`}
          className={textRole('bodyStrong', 'hover:text-accent-text')}
        >
          {action.target_label}
        </ProjectLink>
        <ActionStatusBadge status={action.status} />
      </div>
      <span className={textRole('meta')}>
        {[targetKindLabel(action.target_kind), approachLabel(action.approach)]
          .filter(Boolean)
          .join(' · ')}
      </span>
    </section>
  );
}

function TopActions({
  workspaceId,
  projectId,
}: Readonly<{ workspaceId: string; projectId: string }>) {
  const query = useQuery(actionsQueries.list(workspaceId, projectId));
  const top = query.data?.items.slice(0, AGENT_TOP_ACTIONS) ?? [];
  if (top.length === 0) return null;
  return (
    <section aria-labelledby="top-actions" className="grid gap-3">
      <div className="flex items-center justify-between gap-2">
        <SectionTitle id="top-actions">Recommended Actions</SectionTitle>
        <Button asChild variant="ghost" size="sm">
          <ProjectLink href="/agent/actions">All Actions</ProjectLink>
        </Button>
      </div>
      <ul className="grid gap-2">
        {top.map((action) => (
          <TopActionRow key={action.id} action={action} />
        ))}
      </ul>
    </section>
  );
}

function TopActionRow({ action }: Readonly<{ action: Action }>) {
  return (
    <li className={panelClasses({ pad: 'compact' }, 'flex flex-wrap items-center gap-3')}>
      <div className="grid min-w-0 flex-1 gap-0.5">
        <ProjectLink
          href={`/agent/actions/${action.id}`}
          className={textRole('bodyStrong', 'hover:text-accent-text truncate')}
        >
          {action.target_label}
        </ProjectLink>
        <span className={textRole('meta')}>
          {[approachLabel(action.approach), `${action.families.length} evidence systems`]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </div>
      <Button asChild variant="secondary" size="sm">
        <ProjectLink href={agentHandoffHref({ actionId: action.id })}>Work on this</ProjectLink>
      </Button>
    </li>
  );
}
