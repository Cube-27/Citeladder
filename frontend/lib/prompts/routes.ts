export const PROMPTS_HREF = '/prompts';
/** The Prompt builder page; its current step and opening offering live in the query. */
export const PROMPT_BUILDER_HREF = `${PROMPTS_HREF}/build`;
export const BUILDER_STEP_PARAM = 'step';
/** The offering the business step opens on and scrolls to. */
export const BUILDER_OFFERING_PARAM = 'offering';

/** The Prompt builder opened on its review step, for suggestions already waiting. */
export const PROMPT_BUILDER_REVIEW_HREF = `${PROMPT_BUILDER_HREF}?${BUILDER_STEP_PARAM}=review`;

/** The Prompt builder opened on one offering's facts. */
export const promptBuilderOfferingHref = (offering: string) =>
  `${PROMPT_BUILDER_HREF}?${new URLSearchParams({ [BUILDER_OFFERING_PARAM]: offering })}`;
