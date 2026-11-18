/**
 * A prompt row's share of voice, brand sentiment and web-search share, from
 * its persisted answers. Each travels with its counts so a period pools the
 * counts, never the shares.
 */
import type { netSentimentSchema, webSearchShareSchema } from '@citeladder/contracts/visibility';
import type { z } from 'zod';

import { netSentiment, pooledSentiment, type Mention } from '../perception/metrics.ts';
import type { BrandCount } from './brand-identities.ts';
import { searchOf } from './prompt-answers.ts';

type WebSearch = z.infer<typeof webSearchShareSchema>;
type NetSentiment = z.infer<typeof netSentimentSchema>;
type Answer = { id: string; search_used: boolean; fanout_state: string };

/** The brand's share of every tracked-brand naming; null when nobody was named. */
function shareOfVoice(named: readonly BrandCount[]): number | null {
  const total = named.reduce((sum, entry) => sum + entry.responses, 0);
  const brand = named.reduce(
    (sum, entry) => sum + (entry.kind === 'brand' ? entry.responses : 0),
    0,
  );
  return total ? brand / total : null;
}

function pooledSearch(parts: readonly Pick<WebSearch, 'searched' | 'reported'>[]): WebSearch {
  const searched = parts.reduce((sum, part) => sum + part.searched, 0);
  const reported = parts.reduce((sum, part) => sum + part.reported, 0);
  return { searched, reported, share: reported ? searched / reported : null };
}

/**
 * One run's signals for a prompt. Only answers whose engine reports search
 * use count toward web search. `brandMentions` is null for a run admitted
 * without perception.
 */
export function promptSignals(input: {
  answered: readonly Answer[];
  named: readonly BrandCount[];
  brandMentions: ReadonlyMap<string, Mention[]> | null;
}) {
  const reported = input.answered.filter((answer) => searchOf(answer) !== 'not_reported');
  const { brandMentions } = input;
  return {
    share_of_voice: shareOfVoice(input.named),
    sentiment: brandMentions
      ? netSentiment(input.answered.flatMap((answer) => brandMentions.get(answer.id) ?? []))
      : null,
    web_search: pooledSearch([
      {
        searched: reported.filter((answer) => answer.search_used).length,
        reported: reported.length,
      },
    ]),
  };
}

/**
 * A period's signals: pooled counts, and share of voice over the pooled
 * namings. One run without perception leaves the period's sentiment unknown.
 */
export function pooledSignals(
  items: readonly { sentiment?: NetSentiment | null; web_search?: WebSearch }[],
  named: readonly BrandCount[],
) {
  const sentiments = items.flatMap((item) => (item.sentiment ? [item.sentiment] : []));
  return {
    share_of_voice: shareOfVoice(named),
    sentiment: sentiments.length === items.length ? pooledSentiment(sentiments) : null,
    web_search: pooledSearch(items.flatMap((item) => (item.web_search ? [item.web_search] : []))),
  };
}
