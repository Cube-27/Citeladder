/** Query parameter that opens the Prompt Builder when the library loads. */
export const GENERATE_PROMPTS_PARAM = 'generate';
/** Query parameter that opens the Prompt Builder on its review step. */
export const REVIEW_PROMPTS_PARAM = 'review';
/** With `generate=1`: the offering the builder's business step opens and scrolls to. */
export const OFFERING_PROMPTS_PARAM = 'offering';

export const PROMPTS_HREF = '/prompts';
export const PROMPTS_GENERATE_HREF = `${PROMPTS_HREF}?${GENERATE_PROMPTS_PARAM}=1`;

/** The Prompt Builder opened on one offering's facts. */
export const promptsOfferingHref = (offering: string) =>
  `${PROMPTS_GENERATE_HREF}&${new URLSearchParams({ [OFFERING_PROMPTS_PARAM]: offering })}`;
