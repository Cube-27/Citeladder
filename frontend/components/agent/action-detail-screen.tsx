'use client';

import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { useMatch, useParams } from 'react-router-dom';

import {
  isDeclarable,
  MarkImplementedButton,
  ContextualLinkDeclarationRoute,
} from '@/components/agent/action-declaration';
import {
  ContentGapWhy,
  contentGapHandoff,
  contentGapMembers,
} from '@/components/agent/content-gap-evidence';
import { DeclarationStatus } from '@/components/agent/declaration-status';
import { useAgentCatalog } from '@/components/agent/use-agent-catalog';
import { ActionPriorityBadge, ActionStatusBadge } from '@/components/agent/action-status-badge';
import { DetailScreen } from '@/components/layout/page-shell';
import { ProjectLink } from '@/components/ui/project-link';
import { EvidenceDrawer } from '@/components/opportunities/evidence-drawer';
import { Callout } from '@/components/ui/callout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FactList, type Fact } from '@/components/ui/facts';
import { Inline, Stack } from '@/components/ui/layout';
import { MutationNotice } from '@/components/ui/mutation-notice';
import { QueryState } from '@/components/ui/query-state';
import { ReadError, readErrorProps } from '@/components/ui/read-error';
import { TextLink } from '@/components/ui/text-link';
import { textRole } from '@/components/ui/typography';
import {
  EditorialSectionHeader,
  ledgerClasses,
  ledgerItemClasses,
} from '@/components/ui/workspace';
import { agentHandoffHref } from '@/lib/agent/handoff';
import {
  approachLabel,
  familyLabel,
  measurementLegLabel,
  targetKindLabel,
} from '@/lib/agent/vocabulary';
import { actionsMutations, actionsQueries, type ActionDetail } from '@/lib/api/actions';
import { agentQueries } from '@/lib/api/agent';
import { mutationNoticeForError } from '@/lib/api/mutation-notice';
import { readableUrl } from '@/lib/format';
import { useProjectScope } from '@/lib/project/active-project-scope';
import { useWorkspaceCapability } from '@/lib/project/project-context';
import type { ActionSurface } from '@citeladder/contracts/action-surface';
import { ACTION_SURFACE_SCREENS } from '@citeladder/contracts/record-kinds';

/** Each surface's list, which an Action's page returns to. */
const BACK = {
  actions: { href: ACTION_SURFACE_SCREENS.actions, label: 'Back to Actions' },
  content: { href: ACTION_SURFACE_SCREENS.content, label: 'Back to Content optimization' },
} as const satisfies Record<ActionSurface, { href: string; label: string }>;

/**
 * One Action: diagnosis, member evidence, its declaration and linked chats.
 * Both Actions and Content optimization open it, and the page belongs to the
 * collection it was opened under: the back link follows that route while
 * loading and once loaded alike, so it never changes under the reader.
 */
export function ActionDetailScreen() {
  const { actionId = '' } = useParams();
  const { workspaceId, projectId } = useProjectScope();
  const opened = useMatch(`${ACTION_SURFACE_SCREENS.content}/:actionId`) ? 'content' : 'actions';
  const query = useQuery({
    ...actionsQueries.detail(workspaceId, actionId),
    enabled: Boolean(actionId),
  });
  const back = BACK[opened];

  if (query.isError)
    return (
      <DetailScreen back={back}>
        <QueryState
          kind="error"
          {...readErrorProps(query)}
          fallback="This Action could not be loaded."
        />
      </DetailScreen>
    );
  if (!query.data)
    return (
      <DetailScreen back={back}>
        <QueryState kind="loading" />
      </DetailScreen>
    );
  if (query.data.project_id !== projectId)
    return (
      <DetailScreen back={back}>
        <Callout tone="negative">
          This Action belongs to another project. Choose an Action from the current project.
        </Callout>
      </DetailScreen>
    );
  // Keyed so a mutation's state (and its Retry) never outlives its Action.
  return (
    <ActionDetailView
      key={query.data.id}
      action={query.data}
      workspaceId={workspaceId}
      back={back}
    />
  );
}

function ActionDetailView({
  action,
  workspaceId,
  back,
}: Readonly<{
  action: ActionDetail;
  workspaceId: string;
  back: (typeof BACK)[ActionSurface];
}>) {
  const [evidenceId, setEvidenceId] = useState<string | null>(null);
  // Owned here, not by the controls, so a failure notice renders in the body
  // and the one-row header never has to hold it.
  const update = useStatusUpdate(workspaceId);
  const gaps = contentGapMembers(action);
  return (
    <DetailScreen
      title={readableUrl(action.target_label)}
      back={{ ...back, projectId: action.project_id }}
      actions={<ActionControls action={action} update={update} />}
      lead={<ActionFacts action={action} />}
      aside={
        <>
          <TextList title="Avoid" items={action.diagnosis.donts ?? []} />
          <TextList
            title="Measure with"
            items={(action.diagnosis.measure_with ?? []).map(measurementLegLabel).filter(isText)}
          />
        </>
      }
    >
      {update.isError ? (
        <MutationNotice
          notice={mutationNoticeForError(update.error, { action: 'update this Action' })}
          onRetry={() => update.variables && update.mutate(update.variables)}
        />
      ) : null}
      {gaps.length > 0 ? <ContentGapWhy members={gaps} workspaceId={workspaceId} /> : null}
      <Diagnosis action={action} onOpenEvidence={setEvidenceId} />
      <Implementation action={action} workspaceId={workspaceId} />
      <LinkedChats action={action} workspaceId={workspaceId} />
      <EvidenceDrawer
        opportunityId={evidenceId}
        projectId={action.project_id}
        open={evidenceId !== null}
        onOpenChange={(open) => {
          if (!open) setEvidenceId(null);
        }}
      />
    </DetailScreen>
  );
}

function useStatusUpdate(workspaceId: string) {
  return useMutation(actionsMutations.updateStatus(workspaceId));
}

type StatusUpdate = ReturnType<typeof useStatusUpdate>;

function ActionControls({
  action,
  update,
}: Readonly<{ action: ActionDetail; update: StatusUpdate }>) {
  const mayWrite = useWorkspaceCapability('write');
  const dismissed = action.status === 'dismissed';
  // A content gap hands off with its workflow; any other Action with itself alone.
  const handoff = contentGapHandoff(action) ?? {
    label: 'Work on this with the agent',
    href: agentHandoffHref({ actionId: action.id }),
  };
  return (
    <>
      {mayWrite ? (
        <Button
          variant="secondary"
          disabled={update.isPending}
          onClick={() =>
            update.mutate({ actionId: action.id, status: dismissed ? 'open' : 'dismissed' })
          }
        >
          {dismissed ? 'Reopen' : 'Dismiss'}
        </Button>
      ) : null}
      <Button asChild variant="primary">
        <ProjectLink href={handoff.href}>{handoff.label}</ProjectLink>
      </Button>
    </>
  );
}

/**
 * The lead under the title. The title already names the target, so the lead
 * never repeats its URL: it carries the status and the approach, and the
 * target opens from a short link.
 */
function ActionFacts({ action }: Readonly<{ action: ActionDetail }>) {
  const approach = approachLabel(action.approach);
  const facts: Fact[] = [
    { label: 'Status', value: <ActionStatusBadge status={action.status} /> },
    { label: 'Priority', value: <ActionPriorityBadge score={action.priority_score} /> },
  ];
  if (approach) facts.push({ label: 'Approach', value: approach });
  facts.push({ label: 'Target', value: targetKindLabel(action.target_kind) ?? 'Target' });
  const sources = action.families.map(familyLabel).filter(isText);
  if (sources.length) facts.push({ label: 'Source', value: sources.join(', ') });
  return (
    <Stack as="section" aria-label="Summary">
      <FactList layout="inline" facts={facts} />
      {action.target_url ? (
        <TextLink
          variant="external"
          href={action.target_url}
          text="body"
          className="justify-self-start"
        >
          Open the page
        </TextLink>
      ) : null}
      {action.evidence_cleared_at ? (
        <Callout tone="info">No current evidence targets this Action. Its chats are kept.</Callout>
      ) : null}
    </Stack>
  );
}

function Diagnosis({
  action,
  onOpenEvidence,
}: Readonly<{ action: ActionDetail; onOpenEvidence: (id: string) => void }>) {
  return (
    <Card aria-labelledby="action-diagnosis">
      <CardHeader>
        <CardTitle id="action-diagnosis">Diagnosis</CardTitle>
      </CardHeader>
      <CardContent>
        {action.members.length === 0 ? (
          <QueryState kind="empty" inline message="No current finding targets this Action." />
        ) : (
          <ul className={ledgerClasses()}>
            {action.members.map((member) => (
              <Inline
                as="li"
                key={member.id}
                gap="compact"
                className={ledgerItemClasses('flex-wrap items-start')}
              >
                <Stack as="span" gap="tight" className="min-w-0 flex-1">
                  <span className={textRole('itemTitle')}>{member.title}</span>
                  <span className={textRole('caption')}>{member.remediation}</span>
                </Stack>
                <Button variant="ghost" onClick={() => onOpenEvidence(member.id)}>
                  View evidence
                </Button>
              </Inline>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

const isText = (value: string | null): value is string => Boolean(value);

/**
 * The declaration loop (plan §9): what was declared and what each leg awaits,
 * or the way to declare work done outside CiteLadder. An Agent output is
 * declared from its chat, which names the exact revision shipped.
 */
function Implementation({
  action,
  workspaceId,
}: Readonly<{ action: ActionDetail; workspaceId: string }>) {
  const mayWrite = useWorkspaceCapability('write');
  const [declared, setDeclared] = useState(false);
  const approach = approachLabel(action.diagnosis.approach ?? action.approach);
  const canDeclare = isDeclarable(action) && mayWrite;
  if (!action.declaration && !canDeclare && !approach) return null;
  let declarationBody: ReactNode = null;
  if (action.declaration) {
    declarationBody = (
      <DeclarationStatus
        declaration={action.declaration}
        workspaceId={workspaceId}
        focusOnMount={declared}
      />
    );
  } else if (canDeclare) {
    declarationBody = (
      <Stack>
        <p className={textRole('body')}>
          When this work is live, declare it so CiteLadder can measure it. To declare an Agent
          output, use Mark implemented in its chat.
        </p>
        <div>
          {action.members.some((member) => member.rule_id === 'site_contextual_links') ? (
            <ContextualLinkDeclarationRoute />
          ) : (
            <MarkImplementedButton
              workspaceId={workspaceId}
              action={action}
              revision={null}
              onDeclared={() => setDeclared(true)}
            />
          )}
        </div>
      </Stack>
    );
  }
  return (
    <Card aria-labelledby="action-implementation">
      <CardHeader>
        <CardTitle id="action-implementation">Implementation</CardTitle>
      </CardHeader>
      <CardContent>
        <Stack>
          {approach ? <p className={textRole('itemTitle')}>{approach}</p> : null}
          {declarationBody}
        </Stack>
      </CardContent>
    </Card>
  );
}

function TextList({ title, items }: Readonly<{ title: string; items: string[] }>) {
  if (items.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <Stack as="ul" gap="tight" className="list-inside list-disc">
          {items.map((item) => (
            <li key={item} className={textRole('body')}>
              {item}
            </li>
          ))}
        </Stack>
      </CardContent>
    </Card>
  );
}

function LinkedChats({
  action,
  workspaceId,
}: Readonly<{ action: ActionDetail; workspaceId: string }>) {
  const { kindLabel } = useAgentCatalog();
  const chats = useInfiniteQuery(
    agentQueries.chats({ workspaceId, projectId: action.project_id }, { actionId: action.id }),
  );
  const rows = chats.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <Stack as="section" aria-labelledby="action-chats">
      <EditorialSectionHeader title="Chats" headingId="action-chats" />
      {chats.isError ? (
        <ReadError {...readErrorProps(chats)} fallback="Linked chats could not be loaded." />
      ) : null}
      {chats.isSuccess && rows.length === 0 ? (
        <QueryState kind="empty" inline message="No chats have worked on this Action yet." />
      ) : null}
      {rows.length > 0 ? (
        // One list in one card: a card per chat stacked boxes for a single row
        // of text each.
        <Card>
          <CardContent>
            <ul className={ledgerClasses()}>
              {rows.map((chat) => (
                <Stack as="li" gap="tight" key={chat.id} className={ledgerItemClasses()}>
                  <TextLink
                    href={`/agent/chats/${chat.id}`}
                    text="itemTitle"
                    className="justify-self-start"
                  >
                    {chat.title}
                  </TextLink>
                  {chat.output_kind ? (
                    <span className={textRole('caption')}>{kindLabel(chat.output_kind)}</span>
                  ) : null}
                </Stack>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
      {chats.hasNextPage ? (
        <Button
          variant="secondary"
          className="justify-self-start"
          disabled={chats.isFetchingNextPage}
          onClick={() => void chats.fetchNextPage()}
        >
          Show more chats
        </Button>
      ) : null}
    </Stack>
  );
}
