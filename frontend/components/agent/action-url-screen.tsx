import { useQuery } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { useLocation, useParams } from 'react-router-dom';

import {
  BackLink,
  DetailsCard,
  Labelled,
  PageHeading,
  ReadingColumn,
} from '@/components/ui/reading-page';
import { Impact } from '@/components/agent/actions-rows';
import { PageFrame } from '@/components/templates/page-frame';
import { Breadcrumb, type Crumb } from '@/components/ui/breadcrumb';
import { buttonClasses } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { LinkRow, LinkRows } from '@/components/ui/link-rows';
import { ProjectLink } from '@/components/ui/project-link';
import { PageDock } from '@/components/ui/selection-dock';
import { StateBlock } from '@/components/ui/state-block';
import { readErrorProps } from '@/components/ui/notice';
import { fromActionSchema, listCrumbs, type FromAction } from '@/lib/agent/action-crumbs';
import { actionTarget } from '@/lib/agent/action-title';
import { agentHandoffHref } from '@/lib/agent/handoff';
import { ACTION_GROUPING_LABEL } from '@/lib/agent/vocabulary';
import { actionsQueries } from '@/lib/api/actions';
import { useDisplayTimeZone } from '@/lib/display-timezone';
import { formatDisplayDate, formatCount, readableUrl } from '@/lib/format';
import { useProjectScope } from '@/lib/project/active-project-scope';
import { pageKindLabel } from '@/lib/site-health/page-kinds';

/**
 * One URL's page (plan v3): the trail (through the Action it was opened
 * from, if any), the way back, the path, its Details and every Action on it,
 * then "Fix this URL with Agent". One read of the URL's Actions.
 */
export function ActionUrlScreen() {
  const { siteUrlId = '' } = useParams();
  const scope = useProjectScope();
  const timeZone = useDisplayTimeZone();
  const parsed = fromActionSchema.safeParse(useLocation().state);
  const from = parsed.success ? parsed.data.fromAction : null;
  const query = useQuery({
    ...actionsQueries.urlActions(scope, siteUrlId),
    enabled: Boolean(siteUrlId),
  });
  const data = query.data;
  const path = data ? actionTarget({ target_kind: 'page', target_label: data.url }) : 'URL';
  const open = data?.items.filter(
    (item) => item.status === 'open' || item.status === 'in_progress',
  );
  return (
    <PageFrame title={path} crumb={<Breadcrumb parts={[...trail(from), { label: tail(path) }]} />}>
      <ReadingColumn>
        <BackLink href={from ? `/actions/${from.id}` : '/actions'}>
          {from ? `Back to ${from.title}` : 'Back to actions'}
        </BackLink>
        {query.isError ? (
          <StateBlock
            kind="error"
            {...readErrorProps(query)}
            title="Couldn't load this URL"
            fallback="This URL could not be loaded."
          />
        ) : null}
        {data ? (
          <>
            <PageHeading>{readableUrl(data.url)}</PageHeading>
            <DetailsCard
              first
              facts={[
                {
                  label: 'Page type',
                  value: data.page_kind ? pageKindLabel(data.page_kind) : 'Not classified',
                },
                { label: 'Last crawled', value: formatDisplayDate(data.last_crawled_at, timeZone) },
                { label: 'Open actions', value: `${formatCount(open?.length ?? 0)} on this URL` },
              ]}
            />
            <Labelled title="Actions on this URL">
              {data.items.length === 0 ? (
                <StateBlock kind="empty" inline message="No action touches this URL." />
              ) : (
                <LinkRows label="Actions on this URL">
                  {data.items.map((item) => (
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
              )}
            </Labelled>
          </>
        ) : null}
        {!data && !query.isError ? (
          <StateBlock kind="loading" shape={{ kind: 'facts', rows: 3 }} />
        ) : null}
      </ReadingColumn>
      <PageDock label="Work on this URL">
        <ProjectLink
          href={agentHandoffHref({ urlActionsSiteUrlId: siteUrlId })}
          className={buttonClasses('primary')}
        >
          <Icon icon={Sparkles} />
          Fix this URL with Agent
        </ProjectLink>
      </PageDock>
    </PageFrame>
  );
}

/** Actions › goal › grouping › the Action it came from, or Actions alone. */
function trail(from: FromAction | null): Crumb[] {
  if (!from) return [{ label: 'Actions', href: '/actions' }];
  return [...listCrumbs(from), { label: from.title, href: `/actions/${from.id}` }];
}

/** The trail's last step: the path's last segment ("…/BB0556_OFF_WHITE"). */
function tail(path: string): string {
  const cut = path.lastIndexOf('/');
  return cut > 0 ? `…${path.slice(cut)}` : path;
}
