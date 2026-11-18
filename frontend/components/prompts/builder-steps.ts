import { stringUrlCodec } from '@/lib/navigation/url-state';

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
