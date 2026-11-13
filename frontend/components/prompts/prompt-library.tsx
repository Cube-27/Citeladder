import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useEffectEvent, useMemo, useState } from 'react';

import { QueryState } from '@/components/ui/query-state';
import { ReadError } from '@/components/ui/read-error';
import { promptsMutations } from '@/lib/api/prompts';
import { topicsQueries } from '@/lib/api/topics';
import type { Prompt, PromptStatus, Topic } from '@citeladder/contracts';
import { emptyFilters, type PromptFilters } from '@/lib/prompts/filter';
import { usePromptCandidates } from '@/lib/prompts/use-prompt-candidates';
import { usePromptSet } from '@/lib/prompts/use-prompt-set';

import { PendingReviewNotice } from './candidate-review';
import type { PendingDelete } from './confirm-delete-dialog';
import { PromptLibraryBody } from './prompt-library-body';
import { PromptLibraryDialogs } from './prompt-library-dialogs';
import { useLatestPromptMeasurements } from './use-latest-prompt-measurements';
import { ListScreen, RESERVED_CONTROLS } from '@/components/layout/page-shell';

import { PromptActions, promptFilterControls } from './prompt-toolbar';
import { type TopicDialog, TopicDialogs, topicFilter } from './topic-controls';
import { usePromptForm } from './use-prompt-form';
import { usePromptGeneration } from './use-prompt-generation';
import { usePromptImport } from './use-prompt-import';
import { usePromptLibraryView } from './use-prompt-library-view';
import { useTopicMutations } from './use-topic-mutations';
import { useProjectScope } from '@/lib/project/active-project-scope';
import { useWorkspaceCapability } from '@/lib/project/project-context';

import type { BuilderStep } from './prompt-builder';

/**
 * Whether the library still shows its first-load frame. Prompts often arrive
 * with the project, before the latest run's figures; a run adds four columns,
 * and adding them beside rows already on screen moved every cell sideways.
 */
function awaitingFirstLoad(
  state: Readonly<{ promptsLoading: boolean; hasPrompts: boolean; figuresRead: boolean }>,
): boolean {
  return state.promptsLoading || (state.hasPrompts && !state.figuresRead);
}

/**
 * Prompt library client (F7). Owns the active prompt set (via F5 project
 * context), the topic/status/search filter state, and every CRUD, import,
 * lifecycle, and AI-generation mutation. Layout: one control row (Active /
 * Archived, search, Topic, filters) over the prompt table at the page's full
 * width; topics are added, renamed and deleted from the Topic menu's dialogs
 * (owner, 2026-11-06). "Prompt Builder" opens the sheet that steers
 * generation and reviews its suggestions.
 */
// react-doctor-disable-next-line react-doctor/no-giant-component -- this component only orchestrates queries/mutations; toolbar, topic rail, table, empty state, and dialogs are extracted.
export function PromptLibrary({
  generateRequest = 0,
  reviewRequest = false,
}: Readonly<{
  /** Increments once per URL request to open the Prompt Builder. */
  generateRequest?: number;
  reviewRequest?: boolean;
}>) {
  const { workspaceId, projectId, project } = useProjectScope();
  const scope = { workspaceId, projectId };
  // A role that may not edit prompts reads the library with no edit controls.
  const canWrite = useWorkspaceCapability('write');
  const { promptSet, prompts, limits, isLoading, error, ensurePromptSet, retry, retrying } =
    usePromptSet();

  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<PromptFilters>(emptyFilters);
  const [statusFilter, setStatusFilter] = useState<PromptStatus>('active');
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [builderStep, setBuilderStep] = useState<BuilderStep>('business');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [topicDialog, setTopicDialog] = useState<TopicDialog | null>(null);
  const hasCompetitors = project.competitors.length > 0;

  const topicsQuery = useQuery(topicsQueries.list(scope));
  const topics: Topic[] = useMemo(() => topicsQuery.data ?? [], [topicsQuery.data]);
  const measurements = useLatestPromptMeasurements(scope);

  const review = usePromptCandidates({
    projectId,
    promptSet,
    workspaceId,
    onAccepted: () => {
      setStatusFilter('active');
      // Show every newly tracked prompt, whichever topic it landed in.
      setSelectedTopicId(null);
    },
  });

  // Every descriptor refreshes the library's reads; these add the screen's own reaction.
  const form = usePromptForm(scope, ensurePromptSet);
  const clearBusy = { onSettled: () => setBusyId(null) };
  const deleteMutation = useMutation(promptsMutations.remove(scope));
  const rowMutation = useMutation(promptsMutations.update(scope));
  const imports = usePromptImport(scope, ensurePromptSet);

  const { generateMutation, generatePrompts } = usePromptGeneration({
    scope,
    ensurePromptSet,
    onGenerated: () => review.clearNotice(),
  });
  // A fresh open clears the last run's outcome, but never a run still in
  // flight: resetting it would drop `isPending` and allow a second paid run.
  const openBuilder = (step: BuilderStep) => {
    if (!generateMutation.isPending) generateMutation.reset();
    setBuilderStep(step);
    setBuilderOpen(true);
  };
  const openFromUrl = useEffectEvent((step: BuilderStep) => openBuilder(step));
  useEffect(() => {
    if (generateRequest === 0 || !canWrite) return;
    // oxlint-disable-next-line react-hooks/set-state-in-effect -- open the builder for a URL request.
    openFromUrl(reviewRequest ? 'review' : 'business');
  }, [generateRequest, reviewRequest, canWrite]);

  const topicMutations = useTopicMutations({
    scope,
    onDeleted: (topic) => {
      if (selectedTopicId === topic.id) setSelectedTopicId(null);
    },
  });

  // A fresh Add topic starts without the last attempt's error.
  const openAddTopic = () => {
    topicMutations.create.reset();
    setTopicDialog('add');
  };

  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const confirmDelete = (pending: PendingDelete) => {
    if (pending.kind === 'topic') return topicMutations.remove.mutate(pending.topic);
    setBusyId(pending.prompt.id);
    deleteMutation.mutate(pending.prompt.id, clearBusy);
  };

  const { visible, personas, statusCounts } = usePromptLibraryView(prompts, {
    statusFilter,
    selectedTopicId,
    search,
    filters,
  });

  const hasPrompts = prompts.length > 0;

  // Every edit control of the library, for a role that may edit prompts.
  const edits = canWrite
    ? {
        rows: {
          onEdit: form.openEdit,
          onDelete: (prompt: Prompt) => setPendingDelete({ kind: 'prompt', prompt }),
          onToggleEnabled: (prompt: Prompt) => {
            setBusyId(prompt.id);
            rowMutation.mutate(
              { promptId: prompt.id, input: { enabled: !prompt.enabled } },
              clearBusy,
            );
          },
          onSetStatus: (prompt: Prompt, status: PromptStatus) => {
            setBusyId(prompt.id);
            rowMutation.mutate({ promptId: prompt.id, input: { status } }, clearBusy);
          },
          busyId,
        },
        add: { onGenerate: () => openBuilder('business'), onAdd: form.openAdd },
        topics: { onAdd: openAddTopic, onManage: () => setTopicDialog('manage') },
      }
    : undefined;

  const failedEmpty = Boolean(error) && !hasPrompts;

  // Status, search and filters share one control band once loaded; the first
  // load holds it so the table starts where the box stood.
  const figuresRead = measurements !== undefined;
  if (awaitingFirstLoad({ promptsLoading: isLoading, hasPrompts, figuresRead })) {
    return (
      <ListScreen controls={RESERVED_CONTROLS}>
        <QueryState kind="loading" />
      </ListScreen>
    );
  }

  return (
    <ListScreen
      actions={
        <PromptActions
          onImport={() => imports.setImportOpen(true)}
          onAdd={form.openAdd}
          onGenerate={() => openBuilder('business')}
          hasActivePrompts={statusCounts.active > 0}
        />
      }
      controls={promptFilterControls({
        status: { value: statusFilter, counts: statusCounts, onChange: setStatusFilter },
        search,
        onSearchChange: setSearch,
        filters,
        onFiltersChange: setFilters,
        personas,
        topic: topicFilter({
          topics,
          selectedTopicId,
          onSelect: setSelectedTopicId,
          manage: edits?.topics,
        }),
      })}
    >
      <>
        {error && !failedEmpty ? (
          <ReadError
            error={error}
            fallback="Could not load prompts. Check your connection and try again."
            onRetry={retry}
            pending={retrying}
          />
        ) : null}
        <PendingReviewNotice
          count={review.candidates.length}
          hidden={builderOpen || !canWrite}
          onReview={() => openBuilder('review')}
        />

        <TopicDialogs
          dialog={topicDialog}
          onDialogChange={setTopicDialog}
          topics={topics}
          mutations={topicMutations}
          loadError={topicsQuery.isError}
          onAdd={openAddTopic}
          onDelete={(topic) => setPendingDelete({ kind: 'topic', topic })}
        />
        <PromptLibraryBody
          visible={visible}
          rows={edits?.rows}
          add={edits?.add}
          measurements={measurements}
          failedEmpty={failedEmpty}
          hasPrompts={hasPrompts}
          error={error}
          retry={retry}
          retrying={retrying}
        />

        <PromptLibraryDialogs
          pendingDelete={pendingDelete}
          setPendingDelete={setPendingDelete}
          confirmDelete={confirmDelete}
          formOpen={form.formOpen}
          setFormOpen={form.setFormOpen}
          editing={form.editing}
          setEditing={form.setEditing}
          submitForm={form.submitForm}
          isSaving={form.isSaving}
          formError={form.formError}
          importOpen={imports.importOpen}
          setImportOpen={imports.setImportOpen}
          importPrompts={imports.importPrompts}
          isImporting={imports.isImporting}
          importError={imports.importError}
          projectId={projectId}
          workspaceId={workspaceId}
          builderOpen={builderOpen}
          setBuilderOpen={setBuilderOpen}
          builderStep={builderStep}
          hasCompetitors={hasCompetitors}
          topics={topics}
          selectedTopicId={selectedTopicId}
          generatePrompts={generatePrompts}
          isGenerating={generateMutation.isPending}
          generateError={generateMutation.isError ? generateMutation.error : undefined}
          review={review}
          setsLoading={isLoading}
          setsError={error !== null}
          retrySets={retry}
          limits={limits}
        />
      </>
    </ListScreen>
  );
}
