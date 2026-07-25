import { projectsApi } from '@/lib/api/projects';
import { promptsApi } from '@/lib/api/prompts';
import type { Project } from '@/lib/api/types';

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
}: {
  brand: BrandStepValues;
  competitors: ReviewCompetitor[];
  domains: ReviewDomain[];
  prompts: ReviewPrompt[];
}): Promise<Project> {
  const project = await projectsApi.createProject(
    onboardingToProjectInput(brand, competitors, domains),
  );

  const chosen = prompts.filter((prompt) => prompt.selected);
  if (chosen.length === 0) return project;

  const set = await promptsApi.createPromptSet({
    project_id: project.id,
    name: 'Starting prompts',
  });
  const topicIds = await createTopics(project.id, chosen);

  // Sequential rather than Promise.all: these are writes against one set, and a
  // burst of parallel creates is a good way to trip rate limits for no benefit
  // on a list this size.
  for (const prompt of chosen) {
    const topicId = topicIds.get(prompt.theme.trim().toLowerCase());
    await promptsApi.createPrompt(set.id, {
      text: prompt.text,
      // Backend theme is a non-null `str = ""` — send empty, never null.
      theme: prompt.theme ?? '',
      intent: normalizeIntent(prompt.intent),
      branded: false,
      enabled: true,
      ...(topicId ? { topic_id: topicId } : {}),
    });
  }

  return project;
}
