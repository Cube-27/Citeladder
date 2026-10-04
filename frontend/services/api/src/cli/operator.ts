import { loadConfig } from '../config.ts';
import { createDatabase, type Database } from '../db/database.ts';

export function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`--${name} is required`);
  return value;
}

// Exact reviewed slugs only; never print arbitrary Error.message, Zod issues or DB diagnostics.
const safeFailures = new Set([
  'catalog_idempotency_conflict',
  'catalog_idempotency_operation_conflict',
  'catalog_revision_conflict',
  'catalog_bootstrap_revision_exists',
  'catalog_publication_conflict',
  'catalog_revision_not_found',
  'catalog_forward_publication_required',
  'catalog_environment_mismatch',
  'configured_provider_environment_mismatch',
  'plan_reference_set_mismatch',
  'provider_plan_terms_mismatch',
  'provider_plan_reference_mismatch',
  'provider_mode_unavailable',
  'invalid_provider_mode',
  'invalid_plan_operation',
  'path_outside_workspace',
  'operator_input_too_large',
  'revocation_idempotency_conflict',
  'grant_not_found',
  'invalid_grant_validity',
  'invalid_development_allowance',
  'invalid_workspace_id',
  'reason_required',
  'development_target_must_be_operator',
  'grant_bundle_conflict',
]);

/** Commercial CLI errors expose a reviewed slug or type, never arbitrary input. */
export async function operatorMain(run: () => Promise<void>) {
  try {
    await run();
  } catch (error) {
    let diagnostic = error instanceof Error ? error.constructor.name : 'Error';
    if (error instanceof Error && safeFailures.has(error.message)) diagnostic = error.message;
    if (error instanceof Error && error.message === 'An active platform administrator is required')
      diagnostic = 'active_admin_required';
    console.error(diagnostic);
    process.exitCode = 1;
  }
}

/** Connection lifecycle only. Each command's domain owner enforces its own operator authority. */
export async function withOperatorDatabase(run: (db: Database) => Promise<void>) {
  const db = createDatabase(loadConfig());
  try {
    await run(db);
  } finally {
    await db.destroy();
  }
}
