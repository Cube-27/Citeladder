/**
 * The few values both stacks compute and compare, held to Python: the project
 * advisory-lock key (both take the lock), the prompt-text hash and the
 * source-page roster (Python stores them, the refresh compares), and the URL
 * form behind an Action's page key (both key the same Action).
 */
import { normalizedUrlForCompare } from '../src/analysis/url-compare.ts';
import { projectLockKey } from '../src/prompts/locks.ts';
import { promptTextHash } from '../src/prompts/normalization.ts';
import { projectRoster } from '../src/source-pages/reading.ts';

const ports: Record<string, (...args: never[]) => unknown> = {
  roster: projectRoster,
  prompt_hash: promptTextHash,
  lock_key: (id: string) => projectLockKey(id).toString(),
  url_compare: normalizedUrlForCompare,
};

export function sourcesGolden(input: { op: string; args: never[] }): unknown {
  const port = ports[input.op];
  if (!port) throw new Error(`Missing opportunity_sources golden port: ${input.op}`);
  return port(...input.args);
}
