'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { BrandProfilePanel } from '@/components/knowledge-base/brand-profile-panel';
import { PageShell } from '@/components/layout/page-shell';
import { CompetitorSuggestions } from '@/components/visibility/prompt-insights';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { DisplayTime } from '@/components/ui/display-time';
import { Stack } from '@/components/ui/layout';
import { MutationNotice } from '@/components/ui/mutation-notice';
import { ReadError } from '@/components/ui/read-error';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { SectionTitle, textRole } from '@/components/ui/typography';
import { agentMutations, agentQueries } from '@/lib/api/agent';
import { mutationNoticeForError } from '@/lib/api/mutation-notice';
import { projectsApi } from '@/lib/api/projects';
import { queryKeys } from '@/lib/api/query-keys';
import { visibilityApi } from '@/lib/api/visibility';
import type { Project } from '@/lib/api/types';
import { useProjectContext, useWorkspaceCapability } from '@/lib/project/project-context';

/**
 * What the agent knows about the business before it reads any evidence: the
 * company facts and competitors every surface shares, and the project's Agent
 * instructions (audience, voice and standing requirements).
 */
export function ContextScreen() {
  const { activeProject, activeWorkspaceId } = useProjectContext();
  if (!activeProject || !activeWorkspaceId)
    return (
      <PageShell measure="workflow">
        <Alert tone="info">Select or create a project to edit its context.</Alert>
      </PageShell>
    );
  return (
    <PageShell measure="workflow">
      <Stack gap="section">
        <AgentInstructions
          key={activeProject.id}
          workspaceId={activeWorkspaceId}
          projectId={activeProject.id}
        />
        <CompanyFacts workspaceId={activeWorkspaceId} project={activeProject} />
      </Stack>
    </PageShell>
  );
}

function AgentInstructions({
  workspaceId,
  projectId,
}: Readonly<{ workspaceId: string; projectId: string }>) {
  const query = useQuery(agentQueries.instructions(workspaceId, projectId));
  return (
    <section aria-labelledby="agent-instructions" className="grid gap-3">
      <SectionTitle id="agent-instructions">Agent instructions</SectionTitle>
      <p className={textRole('body')}>
        Audience, voice and standing requirements the agent follows in every chat for this project.
      </p>
      {query.isError ? (
        <ReadError
          error={query.error}
          fallback="Agent instructions could not be loaded."
          onRetry={() => void query.refetch()}
          pending={query.isFetching}
        />
      ) : null}
      {query.isPending ? <Skeleton className="h-32 w-full" /> : null}
      {query.data ? (
        // Keyed by project so an unsaved draft never carries to another project.
        <InstructionsEditor
          key={projectId}
          workspaceId={workspaceId}
          projectId={projectId}
          text={query.data.text}
          savedAt={query.data.created_at}
        />
      ) : null}
    </section>
  );
}

function InstructionsEditor({
  workspaceId,
  projectId,
  text,
  savedAt,
}: Readonly<{ workspaceId: string; projectId: string; text: string; savedAt: string | null }>) {
  const mayEdit = useWorkspaceCapability('run');
  const queryClient = useQueryClient();
  // Null follows persisted data; a local edit survives background refreshes.
  const [edit, setEdit] = useState<{ text: string | null; baseline: string; version: number }>({
    text: null,
    baseline: text,
    version: 0,
  });
  const draft = edit.text ?? text;
  const save = useMutation({
    ...agentMutations.saveInstructions(workspaceId),
    onMutate: () => ({ version: edit.version, draft }),
    onSuccess: (saved, submitted, submittedEdit) => {
      queryClient.setQueryData(queryKeys.agent.instructions(projectId), saved);
      setEdit((current) => ({
        text:
          current.version === submittedEdit?.version && submittedEdit.draft === submitted.text
            ? null
            : (current.text ?? current.baseline),
        baseline: saved.text,
        version: current.version,
      }));
    },
  });
  const dirty = draft.trim() !== text.trim();
  return (
    <form
      className="grid gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate({ projectId, text: draft });
      }}
    >
      <label htmlFor="agent-instructions-text" className="sr-only">
        Agent instructions
      </label>
      <Textarea
        id="agent-instructions-text"
        value={draft}
        onChange={(event) => {
          const next = event.target.value;
          setEdit((current) => ({
            text: next === text ? null : next,
            baseline: text,
            version: current.version + 1,
          }));
        }}
        rows={8}
        readOnly={!mayEdit}
        placeholder="For example: Write for Australian parents. Plain, warm tone. Never promise delivery dates."
      />
      {save.isError ? (
        <MutationNotice
          notice={mutationNoticeForError(save.error, { action: 'save the instructions' })}
          onRetry={() => save.variables && save.mutate(save.variables)}
        />
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={textRole('meta')}>
          {savedAt ? (
            <>
              Saved <DisplayTime value={savedAt} />
            </>
          ) : (
            'Not set'
          )}
        </span>
        {mayEdit ? (
          <Button type="submit" disabled={!dirty || save.isPending}>
            Save instructions
          </Button>
        ) : null}
      </div>
    </form>
  );
}

/** Company facts and competitors, moved here from the Overview facts drawer. */
function CompanyFacts({
  workspaceId,
  project,
}: Readonly<{ workspaceId: string; project: Project }>) {
  const queryClient = useQueryClient();
  const profile = useQuery({
    queryKey: queryKeys.projects.brandProfile(project.id),
    queryFn: ({ signal }) => projectsApi.getBrandProfile(project.id, { signal, workspaceId }),
  });
  const suggestions = useQuery({
    queryKey: queryKeys.visibility.competitorSuggestions(project.id),
    queryFn: ({ signal }) =>
      visibilityApi.listCompetitorSuggestions(project.id, { signal, workspaceId }),
  });
  return (
    <section aria-labelledby="company-facts" className="grid gap-3">
      <SectionTitle id="company-facts">Company facts</SectionTitle>
      <p className={textRole('body')}>
        The canonical facts and competitors used across CiteLadder, including by the agent.
      </p>
      {profile.isError ? (
        <ReadError
          error={profile.error}
          fallback="Company facts could not be loaded."
          onRetry={() => void profile.refetch()}
          pending={profile.isFetching}
        />
      ) : null}
      {profile.isPending ? <Skeleton className="h-48 w-full" /> : null}
      {profile.data ? (
        <BrandProfilePanel
          key={project.id}
          projectId={project.id}
          profile={profile.data}
          competitors={project.competitors ?? []}
          competitorSuggestions={
            <CompetitorSuggestions projectId={project.id} suggestionsQuery={suggestions} />
          }
          onSaved={() =>
            void queryClient.invalidateQueries({
              queryKey: queryKeys.projects.commandCenter(project.id),
            })
          }
        />
      ) : null}
    </section>
  );
}
