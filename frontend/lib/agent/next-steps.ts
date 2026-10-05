/**
 * What a reader can do after a reply, by the kind of deliverable the chat
 * owns. Refinements revise this chat's output as ordinary turns. Next steps
 * start a new chat with another skill, because a chat owns one deliverable
 * kind; they carry the attached Action (if any) and the output's title, never
 * its evidence content, so the new chat reads the evidence again itself.
 */

type NextStep = { label: string; skillId: string; prompt: string };

const DEFAULT_REFINEMENTS = ['Make it shorter', 'Make it more specific'] as const;

const REFINEMENTS: Record<string, readonly string[]> = {
  content: ['No standalone FAQ', 'Tighten the introduction'],
  plan: ['Prioritize the top three items'],
  diagnosis: ['Which evidence is strongest?'],
  research: ['Rank by commercial value'],
  page_edits: ['Only the highest-impact edits'],
};

const MEASURE: NextStep = {
  label: 'Plan how to measure it',
  skillId: 'measure',
  prompt: 'Design how to measure the result of',
};

const NEXT_STEPS: Record<string, readonly NextStep[]> = {
  diagnosis: [
    { label: 'Draft page edits', skillId: 'gsc_optimize', prompt: 'Draft exact page edits for' },
    {
      label: 'Find earned sources',
      skillId: 'earned_authority',
      prompt: 'Find third-party source opportunities for',
    },
  ],
  research: [
    {
      label: 'Write the content',
      skillId: 'content_create',
      prompt: 'Write content for the top opportunity in',
    },
    MEASURE,
  ],
  plan: [MEASURE],
  page_edits: [
    {
      label: 'Plan internal links',
      skillId: 'internal_links',
      prompt: 'Plan internal links that support',
    },
    MEASURE,
  ],
  content: [
    {
      label: 'Plan internal links',
      skillId: 'internal_links',
      prompt: 'Plan internal links to the page from',
    },
    MEASURE,
  ],
  link_plan: [MEASURE],
  technical_fix: [MEASURE],
  earned_brief: [MEASURE],
  prompt_portfolio: [
    {
      label: 'Diagnose AI visibility',
      skillId: 'ai_visibility',
      prompt: 'Diagnose our AI visibility for the questions in',
    },
  ],
  measurement: [
    { label: 'Plan what to do next', skillId: 'growth_plan', prompt: 'Plan next steps from' },
  ],
};

export function refinementsFor(kind: string | null | undefined): readonly string[] {
  return [
    DEFAULT_REFINEMENTS[0],
    ...(kind ? (REFINEMENTS[kind] ?? [DEFAULT_REFINEMENTS[1]]) : [DEFAULT_REFINEMENTS[1]]),
  ];
}

/** New-chat suggestions for this deliverable, each naming it by title. */
export function nextStepsFor(
  kind: string | null | undefined,
  title: string,
): { label: string; skillId: string; prompt: string }[] {
  return (kind ? (NEXT_STEPS[kind] ?? []) : []).map((step) => ({
    ...step,
    prompt: `${step.prompt} "${title}". Use the selected document revision as the upstream brief; re-fetch its source references when needed.`,
  }));
}
