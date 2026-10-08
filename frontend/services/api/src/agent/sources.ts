/**
 * A turn's sources are the records its reads returned, not references the
 * model repeats. Record references are working values for later reads; they
 * never belong in text written for the user.
 */
import { agentPolicy } from './contracts.ts';

const FENCE = /^ {0,3}(`{3,}|~{3,})/u;
const LINKED_REF = /\[([^\]\n]+)\]\(\s*citeladder:\/\/[^)\s]*\s*\)/gu;
// Trailing sentence punctuation belongs to the prose, not the reference.
const BARE_REF = /\(?citeladder:\/\/[^\s<>()[\]"']*[^\s<>()[\]"'.,;:!?]\)?/gu;
const UUID = /\(?\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b\)?/giu;

function scrubLine(line: string) {
  const scrubbed = line.replace(LINKED_REF, '$1').replace(BARE_REF, '').replace(UUID, '');
  if (scrubbed === line) return line;
  // Removing a token can leave doubled spaces or a space before punctuation.
  return scrubbed
    .replace(/[ \t]{2,}/gu, ' ')
    .replace(/ ([.,;:!?])/gu, '$1')
    .trimEnd();
}

/**
 * Removes record references and UUIDs from user-facing text. A fenced block is
 * left exact, because a skill's machine-readable submission may need its IDs.
 */
export function scrubRecordRefs(text: string) {
  let fence: string | null = null;
  return text
    .split('\n')
    .map((line) => {
      const marker = FENCE.exec(line);
      if (marker) {
        if (!fence) fence = marker[1]!;
        else if (marker[1]![0] === fence[0] && marker[1]!.length >= fence.length) fence = null;
        return line;
      }
      return fence ? line : scrubLine(line);
    })
    .join('\n');
}

/** The records one read returned, as the `citeladder://` references screens resolve. */
export function readSources(refs: readonly { record_uri?: string | null }[]) {
  return refs.flatMap((ref) => (ref.record_uri ? [ref.record_uri] : []));
}

/** Unique, first-read order, bounded so one broad list read cannot grow a message without limit. */
export function boundedSources(...groups: Iterable<string>[]) {
  const unique = new Set<string>();
  for (const group of groups)
    for (const ref of group) {
      if (unique.size >= agentPolicy.sources_max_refs) return [...unique];
      unique.add(ref);
    }
  return [...unique];
}
