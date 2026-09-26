/** Query parameter that opens the Generate prompts dialog when the library loads. */
export const GENERATE_PROMPTS_PARAM = 'generate';

export const PROMPTS_MANAGE_HREF = '/prompts?mode=manage';
export const PROMPTS_GENERATE_HREF = `${PROMPTS_MANAGE_HREF}&${GENERATE_PROMPTS_PARAM}=1`;
