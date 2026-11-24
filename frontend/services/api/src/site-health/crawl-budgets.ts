import { sql } from 'kysely';
import { asApiErrorCode } from '@citeladder/contracts/error-codes';
import { budget, budgetUse, giveBackUse, spendBudget } from '../abuse/usage.ts';
import type { SettingSource } from '../config/settings.ts';
import type { Database } from '../db/database.ts';
import { record } from '../db/json.ts';
import { ApiError } from '../errors.ts';
import { LIFECYCLE_KINDS } from './crawl-assessment.ts';
import type { Crawl } from './site-task.ts';

const startBudgets = {
  full: { name: 'site_health_full_crawl', noun: 'full crawls' },
  page: { name: 'site_health_page_crawl', noun: 'single-page crawls' },
} as const;

export type CrawlStartKind = keyof typeof startBudgets;
const START_KEY = 'start_budget';

function isStartKind(value: unknown): value is CrawlStartKind {
  return typeof value === 'string' && Object.hasOwn(startBudgets, value);
}

const startBudget = (kind: CrawlStartKind, settings: SettingSource) =>
  budget(startBudgets[kind].name, settings);

function exhausted(kind: CrawlStartKind, limit: number, resetsAt: Date) {
  const retryAfter = Math.max(1, Math.ceil((resetsAt.getTime() - Date.now()) / 1000));
  return new ApiError(
    429,
    `This workspace has used its ${limit} ${startBudgets[kind].noun} for this period. More are available from ${resetsAt.toISOString().slice(0, 10)}.`,
    {
      code: asApiErrorCode('site_health_crawl_budget_exhausted'),
      details: { budget: kind, limit, resets_at: resetsAt.toISOString() },
      headers: { 'retry-after': String(retryAfter) },
    },
  );
}

export async function withCrawlStart<Created extends Pick<Crawl, 'id' | 'workspace_id'>>(
  db: Database,
  start: Readonly<{ workspaceId: string; kind: CrawlStartKind; settings?: SettingSource }>,
  create: () => Promise<Created>,
): Promise<Created> {
  const spent = startBudget(start.kind, start.settings ?? process.env);
  try {
    await spendBudget(db, spent, start.workspaceId);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 429) throw error;
    const { resetsAt } = await budgetUse(db, spent, start.workspaceId);
    throw exhausted(start.kind, spent.limit, resetsAt);
  }
  const crawl = await create();
  await db
    .updateTable('site_crawls')
    .set({
      configuration: sql`coalesce(configuration, '{}'::jsonb) || ${JSON.stringify({ [START_KEY]: start.kind })}::jsonb`,
    })
    .where('workspace_id', '=', crawl.workspace_id)
    .where('id', '=', crawl.id)
    .execute();
  return crawl;
}

export async function giveBackUnfetchedStart(
  db: Database,
  crawl: Pick<Crawl, 'id' | 'workspace_id' | 'configuration' | 'created_at'>,
) {
  const kind = record(crawl.configuration)[START_KEY];
  if (!isStartKind(kind)) return;
  const fetched = await db
    .selectFrom('site_crawl_tasks')
    .select('id')
    .where('workspace_id', '=', crawl.workspace_id)
    .where('crawl_id', '=', crawl.id)
    .where('task_kind', 'in', LIFECYCLE_KINDS)
    .where('status', '<>', 'queued')
    .limit(1)
    .executeTakeFirst();
  if (fetched) return;
  await giveBackUse(db, startBudget(kind, process.env), crawl.workspace_id, crawl.created_at);
}

export async function crawlBudgets(
  db: Database,
  workspaceId: string,
  settings: SettingSource = process.env,
) {
  const left = async (kind: CrawlStartKind) => {
    const spent = startBudget(kind, settings);
    const { used, resetsAt } = await budgetUse(db, spent, workspaceId);
    return {
      limit: spent.limit,
      used: Math.min(used, spent.limit),
      remaining: Math.max(0, spent.limit - used),
      resets_at: resetsAt.toISOString(),
    };
  };
  return { full_crawls: await left('full'), page_crawls: await left('page') };
}
