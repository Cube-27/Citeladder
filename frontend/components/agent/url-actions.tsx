import { useQuery } from '@tanstack/react-query';

import { Impact } from '@/components/agent/actions-rows';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { LinkRow, LinkRows } from '@/components/ui/link-rows';
import { readErrorProps } from '@/components/ui/notice';
import { ProjectLink } from '@/components/ui/project-link';
import { StateBlock } from '@/components/ui/state-block';
import { actionTarget } from '@/lib/agent/action-title';
import { agentHandoffHref } from '@/lib/agent/handoff';
import { ACTION_GROUPING_LABEL } from '@/lib/agent/vocabulary';
import { actionsQueries } from '@/lib/api/actions';
import { Sparkles } from '@/lib/icons';
import { useProjectScope } from '@/lib/project/active-project-scope';

const URL_ASK = 'Fix every action on this URL, starting with the shared ones.';

function useUrlActions(siteUrlId: string) {
  return useQuery(actionsQueries.urlActions(useProjectScope(), siteUrlId));
}

export function useUrlActionCount(siteUrlId: string) {
  return useUrlActions(siteUrlId).data?.items.length;
}

export function UrlActionsList({ siteUrlId }: Readonly<{ siteUrlId: string }>) {
  const query = useUrlActions(siteUrlId);
  if (query.isPending) return <StateBlock kind="loading" shape={{ kind: 'facts', rows: 3 }} />;
  if (query.isError)
    return (
      <StateBlock
        kind="error"
        {...readErrorProps(query)}
        title="Couldn't load the actions"
        fallback="The actions on this URL could not be loaded."
      />
    );
  if (query.data.items.length === 0)
    return <StateBlock kind="empty" inline message="No action touches this URL." />;
  return (
    <LinkRows label="Actions on this URL">
      {query.data.items.map((item) => (
        <LinkRow
          key={item.id}
          href={`/actions/${item.id}`}
          name={actionTarget(item)}
          facts={[
            ACTION_GROUPING_LABEL[item.grouping],
            <Impact key="impact" band={item.priority_band} />,
          ]}
        />
      ))}
    </LinkRows>
  );
}

export function FixUrlWithAgent({ siteUrlId }: Readonly<{ siteUrlId: string }>) {
  const { data } = useUrlActions(siteUrlId);
  const open = data?.items.some((item) => item.status === 'open' || item.status === 'in_progress');
  if (!open) return null;
  return (
    <Button asChild variant="secondary">
      <ProjectLink href={agentHandoffHref({ urlActionsSiteUrlId: siteUrlId, prompt: URL_ASK })}>
        <Icon icon={Sparkles} />
        Fix this URL with Agent
      </ProjectLink>
    </Button>
  );
}
