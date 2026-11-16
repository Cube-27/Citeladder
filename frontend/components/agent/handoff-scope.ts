import { useQuery } from '@tanstack/react-query';
import type { AgentContextRefs } from '@citeladder/contracts/agent';

import { actionTarget, pathTail } from '@/lib/agent/action-title';
import { HANDOFF_URLS_MAX, withoutContext } from '@/lib/agent/handoff';
import { actionsQueries, type Action } from '@/lib/api/actions';
import type { ProjectScope } from '@/lib/api/query-keys/scope';
import { useDisplayTimeZone } from '@/lib/display-timezone';
import { formatCount, formatDisplayDate, pluralCount } from '@/lib/format';

/**
 * What a hand-off from the Actions pages covers, in the chips' words: one URL
 * by its last segment, then how many Actions touch it and its crawl (the URL
 * page's read, already cached when the page sent it), or an issue group's URL
 * count and how many of them the Agent is sent. Ticked URLs name themselves
 * (`contextChips`) and leave with the attached Action: `context` is what is sent.
 */
export function useHandoffScope({
  scope,
  context,
  action,
  attached,
}: Readonly<{
  scope: ProjectScope;
  context: AgentContextRefs;
  action: Pick<Action, 'target_kind' | 'page_count'> | undefined;
  attached: boolean;
}>): {
  context: AgentContextRefs;
  labels: Partial<Record<keyof AgentContextRefs, string>>;
  facts: string[];
} {
  const timeZone = useDisplayTimeZone();
  const sent = attached ? context : withoutContext(context, 'action_url_ids');
  const siteUrlId = context.url_actions_reference?.site_url_id;
  const url = useQuery({
    ...actionsQueries.urlActions(scope, siteUrlId ?? ''),
    enabled: Boolean(siteUrlId),
  });
  if (siteUrlId && url.data) {
    const path = actionTarget({ target_kind: 'page', target_label: url.data.url });
    return {
      context: sent,
      labels: { url_actions_reference: `URL: ${pathTail(path)}` },
      facts: [
        `${pluralCount(url.data.items.length, 'action')} on this URL`,
        `Crawl of ${formatDisplayDate(url.data.last_crawled_at, timeZone)}`,
      ],
    };
  }
  const group = groupFact(context, action);
  return { context: sent, labels: {}, facts: group ? [group] : [] };
}

function groupFact(
  context: AgentContextRefs,
  action: Pick<Action, 'target_kind' | 'page_count'> | undefined,
): string | undefined {
  if (context.action_url_ids || action?.target_kind !== 'issue_family') return undefined;
  const count = action.page_count;
  if (count === null) return undefined;
  if (count === 0) return 'Whole site';
  const urls = pluralCount(count, 'URL');
  return count > HANDOFF_URLS_MAX ? `${urls} (first ${formatCount(HANDOFF_URLS_MAX)} sent)` : urls;
}
