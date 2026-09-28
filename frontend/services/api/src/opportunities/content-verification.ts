import { record } from '../db/json.ts';
import { linkUrl } from '../site-health/content-evidence.ts';

/** A later complete capture verifies an observed link, never a model score. */
export function contextualLinkObserved(
  rawFacts: unknown,
  check: Record<string, unknown>,
): boolean | null {
  const facts = record(rawFacts);
  const capture = record(facts.extraction);
  if (
    capture.state !== 'available' ||
    capture.truncated ||
    facts.extractor_version !== check.extractor_version ||
    record(facts.content_structure).links_complete !== true
  )
    return null;
  const anchors = record(facts.links).anchors;
  if (
    !Array.isArray(anchors) ||
    typeof check.target_url !== 'string' ||
    typeof check.anchor_text !== 'string'
  )
    return null;
  const base = record(facts.delivery).final_url;
  if (typeof base !== 'string') return null;
  const target = check.target_url;
  const matching = anchors
    .map(record)
    .filter((anchor) => typeof anchor.url === 'string' && linkUrl(anchor.url, base) === target);
  if (
    matching.some(
      (anchor) =>
        anchor.region === 'main' &&
        typeof anchor.anchor_text === 'string' &&
        anchor.anchor_text.trim().replace(/\s+/gu, ' ') === check.anchor_text,
    )
  )
    return true;
  if (
    matching.some(
      (anchor) => !['main', 'nav', 'header', 'footer', 'aside'].includes(String(anchor.region)),
    )
  )
    return null;
  return false;
}
