import { asApiErrorCode } from '@citeladder/contracts/error-codes';
import { sql } from 'kysely';

import { policy } from '../config.ts';
import type { Database } from '../db/database.ts';
import { ApiError } from '../errors.ts';
import { getLogger } from '../logging.ts';
import { monitoredUrlCount } from '../site-health/reads/runtime.ts';
import type { WorkspaceEntitlements } from './access.ts';
import { billingAccountId, capacityLock } from './ledger.ts';
import { resolveAccountEntitlement } from './state.ts';

const logger = getLogger('api.entitlements');
const { codes, prompt_slots: PROMPT_SLOTS } = policy.entitlements;
const UNRESOLVED = asApiErrorCode(codes.unresolved);
const LIMIT_EXCEEDED = asApiErrorCode(codes.limit_exceeded);

const unresolved = () =>
  new ApiError(403, 'Billing entitlement is unavailable for this account', { code: UNRESOLVED });

export async function lockWorkspaceCapacity(db: Database, workspaceId: string): Promise<string> {
  const accountId = await billingAccountId(db, workspaceId);
  if (accountId === undefined) {
    logger.info('billing.occupancy_unresolved', {
      workspace_id: workspaceId,
      error: 'workspace_billing_account_missing',
    });
    throw new ApiError(403, 'Billing entitlement is unavailable for this workspace', {
      code: UNRESOLVED,
    });
  }
  await capacityLock(db, accountId);
  return accountId;
}

export async function lockedGrants(db: Database, workspaceId: string, at = new Date()) {
  const accountId = await lockWorkspaceCapacity(db, workspaceId);
  const resolved = await resolveAccountEntitlement(db, { accountId, workspaceId }, at);
  if (resolved.status !== 'resolved') {
    logger.info('billing.occupancy_unresolved', { account_id: accountId, errors: resolved.error });
    throw unresolved();
  }
  return { accountId, values: resolved.values };
}

const count = (row: { count: string }) => Number(row.count);

async function projectCount(db: Database, workspaceId: string) {
  return count(
    await db
      .selectFrom('projects')
      .select(sql<string>`count(*)`.as('count'))
      .where('workspace_id', '=', workspaceId)
      .executeTakeFirstOrThrow(),
  );
}

function slotPrompts(db: Database) {
  return db
    .selectFrom('prompts')
    .innerJoin('prompt_sets', 'prompt_sets.id', 'prompts.prompt_set_id')
    .innerJoin('projects', 'projects.id', 'prompt_sets.project_id');
}

async function promptCount(db: Database, workspaceId: string) {
  return count(
    await slotPrompts(db)
      .select(sql<string>`count(*)`.as('count'))
      .where('projects.workspace_id', '=', workspaceId)
      .executeTakeFirstOrThrow(),
  );
}

async function apiKeyCount(db: Database, workspaceId: string, at: Date) {
  return count(
    await db
      .selectFrom('api_keys')
      .select(sql<string>`count(*)`.as('count'))
      .where('workspace_id', '=', workspaceId)
      .where('revoked_at', 'is', null)
      .where((eb) => eb.or([eb('expires_at', 'is', null), eb('expires_at', '>', at)]))
      .executeTakeFirstOrThrow(),
  );
}

async function marketCount(db: Database, workspaceId: string) {
  return count(
    await db
      .selectFrom('project_markets')
      .select(sql<string>`count(*)`.as('count'))
      .where('workspace_id', '=', workspaceId)
      .executeTakeFirstOrThrow(),
  );
}

type Use = { allowance: number; current: number; requested: number };
type Counter = {
  count: (db: Database, workspaceId: string, at: Date) => Promise<number>;
  requires?: { key: string; refusal: () => ApiError };
  refuse?: (use: Use) => ApiError;
};

const limit = (message: string, key: string, use: Use) =>
  new ApiError(403, message, { code: LIMIT_EXCEEDED, details: { key, ...use } });
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const COUNTERS = {
  project_slots: {
    count: projectCount,
    refuse: (use) =>
      limit(
        use.allowance < 1
          ? "Your plan doesn't include projects"
          : `Your plan includes ${plural(use.allowance, 'project', 'projects')}, and this workspace has ${use.current}`,
        'project_slots',
        use,
      ),
  },
  prompt_slots: {
    count: promptCount,
    refuse: (use) =>
      limit(
        `Your plan includes ${plural(use.allowance, 'prompt', 'prompts')}; ` +
          `this workspace has ${use.current}, so ${use.requested} more would go over`,
        'prompt_slots',
        use,
      ),
  },
  api_keys: {
    count: apiKeyCount,
    requires: {
      key: 'api_access',
      refusal: () =>
        new ApiError(403, policy.entitlements.flag_refusals.api_access.message, {
          code: asApiErrorCode(policy.entitlements.flag_refusals.api_access.code),
        }),
    },
    refuse: ({ allowance, current }) =>
      new ApiError(409, `This workspace already has ${current} of ${allowance} API keys`, {
        code: 'api_key_limit_reached',
        details: { allowance, current },
      }),
  },
  market_slots: {
    count: marketCount,
    refuse: (use) =>
      limit(
        use.allowance
          ? `This workspace already uses ${use.current} of ${use.allowance} additional markets`
          : "Additional markets are not included in this workspace's plan",
        'market_slots',
        use,
      ),
  },
  monitored_urls: { count: (db, workspaceId) => monitoredUrlCount(db, workspaceId) },
} satisfies Record<string, Counter>;

export type AdmittedCounter = {
  [K in keyof typeof COUNTERS]: (typeof COUNTERS)[K] extends { refuse: unknown } ? K : never;
}[keyof typeof COUNTERS];

export async function admit(
  db: Database,
  workspaceId: string,
  key: AdmittedCounter,
  requested: number,
  at = new Date(),
): Promise<void> {
  const { accountId, values } = await lockedGrants(db, workspaceId, at);
  const counter: Counter & Required<Pick<Counter, 'refuse'>> = COUNTERS[key];
  if (counter.requires && (values.get(counter.requires.key) ?? 0) < 1)
    throw counter.requires.refusal();
  const use = {
    allowance: values.get(key) ?? 0,
    current: await counter.count(db, workspaceId, at),
    requested,
  };
  if (use.current + requested <= use.allowance) return;
  logger.info('billing.occupancy_limit_exceeded', { account_id: accountId, key, ...use });
  throw counter.refuse(use);
}

export async function occupancyCounts(
  db: Database,
  workspaceId: string,
  at: Date,
): Promise<ReadonlyMap<string, number>> {
  const counters: [string, Counter][] = Object.entries(COUNTERS);
  return new Map(
    await Promise.all(
      counters.map(
        async ([key, counter]) => [key, await counter.count(db, workspaceId, at)] as const,
      ),
    ),
  );
}

export async function overLimitPromptIds(
  db: Database,
  entitlements: WorkspaceEntitlements,
): Promise<ReadonlySet<string>> {
  const granted = await entitlements.granted();
  if (granted === null) throw unresolved();
  const allowance = granted.get(PROMPT_SLOTS) ?? 0;
  const rows = await slotPrompts(db)
    .select('prompts.id')
    .where('projects.workspace_id', '=', entitlements.workspaceId)
    .orderBy('prompts.created_at')
    .orderBy('prompts.id')
    .offset(allowance)
    .execute();
  return new Set(rows.map((row) => row.id));
}

export function overLimitSelection(excluded: number) {
  return new ApiError(403, 'Some selected prompts are beyond your plan’s prompt limit', {
    code: LIMIT_EXCEEDED,
    details: { key: PROMPT_SLOTS, excluded },
  });
}
