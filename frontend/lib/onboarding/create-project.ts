import { projectsApi } from '@/lib/api/projects';
import { promptsApi } from '@/lib/api/prompts';
import type { Project } from '@/lib/api/types';

/**
 * What a partially-completed confirm already created.
 *
 * The chain is several writes long and only the last of them is retried from a
 * clean slate. Without carrying the earlier successes forward, a failure on the
 * prompt writes would leave the user pressing "Create project" against a
 * project that already exists, creating a duplicate every time.
 */
export type OnboardingProgress = {
  project?: Project;
  promptSetId?: string;
};

import {
  normalizeIntent,
  onboardingToProjectInput,
  type BrandStepValues,
  type ReviewCompetitor,
  type ReviewDomain,
  type ReviewPrompt,
} from './forms';

/**
 * The onboarding confirm chain: project → prompt set → topics → prompts.
 *
 * Lives outside the component because it is the one piece of onboarding with
 * real sequencing rules, and those are easier to state — and test — away from
 * the step rendering.
 *
 * Ordering matters. Topics are created before prompts so each prompt can be
 * filed via `topic_id` at creation, rather than created and then PATCHed. That
 * mirrors what `/generate` does server-side in a single transaction, which is
 * the point: a set built by onboarding and a set built by generation should be
 * indistinguishable afterwards, including on the topics rail.
 */

/**
 * Distinct topic names among the selected prompts, first spelling wins.
 *
 * Keyed on the lowercased name because the backend's topic uniqueness is
 * case-insensitive (a functional unique index on `lower(name)`). Without this,
 * an agent that emitted both "Everyday basics" and "everyday basics" would make
 * us attempt two creates and take a 409 on the second.
 */
export function distinctTopicNames(prompts: ReviewPrompt[]): string[] {
  const seen = new Map<string, string>();
  for (const prompt of prompts) {
    const name = prompt.theme.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (!seen.has(key)) seen.set(key, name);
  }
  return [...seen.values()];
}

/**
 * Create the topics and return a lowercased-name → id lookup.
 *
 * A topic that fails to create is skipped rather than aborting onboarding: the
 * prompt still lands, just untopiced. Losing a grouping is a far smaller cost
 * than stranding a user who has already filled in the whole flow.
 */
async function createTopics(
  projectId: string,
  prompts: ReviewPrompt[],
): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const name of distinctTopicNames(prompts)) {
    try {
      // react-doctor-disable-next-line react-doctor/async-await-in-loop -- topic writes are deliberately rate-limited and ordered.
      const topic = await promptsApi.createTopic(projectId, { name });
      ids.set(name.toLowerCase(), topic.id);
    } catch {
      // Intentionally swallowed — see the note above.
    }
  }
  return ids;
}

export async function createProjectFromOnboarding({
  brand,
  competitors,
  domains,
  prompts,
  progress,
}: {
  brand: BrandStepValues;
  competitors: ReviewCompetitor[];
  domains: ReviewDomain[];
  prompts: ReviewPrompt[];
  /**
   * Mutable record of what earlier attempts already created. Each step writes
   * its result here before the next one can fail, so a retry resumes instead of
   * duplicating. Callers reset it only for a genuinely new submission.
   */
  progress?: OnboardingProgress;
}): Promise<Project> {
  const project =
    progress?.project ??
    (await projectsApi.createProject(onboardingToProjectInput(brand, competitors, domains)));
  if (progress) progress.project = project;

  const chosen = prompts.filter((prompt) => prompt.selected);
  if (chosen.length === 0) return project;

  const setId =
    progress?.promptSetId ??
    (
      await promptsApi.createPromptSet({
        project_id: project.id,
        name: 'Starting prompts',
      })
    ).id;
  if (progress) progress.promptSetId = setId;

  const topicIds = await createTopics(project.id, chosen);

  // Sequential rather than Promise.all: these are writes against one set, and a
  // burst of parallel creates is a good way to trip rate limits for no benefit
  // on a list this size.
  for (const prompt of chosen) {
    const topicId = topicIds.get(prompt.theme.trim().toLowerCase());
    // react-doctor-disable-next-line react-doctor/async-await-in-loop -- prompt writes are deliberately rate-limited and ordered.
    await promptsApi.createPrompt(setId, {
      text: prompt.text,
      // Backend theme is a non-null `str = ""` — send empty, never null.
      theme: prompt.theme ?? '',
      intent: normalizeIntent(prompt.intent),
      branded: false,
      enabled: true,
      ...(topicId ? { topic_id: topicId } : {}),
      // Carry the generation proof so the backend stores this as `generated`
      // and skips topical binding. A prompt the user edited or wrote loses its
      // receipt and is correctly treated as manual free text.
      ...(prompt.generation_receipt
        ? { origin: 'generated' as const, generation_receipt: prompt.generation_receipt }
        : {}),
    });
  }

  return project;
}
