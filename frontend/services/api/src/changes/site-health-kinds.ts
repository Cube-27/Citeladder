import { z } from 'zod';
import { crawlScheduleUpdateRequestSchema } from '@citeladder/contracts/site-health-requests';
import type { Database } from '../db/database.ts';
import { record } from '../db/json.ts';
import { notFound } from '../errors.ts';
import { cancelCrawl } from '../site-health/controls.ts';
import { crawlBudgets, type CrawlStartKind } from '../site-health/crawl-budgets.ts';
import { crawlRequest } from '../site-health/crawl-request.ts';
import { startCrawl } from '../site-health/crawl-start.ts';
import { admitLinkRun, cancelLinkRun } from '../site-health/internal-link-runs.ts';
import { issueFixes, markIssueGroupFixed, rerunIssueGroup } from '../site-health/issue-fixes.ts';
import { loadCrawl } from '../site-health/reads/crawl.ts';
import { updateSchedule } from '../site-health/schedules.ts';
import { rerunPage, trackedPage } from '../site-health/selection.ts';
import {
  changeKind,
  countOf,
  heldUnits,
  MEMBER_RUN,
  MEMBER_WRITE,
  plural,
  type PreparedChange,
  type PreviewContext,
  ROW_COUNT,
} from './kind.ts';

const SITE = { label: 'Open Site Health', path: '/site' };
const ISSUES = { label: 'Open Issues', path: '/issues' };
const crawlGroup = z.strictObject({ crawl_id: z.uuid(), group_id: z.uuid() });

async function projectCrawl(
  db: Database,
  scope: { workspaceId: string; projectId: string },
  id: string,
) {
  const crawl = await loadCrawl(db, scope.workspaceId, id);
  if (crawl.project_id !== scope.projectId) throw notFound('Crawl');
  return crawl;
}

const changeScope = (workspaceId: string, change: PreparedChange) => ({
  workspaceId,
  projectId: change.projectId,
});

async function fetchSpend(context: PreviewContext, crawlId: string) {
  const fetches = await heldUnits(context.db, {
    workspaceId: context.workspaceId,
    kind: 'site_crawl',
    ids: [crawlId],
  });
  return fetches
    ? `Up to ${plural(fetches, 'page fetch', 'page fetches')} from the Site Health allowance`
    : 'No metered page fetches';
}

async function crawlStarted(context: PreviewContext, crawlId: string) {
  const crawl = await projectCrawl(context.db, context, crawlId);
  return { label: 'Crawl started', value: crawl.created_at.toISOString().slice(0, 16) };
}

async function budgetRow(context: PreviewContext, kind: CrawlStartKind) {
  const budgets = await crawlBudgets(context.db, context.workspaceId, context.config.settings);
  const { used, limit } = kind === 'full' ? budgets.full_crawls : budgets.page_crawls;
  return {
    label: kind === 'full' ? 'Full crawls' : 'Single-page crawls',
    value: `${used} of ${limit} this period, counting this one`,
  };
}

async function crawlPages(context: PreviewContext, crawlId: string) {
  const configuration = record((await projectCrawl(context.db, context, crawlId)).configuration);
  if (configuration.sample_mode === true)
    return `A free sample of up to ${plural(Number(configuration.requested_page_limit), 'page')}`;
  const limit = Number(configuration.monitored_url_limit);
  const tracked = await countOf(
    context.db
      .selectFrom('monitored_site_urls')
      .select(ROW_COUNT)
      .where('workspace_id', '=', context.workspaceId)
      .where('project_id', '=', context.projectId)
      .where('active', '=', true)
      .executeTakeFirst(),
  );
  return tracked >= limit
    ? `Re-crawls your ${plural(tracked, 'tracked page')} and adds no new pages`
    : `Up to ${plural(limit, 'page')}: your ${plural(tracked, 'tracked page')}, then new ones until the set is full`;
}

async function issuePages(context: PreviewContext, crawlId: string, groupId: string) {
  const fixes = await issueFixes(context.db, context.workspaceId, crawlId);
  const group = fixes.items.find((item) => item.group_id === groupId);
  return { label: 'Pages affected', value: String(group?.affected_url_count ?? 0) };
}

async function robotsRow(context: PreviewContext, chosen: 'respect' | 'ignore' | undefined) {
  if (chosen === 'ignore')
    return {
      label: 'robots.txt',
      value:
        'Ignored: the crawl also fetches pages robots.txt disallows. Your click records this as your decision.',
    };
  if (chosen === 'respect') return { label: 'robots.txt', value: 'Followed' };
  const inherited = await crawlRequest(context.db, context.workspaceId, context.projectId);
  return {
    label: 'robots.txt',
    value:
      inherited.robots === 'ignore'
        ? 'Ignored, as decided for the last crawl: the crawl also fetches pages robots.txt disallows.'
        : 'Followed',
  };
}

export const siteHealthKinds = {
  start_crawl: changeKind({
    permission: MEMBER_RUN,
    purpose:
      "crawl the whole site again: it re-crawls the tracked pages and never reads a page outside them, so never offer it to crawl or read one page; robots 'ignore' crawls pages robots.txt disallows and records the person's decision",
    payload: z.strictObject({ robots: z.enum(['respect', 'ignore']).optional() }),
    async execute(trx, config, actor, change, payload) {
      const user = await trx
        .selectFrom('users')
        .select(['id', 'email'])
        .where('id', '=', actor.userId)
        .executeTakeFirstOrThrow();
      const crawl = await startCrawl(trx, config.settings, {
        ...changeScope(actor.workspaceId, change),
        robots: payload.robots,
        user,
      });
      return { summary: 'Started a crawl. It runs on its own.', crawl: { id: crawl.id } };
    },
    async preview(context, payload, rehearse) {
      const { crawl } = await rehearse();
      const project = await context.db
        .selectFrom('projects')
        .select('website_url')
        .where('workspace_id', '=', context.workspaceId)
        .where('id', '=', context.projectId)
        .executeTakeFirst();
      return {
        title: 'Crawl the whole site',
        rows: [
          { label: 'Website', value: project?.website_url ?? '' },
          { label: 'Pages', value: await crawlPages(context, crawl.id) },
          await robotsRow(context, payload.robots),
          await budgetRow(context, 'full'),
        ],
        spend: await fetchSpend(context, crawl.id),
        opens: SITE,
      };
    },
  }),
  cancel_crawl: changeKind({
    permission: MEMBER_WRITE,
    purpose: 'stop a running crawl; pages analyzed so far are kept',
    payload: z.strictObject({ crawl_id: z.uuid() }),
    async execute(trx, _config, actor, change, payload) {
      await projectCrawl(trx, changeScope(actor.workspaceId, change), payload.crawl_id);
      await cancelCrawl(trx, actor.workspaceId, payload.crawl_id);
      return { summary: 'The crawl was cancelled.' };
    },
    async preview(context, payload) {
      return {
        title: 'Cancel a crawl',
        rows: [await crawlStarted(context, payload.crawl_id)],
        spend: null,
        opens: SITE,
      };
    },
  }),
  set_crawl_schedule: changeKind({
    permission: MEMBER_WRITE,
    purpose: 'turn the recurring crawl on or off and set its cadence',
    payload: crawlScheduleUpdateRequestSchema,
    async execute(trx, _config, actor, change, payload) {
      await updateSchedule(trx, actor.workspaceId, change.projectId, payload);
      return {
        summary: payload.enabled
          ? `The site is now crawled ${payload.cadence}.`
          : 'The scheduled crawl is off.',
      };
    },
    preview(_context, payload) {
      return Promise.resolve({
        title: payload.enabled
          ? `Crawl the site ${payload.cadence}`
          : 'Turn off the scheduled crawl',
        rows: [{ label: 'Cadence', value: payload.cadence }],
        spend: payload.enabled
          ? 'Each crawl uses page fetches from the Site Health allowance'
          : null,
        opens: SITE,
      });
    },
  }),
  rerun_page: changeKind({
    permission: MEMBER_RUN,
    purpose:
      "crawl one tracked page again by its URL, from the same monthly budget as the page's own button; a page outside the tracked set is refused, and then you say so and never offer a full crawl instead",
    payload: z.strictObject({ url: z.string().trim().min(1) }),
    async execute(trx, _config, actor, change, payload) {
      const scope = changeScope(actor.workspaceId, change);
      const page = await trackedPage(trx, { ...scope, url: payload.url });
      const rerun = await rerunPage(trx, actor.workspaceId, scope.projectId, page.id);
      return { summary: 'The page is queued to be crawled again.', crawl: { id: rerun.crawl_id } };
    },
    async preview(context, payload, rehearse) {
      const { crawl } = await rehearse();
      const page = await trackedPage(context.db, { ...context, url: payload.url });
      return {
        title: 'Crawl one page again',
        rows: [
          { label: 'Page', value: page.normalized_url },
          { label: 'Pages', value: '1 tracked page' },
          await budgetRow(context, 'page'),
        ],
        spend: await fetchSpend(context, crawl.id),
        opens: SITE,
      };
    },
  }),
  mark_issue_group_fixed: changeKind({
    permission: MEMBER_WRITE,
    purpose:
      'mark every page of one Site Health issue as fixed; the next crawl verifies it (read_site_health view issues)',
    payload: crawlGroup,
    async execute(trx, _config, actor, change, payload) {
      await projectCrawl(trx, changeScope(actor.workspaceId, change), payload.crawl_id);
      const progress = await markIssueGroupFixed(
        trx,
        actor.workspaceId,
        payload.crawl_id,
        payload.group_id,
      );
      return { summary: `Marked ${plural(progress.fixed_url_count, 'page')} fixed.` };
    },
    async preview(context, payload) {
      return {
        title: 'Mark an issue fixed',
        rows: [
          await crawlStarted(context, payload.crawl_id),
          await issuePages(context, payload.crawl_id, payload.group_id),
        ],
        spend: null,
        opens: ISSUES,
      };
    },
  }),
  rerun_issue_group: changeKind({
    permission: MEMBER_RUN,
    purpose:
      'analyze again the tracked pages of one Site Health issue (read_site_health view issues)',
    payload: crawlGroup,
    async execute(trx, _config, actor, change, payload) {
      await projectCrawl(trx, changeScope(actor.workspaceId, change), payload.crawl_id);
      const rerun = await rerunIssueGroup(
        trx,
        actor.workspaceId,
        payload.crawl_id,
        payload.group_id,
      );
      return {
        summary: `Queued ${plural(rerun.page_count, 'page')} to be analyzed again.`,
        crawl: { id: rerun.crawl_id },
      };
    },
    async preview(context, payload, rehearse) {
      return {
        title: 'Analyze an issue’s pages again',
        rows: [
          await crawlStarted(context, payload.crawl_id),
          await issuePages(context, payload.crawl_id, payload.group_id),
        ],
        spend: await fetchSpend(context, (await rehearse()).crawl.id),
        opens: ISSUES,
      };
    },
  }),
  start_link_analysis: changeKind({
    permission: MEMBER_RUN,
    purpose: "suggest internal links between a crawl's pages; uses one of the day's analyses",
    payload: z.strictObject({ crawl_id: z.uuid() }),
    async execute(trx, _config, actor, change, payload) {
      await admitLinkRun(trx, changeScope(actor.workspaceId, change), actor.userId, {
        crawl_id: payload.crawl_id,
        idempotency_key: change.id,
      });
      return { summary: 'Started the internal-link analysis. It runs on its own.' };
    },
    async preview(context, payload) {
      return {
        title: 'Suggest internal links',
        rows: [await crawlStarted(context, payload.crawl_id)],
        spend: "One of the day's internal-link analyses",
        opens: SITE,
      };
    },
  }),
  cancel_link_analysis: changeKind({
    permission: MEMBER_RUN,
    purpose: 'stop a queued or running internal-link analysis (read_site_links view analyses)',
    payload: z.strictObject({ analysis_id: z.uuid() }),
    async execute(trx, _config, actor, change, payload) {
      await cancelLinkRun(trx, changeScope(actor.workspaceId, change), payload.analysis_id);
      return { summary: 'The internal-link analysis was cancelled.' };
    },
    async preview(context, payload) {
      const run = await context.db
        .selectFrom('site_internal_link_runs')
        .select(['state', 'created_at'])
        .where('workspace_id', '=', context.workspaceId)
        .where('project_id', '=', context.projectId)
        .where('id', '=', payload.analysis_id)
        .executeTakeFirst();
      if (!run) throw notFound('Internal-link analysis');
      return {
        title: 'Cancel an internal-link analysis',
        rows: [
          { label: 'Started', value: run.created_at.toISOString().slice(0, 16) },
          { label: 'Status', value: run.state },
        ],
        spend: null,
        opens: SITE,
      };
    },
  }),
};
