export const PROMPTS_HREF = '/prompts';
/** The Prompt builder page; its current step lives in the query. */
export const PROMPT_BUILDER_HREF = `${PROMPTS_HREF}/build`;
export const BUILDER_STEP_PARAM = 'step';

/** The Prompt builder opened on its review step, for suggestions already waiting. */
export const PROMPT_BUILDER_REVIEW_HREF = `${PROMPT_BUILDER_HREF}?${BUILDER_STEP_PARAM}=review`;
