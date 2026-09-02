'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import {
  type ContentContextPreviewInput,
  CONTENT_INSTRUCTION_MAX_LEN,
  type SiteHealthReferenceInput,
} from '@/lib/api/content';
import type { ContentGenerationDetail } from '@/lib/api/types';
import {
  isTerminalContentStatus,
  useContentGenerations,
} from '@/lib/content/use-content-generations';
import { useActiveProject } from '@/lib/project/project-context';
import { saveBlob } from '@/lib/site-health/download';

import {
  useContentContextPreview,
  useContentTargetPages,
  useOpportunityContext,
  useSkillCatalog,
  useSiteHealthHandoff,
} from './content-screen-data';
import { ContentComposer, GenerationErrorPanel, GeneratingPanel } from './content-screen-panels';
import { GenerationResult } from './content-screen-result';
import { GenerationHistoryWorkspace } from './content-screen-history';
import { opportunityTarget, useOriginSelections } from './content-screen-origins';
import { textRole } from '@/components/ui/typography';

const FALLBACK_SKILL_ID = 'content_page';

function previewInput(
  target: { siteUrlId?: string; url?: string },
  opportunityId?: string | null,
  demandSignalId?: string | null,
  siteHealthReference?: SiteHealthReferenceInput,
): ContentContextPreviewInput {
  return {
    target_site_url_id: target.siteUrlId,
    target_url: target.url,
    opportunity_id: opportunityId ?? undefined,
    demand_signal_id: demandSignalId ?? undefined,
    site_health_reference: siteHealthReference,
  };
}

function generationPresentation(
  detail: ContentGenerationDetail | null,
  enqueuePending: boolean,
  mutationError: unknown,
) {
  const generating = enqueuePending || Boolean(detail && !isTerminalContentStatus(detail.status));
  const failed = detail?.status === 'failed';
  return {
    generating,
    failed,
    showError: !generating && (Boolean(mutationError) || failed),
  };
}

function instructionReady(instruction: string, generating: boolean) {
  return instruction.length > 0 && instruction.length <= CONTENT_INSTRUCTION_MAX_LEN && !generating;
}

/** Project-aware content entry point that resets transient state on project switch. */
export function ContentScreen({
  opportunityId,
  demandSignalId,
  siteHealthReference,
}: Readonly<{
  opportunityId?: string | null;
  demandSignalId?: string | null;
  siteHealthReference?: SiteHealthReferenceInput;
}>) {
  const activeProject = useActiveProject();
  if (!activeProject) return <NoProjectState />;

  return (
    <ProjectContentScreen
      key={[
        activeProject.id,
        opportunityId,
        demandSignalId,
        siteHealthReference?.source_analysis_id,
      ].join(':')}
      projectId={activeProject.id}
      opportunityId={opportunityId}
      demandSignalId={demandSignalId}
      siteHealthReference={
        siteHealthReference?.project_id === activeProject.id ? siteHealthReference : undefined
      }
    />
  );
}

function NoProjectState() {
  return (
    <Card>
      <CardContent className="flex flex-col items-start gap-3 py-[var(--empty-state-padding)]">
        <p className="text-secondary text-sm">
          Create a project first — content generation needs a project and its website.
        </p>
        <Link
          href="/projects"
          className={textRole('bodyStrong', 'text-accent-text underline underline-offset-4')}
        >
          Go to Projects
        </Link>
      </CardContent>
    </Card>
  );
}

function ProjectContentScreen({
  projectId,
  opportunityId,
  demandSignalId,
  siteHealthReference,
}: Readonly<{
  projectId: string;
  opportunityId?: string | null;
  demandSignalId?: string | null;
  siteHealthReference?: SiteHealthReferenceInput;
}>) {
  const [instruction, setInstruction] = useState('');
  const instructionRef = useRef<HTMLTextAreaElement | null>(null);
  const focusedInstruction = useRef(false);
  const [reasonOpen, setReasonOpen] = useState(false);
  useEffect(() => {
    if (!focusedInstruction.current && (opportunityId || demandSignalId || siteHealthReference)) {
      focusedInstruction.current = true;
      instructionRef.current?.focus();
    }
  }, [demandSignalId, opportunityId, siteHealthReference]);
  const skillCatalog = useSkillCatalog();
  const opportunity = useOpportunityContext(opportunityId);
  const siteHealth = useSiteHealthHandoff(siteHealthReference);
  const selection = useOriginSelections(
    opportunity,
    siteHealth.data,
    siteHealthReference?.site_url_id,
  );
  const targetPages = useContentTargetPages(projectId, selection.targetSearch);
  const pageItems = targetPages.data ?? [];
  const { target, targetUrl, chosenSkillId } = selection;
  const resolvedTarget = opportunityTarget(target, opportunity, pageItems);
  const contextPreview = useContentContextPreview(
    projectId,
    previewInput(resolvedTarget, opportunityId, demandSignalId, siteHealthReference),
  );
  const generation = useContentGenerations(projectId, {
    opportunityId,
    demandSignalId,
    target: resolvedTarget,
    siteHealthReference,
  });
  const detail = generation.detailQuery.data ?? null;
  const mutationError = firstMutationError(generation);
  const { generating, failed, showError } = generationPresentation(
    detail,
    generation.enqueueMutation.isPending,
    mutationError,
  );

  useEffect(() => {
    if (showError) instructionRef.current?.focus();
  }, [showError]);

  const skills = skillCatalog.data?.skills ?? [];
  const catalogDefault = skillCatalog.data?.default_skill_id || FALLBACK_SKILL_ID;
  // A removed server-side skill must fall back to the catalog default, not fail enqueue validation.
  const skillId = selectedSkillId(chosenSkillId, skills, catalogDefault);
  const trimmedInstruction = instruction.trim();
  const canGenerate = instructionReady(trimmedInstruction, generating);

  return (
    <ContentWorkspace
      siteHealth={siteHealth}
      instruction={instruction}
      instructionRef={instructionRef}
      opportunity={opportunity}
      contextPreview={contextPreview.data ?? null}
      target={resolvedTarget}
      targetUrl={targetUrl}
      targetPages={pageItems}
      setTarget={selection.setTarget}
      setTargetSearch={selection.setTargetSearch}
      setTargetUrl={selection.setTargetUrl}
      // Only pending BEFORE the query settles: an errored preview must fall
      // through to a real line, and isLoading stays true across retries.
      contextLoading={contextPreview.isPending && !contextPreview.isError}
      generating={generating}
      skillId={skillId}
      skills={skills}
      skillsLoading={skillCatalog.isLoading}
      canGenerate={canGenerate}
      setInstruction={setInstruction}
      setChosenSkillId={selection.chooseSkill}
      onGenerate={() => enqueue(generation, trimmedInstruction, skillId, canGenerate)}
      generation={generation}
      mutationError={mutationError}
      failed={failed}
      detail={detail}
      reasonOpen={reasonOpen}
      setReasonOpen={setReasonOpen}
    />
  );
}

function ContentWorkspace({
  siteHealth,
  instruction,
  instructionRef,
  opportunity,
  contextPreview,
  target,
  targetUrl,
  targetPages,
  setTarget,
  setTargetSearch,
  setTargetUrl,
  contextLoading,
  generating,
  skillId,
  skills,
  skillsLoading,
  canGenerate,
  setInstruction,
  setChosenSkillId,
  onGenerate,
  generation,
  mutationError,
  failed,
  detail,
  reasonOpen,
  setReasonOpen,
}: Readonly<{
  siteHealth: ReturnType<typeof useSiteHealthHandoff>;
  instruction: string;
  instructionRef: React.RefObject<HTMLTextAreaElement | null>;
  opportunity: ReturnType<typeof useOpportunityContext>;
  contextPreview: Parameters<typeof ContentComposer>[0]['contextPreview'];
  target: { siteUrlId?: string; url?: string };
  targetUrl: string;
  targetPages: Parameters<typeof ContentComposer>[0]['targetPages'];
  setTarget: (target: { siteUrlId?: string; url?: string }) => void;
  setTargetSearch: (value: string) => void;
  setTargetUrl: (value: string) => void;
  contextLoading: boolean;
  generating: boolean;
  skillId: string;
  skills: Parameters<typeof ContentComposer>[0]['skills'];
  skillsLoading: boolean;
  canGenerate: boolean;
  setInstruction: (value: string) => void;
  setChosenSkillId: (value: string) => void;
  onGenerate: () => void;
  generation: ReturnType<typeof useContentGenerations>;
  mutationError: unknown;
  failed: boolean;
  detail: ContentGenerationDetail | null;
  reasonOpen: boolean;
  setReasonOpen: (value: boolean) => void;
}>) {
  const [historyOpen, setHistoryOpen] = useState(false);
  let siteHealthAlert = null;
  if (siteHealth.isError) {
    siteHealthAlert = (
      <Alert tone="danger">
        The Site Health readiness evidence could not be authorized or loaded.
      </Alert>
    );
  } else if (siteHealth.data) {
    siteHealthAlert = (
      <Alert tone="info">
        This draft will use the persisted {siteHealth.data.dimension} readiness gap and its bounded
        crawl evidence.
      </Alert>
    );
  }
  return (
    <div className="flex min-w-0 flex-col gap-[var(--workspace-gap)]">
      {siteHealthAlert}
      <ContentComposer
        instruction={instruction}
        instructionRef={instructionRef}
        opportunity={opportunity}
        contextPreview={contextPreview}
        contextLoading={contextLoading}
        target={target}
        targetUrl={targetUrl}
        targetPages={targetPages}
        onTargetChange={setTarget}
        onTargetSearchChange={setTargetSearch}
        onTargetUrlChange={setTargetUrl}
        generating={generating}
        skillId={skillId}
        skills={skills}
        skillsLoading={skillsLoading}
        canGenerate={canGenerate}
        onInstructionChange={setInstruction}
        onSkillChange={setChosenSkillId}
        onGenerate={onGenerate}
        onHistoryOpen={() => setHistoryOpen(true)}
      />
      <GenerationStatePanels
        generating={generating}
        generation={generation}
        mutationError={mutationError}
        failed={failed}
        detail={detail}
        reasonOpen={reasonOpen}
        setReasonOpen={setReasonOpen}
      />
      <GenerationHistoryWorkspace
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        generation={generation}
      />
    </div>
  );
}

function GenerationStatePanels({
  generating,
  generation,
  mutationError,
  failed,
  detail,
  reasonOpen,
  setReasonOpen,
}: Readonly<{
  generating: boolean;
  generation: ReturnType<typeof useContentGenerations>;
  mutationError: unknown;
  failed: boolean;
  detail: ContentGenerationDetail | null;
  reasonOpen: boolean;
  setReasonOpen: (value: boolean) => void;
}>) {
  if (generating) {
    return (
      <GeneratingPanel
        selectedId={generation.selectedId}
        cancelling={generation.cancelMutation.isPending}
        onCancel={generation.cancelMutation.mutate}
      />
    );
  }
  if (mutationError || failed) {
    return (
      <GenerationErrorPanel
        mutationError={mutationError}
        failedGenerationId={failed && detail ? detail.id : null}
        retrying={generation.tryAgainMutation.isPending}
        onTryAgain={generation.tryAgainMutation.mutate}
        onDismiss={() => dismiss(generation)}
      />
    );
  }
  if (detail?.status !== 'succeeded' || !detail.output_text) return null;
  return (
    <GenerationResult
      detail={detail}
      regenerating={generation.regenerateMutation.isPending}
      feedbackPending={generation.feedbackMutation.isPending}
      onExport={() => exportMarkdown(detail)}
      onRegenerate={generation.regenerateMutation.mutate}
      reasonOpen={reasonOpen}
      onRejectClick={() => setReasonOpen(true)}
      onFeedback={(generationId, feedback, reason) => {
        setReasonOpen(false);
        generation.feedbackMutation.mutate({ generationId, feedback, reason });
      }}
    />
  );
}

function firstMutationError(generation: ReturnType<typeof useContentGenerations>) {
  return (
    generation.enqueueMutation.error ??
    generation.regenerateMutation.error ??
    generation.tryAgainMutation.error ??
    generation.deleteMutation.error ??
    generation.clearHistoryMutation.error ??
    generation.feedbackMutation.error ??
    null
  );
}

function selectedSkillId(
  chosen: string | null,
  skills: readonly { id: string }[],
  fallback: string,
) {
  return chosen && (skills.length === 0 || skills.some((skill) => skill.id === chosen))
    ? chosen
    : fallback;
}

function enqueue(
  generation: ReturnType<typeof useContentGenerations>,
  userInstruction: string,
  skillId: string,
  canGenerate: boolean,
) {
  // The button state is advisory; retain this guard for programmatic calls.
  if (!canGenerate) return;
  generation.cancelMutation.reset();
  generation.feedbackMutation.reset();
  generation.enqueueMutation.mutate({ userInstruction, skillId });
}

function dismiss(generation: ReturnType<typeof useContentGenerations>) {
  generation.enqueueMutation.reset();
  generation.regenerateMutation.reset();
  generation.tryAgainMutation.reset();
  generation.cancelMutation.reset();
  generation.deleteMutation.reset();
  generation.clearHistoryMutation.reset();
  generation.feedbackMutation.reset();
  generation.setSelectedId(null);
}

function exportMarkdown(detail: ContentGenerationDetail) {
  // A result can change while actions remain mounted; never export an empty draft.
  if (!detail.output_text) return;
  saveBlob(
    new Blob([detail.output_text], { type: 'text/markdown;charset=utf-8' }),
    `content-${detail.id.slice(0, 8)}.md`,
  );
}
