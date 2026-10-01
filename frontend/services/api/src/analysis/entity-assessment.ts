import { normalizeAlias } from './aliases.ts';
import type { ScoringConfig } from './scoring.ts';
import { policy } from '../config.ts';
const word = '[\\p{L}\\p{N}_]';
const escapeRegex = (text: string) => text.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&');
const limitation =
  "Explicit-language detection over English phrasing in a 45-character window around the entity's FIRST mention. Not sentiment, not a calibrated judgement, and not a reading of the whole answer.";

function aliasMatch(alias: string, answer: string) {
  const normalized = normalizeAlias(alias);
  if (!normalized) return null;
  const tokens = normalized
    .split(' ')
    .map((token) => (token === 'and' ? '(?:and|&)' : escapeRegex(token)));
  const pattern = `(?<!${word})${tokens.join('[^0-9A-Za-z]*')}(?!${word})`;
  if (!policy.audits.analysis.ambiguous_aliases.includes(normalized))
    return new RegExp(pattern, 'iu').exec(answer);
  return (
    new RegExp(`${pattern}[^0-9A-Za-z]+australia(?!${word})`, 'iu').exec(answer) ??
    new RegExp(`${pattern}(?!\\s+(?:audience|price|market|demographic))`, 'u').exec(answer)
  );
}
function assessment(name: string, aliases: readonly string[], answer: string, kind: string) {
  const row = (
    state: string,
    spans: { start: number; end: number; text: string }[],
    detail = limitation,
  ) => ({
    entity_id: `${kind}:${normalizeAlias(name)}`,
    entity_name: name,
    entity_kind: kind,
    state,
    evidence_spans: spans,
    method: 'deterministic_explicit_language',
    analyzer_version: policy.audits.analysis.entity_assessment_version,
    model: null,
    template_version: null,
    limitation: detail,
  });
  if (!answer.trim()) return row('unavailable', [], 'Answer text is unavailable.');
  const match = aliases
    .map((alias) => aliasMatch(alias, answer))
    .filter((m): m is RegExpExecArray => m !== null)
    .sort((a, b) => a.index - b.index)[0];
  if (!match) return row('absent', []);
  const points = Array.from(answer),
    offset = Array.from(answer.slice(0, match.index)).length;
  const endOffset = offset + Array.from(match[0]).length;
  const before = points
    .slice(Math.max(0, offset - 45), offset)
    .join('')
    .toLowerCase();
  const after = points
    .slice(endOffset, endOffset + 45)
    .join('')
    .toLowerCase();
  const afterPredicate = after.replace(/^\W+/u, '').replace(/^(?:is|are|was|were)\s*/u, '');
  let state = 'mentioned';
  if (
    /(?:avoid|do not recommend|not recommended|recommend against)(?:\s+(?:the|a|an|this|that))*\s*$/u.test(
      before,
    ) ||
    /^(?:not recommended|best avoided|not a good (?:choice|pick|fit))\b/u.test(afterPredicate)
  )
    state = 'recommended_against';
  else if (
    /(?:recommend|recommended|top pick|best choice|choose)(?:\s+(?:the|a|an|this|that))*\s*$/u.test(
      before,
    ) ||
    /^(?:recommended|the top pick|the best choice)\b/u.test(afterPredicate)
  )
    state = 'recommended';
  else if (
    /(?:consider|may prefer|could choose|option)(?:\s+(?:the|a|an|this|that))*\s*$/u.test(before)
  )
    state = 'hedged';
  const start = Math.max(0, offset - 60),
    end = Math.min(points.length, endOffset + 60);
  return row(state, [{ start, end, text: points.slice(start, end).join('') }]);
}
export function assessEntities(answer: string, config: ScoringConfig) {
  return [
    { name: config.brandName, aliases: config.brandAliases, kind: 'brand' },
    ...config.competitors.map((c) => ({ ...c, kind: 'competitor' })),
  ]
    .filter((entity) => entity.name)
    .map((entity) => assessment(entity.name, entity.aliases, answer, entity.kind));
}
