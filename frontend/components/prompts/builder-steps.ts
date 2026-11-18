import { stringUrlCodec } from '@/lib/navigation/url-state';
import { BUILDER_STEP_PARAM } from '@/lib/prompts/routes';

export type BuilderStep = 'business' | 'topics' | 'distribution' | 'review';

export const BUILDER_STEPS = [
  { value: 'business', label: 'About your business' },
  { value: 'topics', label: 'Topics' },
  { value: 'distribution', label: 'Distribution' },
  { value: 'review', label: 'Review' },
] as const satisfies readonly { value: BuilderStep; label: string }[];

/** The current step in the address, so reload and Back keep it. */
export const builderStepCodec = stringUrlCodec<BuilderStep>(
  BUILDER_STEPS.map((step) => step.value),
  'business',
);

/** The step the address shows now, past any render a pending save started in. */
export const liveBuilderStep = (): BuilderStep =>
  builderStepCodec.parse(new URLSearchParams(window.location.search).get(BUILDER_STEP_PARAM));
