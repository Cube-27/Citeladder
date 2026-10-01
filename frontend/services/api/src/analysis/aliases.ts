/**
 * Brand and competitor name matching, the TS form of Python's
 * `analysis/normalization.py` alias rules: `&` reads as "and", punctuation
 * separates words, and a name matches on whole-word boundaries including its
 * separator-free spelling ("Ace Hardware" names "acehardware").
 */
export function normalizeAlias(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replaceAll('&', ' and ')
    .replaceAll(/[^\p{L}\p{N}_ ]/gu, ' ')
    .trim()
    .replaceAll(/\s+/gu, ' ');
}

/** Offset in normalized `text` of the first whole-token run spelling `compact`. */
function compactOffset(text: string, compact: string): number | null {
  const tokens = text.split(' ');
  let offset = 0;
  for (const [start, first] of tokens.entries()) {
    let candidate = '';
    for (const token of tokens.slice(start)) {
      candidate += token;
      if (candidate === compact) return offset;
      if (candidate.length >= compact.length) break;
    }
    offset += first.length + 1;
  }
  return null;
}

/**
 * Offset of `name` in already-normalized text, or null. A whole-word match is
 * also a whole-token compact match, so this is Python's `first_alias_offset`.
 */
export function aliasOffset(normalizedText: string, name: string): number | null {
  const compact = normalizeAlias(name).replaceAll(' ', '');
  return compact && normalizedText ? compactOffset(normalizedText, compact) : null;
}

/** Whether `text` names `name`; separator-free and spaced spellings are the same name. */
export function namesAlias(text: string, name: string): boolean {
  return aliasOffset(normalizeAlias(text), name) !== null;
}
