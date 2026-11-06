/**
 * The workspace's Site Health runtime: discovery mode, URL caps and the
 * monitored allowance its plan resolves to. `runtimeProjection` derives it;
 * `refreshRuntime` is the only writer of `workspace_site_health_runtime`,
 * called by grant changes (in the transaction that appends billing evidence)
 * and by crawl admission. Reads resolve the same projection without writing.
 */
import { randomUUID } from 'node:crypto';
import { policy } from '../config.ts';
import { resolveSettingSpec } from '../config/settings.ts';
import type { Database } from '../db/database.ts';
import { accountState } from '../entitlements/state.ts';

/**
 * The Site Health runtime an account state resolves to. An unresolved or
 * missing account gets the sample runtime: no monitored allowance, no count
 * disclosure.
 */
export function runtimeProjection(
  state: { error: string | null; values: ReadonlyMap<string, number> } | null,
) {
  const allowance = !state || state.error ? 0 : (state.values.get('monitored_urls') ?? 0);
  const cfg = policy.site_health_runtime;
  const setting = (key: keyof typeof cfg.settings) =>
    resolveSettingSpec(cfg.settings[key], process.env) as number;
  const full = allowance > 0;
  return {
    discovery_mode: full ? cfg.full_mode : cfg.sample_mode,
    discovery_url_cap: full
      ? Math.min(
          setting('automatic_page_limit'),
          Math.max(cfg.full_minimum, allowance * cfg.full_headroom),
        )
      : setting('sample_discovery_url_cap'),
    sample_url_limit: full ? 0 : setting('sample_url_limit'),
    monitored_url_limit: allowance,
    count_disclosure: full,
  };
}

/**
 * Persists the runtime the account's grants resolve to now and returns that
 * account state. A workspace with no billing account keeps the sample runtime
 * once written; its state is null.
 */
export async function refreshRuntime(
  db: Database,
  workspaceId: string,
  accountId: string | null,
  at: Date,
) {
  const state = accountId ? await accountState(db, workspaceId, accountId, at) : null;
  const projection = {
    ...runtimeProjection(state),
    resolved_registry_revision: policy.entitlements.registry_revision,
    resolved_entitlement_lifecycle_version: state?.account.entitlement_lifecycle_version ?? 0,
    updated_at: at,
  };
  await db
    .insertInto('workspace_site_health_runtime')
    .values({ id: randomUUID(), workspace_id: workspaceId, created_at: at, ...projection })
    .onConflict((c) =>
      state
        ? c.column('workspace_id').doUpdateSet(projection)
        : c.column('workspace_id').doNothing(),
    )
    .execute();
  return state;
}
