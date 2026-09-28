/**
 * Prompt-text identity, as `app/domain/prompts/normalization.py` computes it.
 *
 * Python still owns prompt writes; the Opportunity refresh only needs the same
 * dedupe key for the gap prompts it stamps on a snapshot, so this copy must
 * match it until prompt writes move (PR 10).
 */
import { policy } from '../config.ts';
import { collapseIdentityWhitespace, hash } from '../traffic/normalization.ts';

const TRAILING = new Set(policy.opportunity.refresh.prompt_trailing_punctuation);

/** Lower-case, collapse whitespace, and strip trailing punctuation. */
function normalizePromptText(text: string): string {
  const characters = [...collapseIdentityWhitespace(text).toLowerCase()];
  let end = characters.length;
  while (end > 0 && TRAILING.has(characters[end - 1]!)) end -= 1;
  return characters.slice(0, end).join('');
}

/** sha256 hex digest of the normalized text: the dedupe key. */
export const promptTextHash = (text: string): string => hash(normalizePromptText(text));
