'use client';

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router-dom';

import { ActionStatusBadge } from '@/components/agent/action-status-badge';
import { PageShell } from '@/components/layout/page-shell';
import { ProjectLink } from '@/components/layout/scoped-link';
import { EvidenceDrawer } from '@/components/opportunities/evidence-drawer';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Stack } from '@/components/ui/layout';
import { MutationNotice } from '@/components/ui/mutation-notice';
import { panelClasses } from '@/components/ui/panel';
import { ReadError } from '@/components/ui/read-error';
import { Skeleton } from '@/components/ui/skeleton';
import { SectionTitle, textRole } from '@/components/ui/typography';
import { agentHandoffHref } from '@/lib/agent/handoff';
import {
  approachLabel,
  familyLabel,
  FAMILY_STATE_LABEL,
  measurementLegLabel,
  OUTPUT_PHASE_LABEL,
  outputKindLabel,
  targetKindLabel,
} from '@/lib/agent/vocabulary';
import { actionsMutations, actionsQueries, type ActionDetail } from '@/lib/api/actions';
import { agentQueries } from '@/lib/api/agent';
import { mutationNoticeForError } from '@/lib/api/mutation-notice';
import { queryKeys } from '@/lib/api/query-keys';
import { useProjectContext, useWorkspaceCapability } from '@/lib/project/project-context';

/** One Action: deterministic diagnosis, member evidence and linked chats. */
export function ActionDetailScreen() {
  const { actionId = '' } = useParams();
  const { activeProjectId, activeWorkspaceId } = useProjectContext();
  const query = useQuery({
    ...actionsQueries.detail(activeWorkspaceId ?? '', actionId),
    enabled: Boolean(activeWorkspaceId && actionId),
  });

  if (query.isError)
    return (
      <PageShell>
        <ReadError
          error={query.error}
          fallback="This Action could not be loaded."
          onRetry={() => void query.refetch()}
          pending={query.isFetching}
        />
      </PageShell>
    );
  if (!query.data)
    return (
      <PageShell>
        <Skeleton className="h-48 w-full" />
      </PageShell>
    );
  if (query.data.project_id !== activeProjectId)
    return (
      <PageShell>
        <Alert tone="danger">
          This Action belongs to another project. Choose an Action from the current project.
        </Alert>
      </PageShell>
    );
  return <ActionDetailView action={query.data} workspaceId={activeWorkspaceId ?? ''} />;
}

function ActionDetailView({
  action,
  workspaceId,
}: Readonly<{ action: ActionDetail; workspaceId: string }>) {
  const [evidenceId, setEvidenceId] = useState<string | null>(null);
  return (
    <PageShell
      title={action.target_label}
      actions={<ActionControls action={action} workspaceId={workspaceId} />}
    >
      <Stack gap="section">
        <ActionFacts action={action} />
        <Diagnosis action={action} onOpenEvidence={setEvidenceId} />
        <LinkedChats action={action} workspaceId={workspaceId} />
      </Stack>
      <EvidenceDrawer
        opportunityId={evidenceId}
        projectId={action.project_id}
        open={evidenceId !== null}
        onOpenChange={(open) => {
          if (!open) setEvidenceId(null);
        }}
      />
    </PageShell>
  );
}

function ActionControls({
  action,
  workspaceId,
}: Readonly<{ action: ActionDetail; workspaceId: string }>) {
  const mayWrite = useWorkspaceCapability('write');
  const queryClient = useQueryClient();
  const update = useMutation({
    ...actionsMutations.updateStatus(workspaceId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.actions.all }),
  });
  const dismissed = action.status === 'dismissed';
  return (
    <>
      {update.isError ? (
        <MutationNotice
          notice={mutationNoticeForError(update.error, { action: 'update this Action' })}
          onRetry={() => update.variables && update.mutate(update.variables)}
        />
      ) : null}
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
      <Button asChild>
        <ProjectLink href={agentHandoffHref({ actionId: action.id })}>Work on this</ProjectLink>
      </Button>
    </>
  );
}

function ActionFacts({ action }: Readonly<{ action: ActionDetail }>) {
  const facts: { label: string; value: React.ReactNode }[] = [
    { label: 'Status', value: <ActionStatusBadge status={action.status} /> },
    {
      label: 'Priority',
      value: action.priority_score === null ? 'Not scored yet' : action.priority_score.toFixed(1),
    },
    {
      label: 'Evidence',
      value: `${action.families.length} ${action.families.length === 1 ? 'system' : 'systems'}`,
    },
    { label: 'Target', value: targetKindLabel(action.target_kind) ?? 'Target' },
  ];
  return (
    <section aria-label="Summary" className="grid gap-3">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {facts.map((fact) => (
          <div key={fact.label} className="grid gap-1">
            <dt className={textRole('label')}>{fact.label}</dt>
            <dd className={textRole('body')}>{fact.value}</dd>
          </div>
        ))}
      </dl>
      {action.target_url ? (
        <a
          href={action.target_url}
          target="_blank"
          rel="noreferrer"
          className={textRole('body', 'text-accent-text break-all underline')}
        >
          {action.target_url}
        </a>
      ) : null}
      {action.evidence_cleared_at ? (
        <Alert tone="info">No current evidence targets this Action. Its chats are kept.</Alert>
      ) : null}
    </section>
  );
}

function Diagnosis({
  action,
  onOpenEvidence,
}: Readonly<{ action: ActionDetail; onOpenEvidence: (id: string) => void }>) {
  const diagnosis = action.diagnosis;
  const approach = approachLabel(diagnosis.approach ?? action.approach);
  const families = Object.entries(diagnosis.families ?? {}).filter(([family]) =>
    familyLabel(family),
  );
  return (
    <section aria-labelledby="action-diagnosis" className="grid gap-4">
      <SectionTitle id="action-diagnosis">Diagnosis</SectionTitle>
      {approach ? <p className={textRole('bodyStrong')}>{approach}</p> : null}
      <div className="grid gap-2">
        <h3 className={textRole('label')}>What happened</h3>
        {action.members.length === 0 ? (
          <p className={textRole('body')}>No current finding targets this Action.</p>
        ) : (
          <ul className="grid gap-2">
            {action.members.map((member) => (
              <li
                key={member.id}
                className={panelClasses({ pad: 'compact' }, 'flex items-center gap-3')}
              >
                <span className={textRole('body', 'min-w-0 flex-1')}>{member.title}</span>
                <Button variant="ghost" size="sm" onClick={() => onOpenEvidence(member.id)}>
                  View evidence
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {families.length > 0 ? (
        <div className="grid gap-2">
          <h3 className={textRole('label')}>Evidence by system</h3>
          <dl className="grid gap-1.5 sm:grid-cols-2">
            {families.map(([family, state]) => (
              <div key={family} className="flex justify-between gap-3">
                <dt className={textRole('body')}>{familyLabel(family)}</dt>
                <dd className={textRole('meta')}>{FAMILY_STATE_LABEL[state] ?? ''}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
      <TextList title="Avoid" items={diagnosis.donts ?? []} />
      <TextList
        title="Measure with"
        items={(diagnosis.measure_with ?? []).map(measurementLegLabel).filter(isText)}
      />
    </section>
  );
}

const isText = (value: string | null): value is string => Boolean(value);

function TextList({ title, items }: Readonly<{ title: string; items: string[] }>) {
  if (items.length === 0) return null;
  return (
    <div className="grid gap-2">
      <h3 className={textRole('label')}>{title}</h3>
      <ul className="grid list-disc gap-1 ps-5">
        {items.map((item) => (
          <li key={item} className={textRole('body')}>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function LinkedChats({
  action,
  workspaceId,
}: Readonly<{ action: ActionDetail; workspaceId: string }>) {
  const chats = useInfiniteQuery(
    agentQueries.chats(workspaceId, action.project_id, { actionId: action.id }),
  );
  const rows = chats.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <section aria-labelledby="action-chats" className="grid gap-3">
      <SectionTitle id="action-chats">Chats</SectionTitle>
      {chats.isError ? (
        <ReadError
          error={chats.error}
          fallback="Linked chats could not be loaded."
          onRetry={() => void chats.refetch()}
          pending={chats.isFetching}
        />
      ) : null}
      {chats.isSuccess && rows.length === 0 ? (
        <p className={textRole('body')}>No chats have worked on this Action yet.</p>
      ) : null}
      {rows.length > 0 ? (
        <ul className="grid gap-2">
          {rows.map((chat) => (
            <li key={chat.id} className={panelClasses({ pad: 'compact' }, 'grid gap-0.5')}>
              <ProjectLink
                href={`/agent/chats/${chat.id}`}
                className={textRole('bodyStrong', 'hover:text-accent-text')}
              >
                {chat.title}
              </ProjectLink>
              {chat.output_kind && chat.output_phase ? (
                <span className={textRole('meta')}>
                  {outputKindLabel(chat.output_kind)} · {OUTPUT_PHASE_LABEL[chat.output_phase]}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {chats.hasNextPage ? (
        <Button
          variant="secondary"
          size="sm"
          className="justify-self-start"
          disabled={chats.isFetchingNextPage}
          onClick={() => void chats.fetchNextPage()}
        >
          Show more chats
        </Button>
      ) : null}
    </section>
  );
}
