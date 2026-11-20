import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

import type { PromptGenerateRequest } from '@citeladder/contracts/prompt-requests';
import { topicsQueries } from '@/lib/api/topics';
import type {
  PromptFormLimits,
  PromptGenerateResponse,
  SeedQueries,
  Topic,
} from '@citeladder/contracts';
import { useUrlState } from '@/lib/navigation/url-state';
import { personaChoices } from '@/lib/prompts/builder-business';
import { defaultRunSettings, runRequest, type RunSettings } from '@/lib/prompts/builder-run';
import { BUILDER_STEP_PARAM } from '@/lib/prompts/routes';
import type { usePromptCandidates } from '@/lib/prompts/use-prompt-candidates';

import { BuilderBusinessStep } from './builder-business-step';
import { BuilderDistributionStep } from './builder-distribution-step';
import { BuilderCancel, BuilderStepActions } from './builder-footer';
import { BuilderReviewStep, RunCoverage } from './builder-review-step';
import { BUILDER_STEPS, builderStepCodec, liveBuilderStep } from './builder-steps';
import { BuilderTopicsStep } from './builder-topics-step';
import { CandidateReviewPanel, useCandidateSelection } from './candidate-review';
import { GenerateErrorAlert, GenerateResultAlert } from './generation-alerts';
import {
  useBusinessDraft,
  type BusinessDraftState,
} from '@/components/knowledge-base/use-business-draft';
import { useBuilderTopics, type BuilderTopics } from './use-builder-topics';
import { StepsLayout } from '@/components/templates/steps-layout';
import { Notice, readErrorProps } from '@/components/ui/notice';
import { StateBlock } from '@/components/ui/state-block';

type PromptBuilderProps = {
  projectId: string;
  workspaceId: string;
  topics: Topic[];
  hasCompetitors: boolean;
  /** Runs one generate request; null when it failed (the error arrives as `generateError`). */
  generate: (input: PromptGenerateRequest) => Promise<PromptGenerateResponse | null>;
  isGenerating: boolean;
  generateError?: unknown;
  /** The pending candidates; accepting tracks them. */
  review: ReturnType<typeof usePromptCandidates>;
  /** The prompt-set read the candidates hang off. */
  sets: { loading: boolean; error: boolean; retry: () => void };
  /** The request bounds the API enforces, from the prompt-set list. */
  limits: PromptFormLimits;
};

/** What this visit generated: its request and every run it made. */
type Session = { request: PromptGenerateRequest; results: PromptGenerateResponse[] };

/**
 * The Prompt builder's body: the steps down the left, the current step's
 * content beside them, and a fixed footer. It steers generation end to end —
 * business facts, topics, distribution and search seeds — then lands in
 * candidate review. Every step is prefilled from saved data, so a returning
 * user can go straight to Generate. Drafts and settings never outlive the page.
 */
export function PromptBuilder(props: Readonly<PromptBuilderProps>) {
  const { projectId, workspaceId, topics, hasCompetitors, isGenerating, generateError, limits } =
    props;
  const scope = { workspaceId, projectId };
  const [step, setStep] = useUrlState(BUILDER_STEP_PARAM, builderStepCodec);
  const business = useBusinessDraft({ projectId, workspaceId });
  const seedsQuery = useQuery(topicsQueries.seedQueries(scope));
  const topicStep = useBuilderTopics({ scope, topics });
  const [edited, setEdited] = useState<RunSettings | null>(null);
  const settings = edited ?? defaultRunSettings();
  const personas = business.draft ? personaChoices(business.draft) : [];
  const built = runRequest(settings, {
    seeds: seedsQuery.data ?? null,
    hasCompetitors,
    personaChoices: personas,
    limits,
  });
  const [run, setRun] = useState<Session | null>(null);
  const selection = useCandidateSelection(props.review.candidates);

  const generate = async (request: PromptGenerateRequest, more: boolean) => {
    const result = await props.generate(request);
    if (!result) return;
    setRun((current) =>
      more && current
        ? { ...current, results: [...current.results, result] }
        : { request, results: [result] },
    );
    if (liveBuilderStep() !== null) setStep('review');
  };
  const last = run?.results.at(-1);
  const runNotices = (
    <>
      {isGenerating ? (
        <Notice tone="info">
          Writing and quality-checking questions can take a minute or two. Keep this page open.
        </Notice>
      ) : null}
      {generateError ? <GenerateErrorAlert error={generateError} /> : null}
    </>
  );

  const body = (): ReactNode => {
    switch (step) {
      case 'business':
        return (
          <BuilderBusinessStep
            business={business}
            runContext={settings.runContext}
            onRunContextChange={(runContext) => setEdited({ ...settings, runContext })}
            limits={limits}
          />
        );
      case 'topics':
        return <BuilderTopicsStep topics={topicStep} />;
      case 'distribution':
        return (
          <BuilderDistributionStep
            settings={settings}
            onChange={setEdited}
            limits={limits}
            hasCompetitors={hasCompetitors}
            personaChoices={personas}
            seeds={{ data: seedsQuery.data, status: <SeedsReadState read={seedsQuery} /> }}
            topics={topics}
            notices={
              <>
                {runNotices}
                <UnsavedNotice business={business} topics={topicStep} />
                {/* Until search data loads, its own loading or error state says why Generate waits. */}
                {seedsQuery.data ? <RunProblem built={built} /> : null}
              </>
            }
          />
        );
      case 'review':
        return (
          <BuilderReviewStep
            notices={
              <>
                {runNotices}
                {last && !generateError ? <GenerateResultAlert result={last} /> : null}
              </>
            }
            coverage={
              run ? (
                <RunCoverage
                  request={run.request}
                  topics={topics}
                  drafted={run.results.flatMap((result) => result.candidates)}
                  disabled={isGenerating}
                  onGenerate={(request) => void generate(request, true)}
                />
              ) : null
            }
            review={
              <CandidateReviewPanel
                review={props.review}
                topics={topics}
                selection={selection}
                setsLoading={props.sets.loading}
                setsError={props.sets.error}
                retrySets={props.sets.retry}
              />
            }
          />
        );
      default: {
        const exhaustive: never = step;
        return exhaustive;
      }
    }
  };

  return (
    <StepsLayout
      label="Prompt builder steps"
      steps={BUILDER_STEPS}
      current={step}
      onStep={setStep}
      footerStart={<BuilderCancel />}
      footerEnd={
        <BuilderStepActions
          step={step}
          setStep={setStep}
          business={business}
          topics={topicStep}
          canGenerate={built.ok && !isGenerating}
          isGenerating={isGenerating}
          onGenerate={() => {
            if (built.ok) void generate(built.request, false);
          }}
          track={{
            count: selection.selected.length,
            disabled: props.review.isReviewing || selection.selected.length === 0,
            onTrack: () => props.review.accept(selection.selected),
          }}
        />
      }
    >
      {body()}
    </StepsLayout>
  );
}

/** The seed-query read before it has data: loading, or failed with a retry. */
function SeedsReadState({ read }: Readonly<{ read: UseQueryResult<SeedQueries> }>) {
  return read.isError ? (
    <StateBlock
      kind="error"
      {...readErrorProps(read)}
      title="Couldn't load your search data"
      fallback="The request failed or timed out."
    />
  ) : (
    <StateBlock kind="loading" label="Loading your search data" shape={{ kind: 'list' }} />
  );
}

/** Why the distribution settings cannot make a run, if they cannot. */
function RunProblem({ built }: Readonly<{ built: ReturnType<typeof runRequest> }>) {
  return built.ok ? null : <Notice tone="warning">{built.problem}</Notice>;
}

/** Edits from earlier steps that this run will not see until they are saved. */
function UnsavedNotice({
  business,
  topics,
}: Readonly<{ business: BusinessDraftState; topics: BuilderTopics }>) {
  const unsaved = [
    business.dirty ? 'your business edits are not saved' : null,
    topics.pending ? 'your topic changes are not confirmed' : null,
  ].filter((item): item is string => item !== null);
  if (!unsaved.length) return null;
  const sentence = unsaved.join(' and ');
  return (
    <Notice tone="warning">
      {sentence.charAt(0).toUpperCase() + sentence.slice(1)}, so this run will not use them.
    </Notice>
  );
}
