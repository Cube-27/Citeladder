import { useQuery } from '@tanstack/react-query';
import type { AgentContextRefs } from '@citeladder/contracts/agent';

import { actionTarget } from '@/lib/agent/action-title';
import { HANDOFF_URLS_MAX } from '@/lib/agent/handoff';
import { actionsQueries, type Action } from '@/lib/api/actions';
import type { ProjectScope } from '@/lib/api/query-keys/scope';
import { formatCount, pluralCount } from '@/lib/format';

/**
 * What a hand-off from the Actions pages covers, in the chips' words: one URL
 * by its path with how many Actions touch it (the URL page's read, already
 * cached when the page sent it), or an issue group's URL count and how many
 * of them the Agent is sent. Ticked URLs name themselves (`contextChips`).
 */
export function useHandoffScope(
  scope: ProjectScope,
  context: AgentContextRefs,
  action: Pick<Action, 'target_kind' | 'page_count'> | undefined,
) {
  const siteUrlId = context.url_actions_reference?.site_url_id;
  const url = useQuery({
    ...actionsQueries.urlActions(scope, siteUrlId ?? ''),
    enabled: Boolean(siteUrlId),
  });
  if (siteUrlId && url.data) {
    const path = actionTarget({ target_kind: 'page', target_label: url.data.url });
    const count = pluralCount(url.data.items.length, 'action');
    return { labels: { url_actions_reference: `URL: ${path} · ${count}` }, chip: undefined };
  }
  return { labels: {}, chip: groupChip(context, action) };
}

function groupChip(
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
