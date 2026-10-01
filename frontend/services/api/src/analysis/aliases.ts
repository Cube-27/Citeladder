/**
 * Brand and competitor name matching, the TS form of Python's
 * `analysis/normalization.py` alias rules: `&` reads as "and", punctuation
 * separates words, and a name matches on whole-word boundaries including its
 * separator-free spelling ("Ace Hardware" names "acehardware").
 */
import { searchPolicy } from '../search-surfaces/dataforseo.ts';

export function normalizeAlias(value: string): string {
  return value
    .normalize('NFKC')
    .replaceAll(
      /./gsu,
      (character) =>
        searchPolicy.casefold_overrides[
          character as keyof typeof searchPolicy.casefold_overrides
        ] ?? character.toLowerCase(),
    )
    .replaceAll('&', ' and ')
    .replaceAll(/[^\p{L}\p{N}_ ]/gu, ' ')
    .trim()
    .replaceAll(/\s+/gu, ' ');
}

/** Whether normalized `text` contains `compact` as one or more whole tokens. */
function containsCompact(text: string, compact: string): boolean {
  const tokens = text.split(' ');
  return tokens.some((_, start) => {
    let candidate = '';
    for (const token of tokens.slice(start)) {
      candidate += token;
      if (candidate === compact) return true;
      if (candidate.length >= compact.length) break;
    }
    return false;
  });
}

/** Whether `text` names `name`; separator-free and spaced spellings are the same name. */
export function namesAlias(text: string, name: string): boolean {
  const compact = normalizeAlias(name).replaceAll(' ', '');
  const normalized = normalizeAlias(text);
  return Boolean(compact && normalized) && containsCompact(normalized, compact);
}

/** Code-point offset in the normalized answer, matching persisted Python ranks. */
export function firstAliasOffset(alias: string, normalized: string): number | null {
  const compact = normalizeAlias(alias).replaceAll(' ', '');
  if (!compact) return null;
  const tokens = normalized.split(' ');
  let offset = 0;
  for (let start = 0; start < tokens.length; start++) {
    let candidate = '';
    for (const token of tokens.slice(start)) {
      candidate += token;
      if (candidate === compact) return offset;
      if (candidate.length >= compact.length) break;
    }
    offset += Array.from(tokens[start]!).length + 1;
  }
  return null;
}
