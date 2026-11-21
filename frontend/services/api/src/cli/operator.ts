import { PlatformAdminRequired } from '../auth/operators.ts';
import { loadConfig } from '../config.ts';
import { createDatabase, type Database, type DatabaseConfig } from '../db/database.ts';
import { ApiError } from '../errors.ts';

export function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`--${name} is required`);
  return value;
}

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
  'invalid_grant_validity',
  'invalid_development_allowance',
  'invalid_workspace_id',
  'reason_required',
  'development_target_must_be_operator',
  'grant_bundle_conflict',
  'explicit_database_required',
  'operator_authentication_failed',
  'operator_session_revoked',
  'user_already_exists',
  'duplicate_account_email',
  'new_workspace_requires_owner',
  'workspace_not_found',
  'account_has_retained_activity',
  'account_delete_forbidden',
  'account_state_forbidden',
  'transfer_ownership_first',
  'account_identity_changed',
  'account_membership_changed',
  'password_confirmation_mismatch',
  'passwordless_account',
  'account_password_forbidden',
  'invalid_development_allowance',
  'invalid_grant_validity',
]);

export class OperatorRefusal extends Error {}

export function operatorDiagnostic(error: unknown): string {
  if (error instanceof OperatorRefusal) return error.message;
  if (error instanceof PlatformAdminRequired) return 'active_admin_required';
  if (error instanceof ApiError) return error.code;
  if (error instanceof Error && safeFailures.has(error.message)) return error.message;
  if (
    error instanceof Error &&
    'code' in error &&
    typeof error.code === 'string' &&
    /^[0-9A-Z]{5}$/u.test(error.code)
  )
    return `${error.constructor.name} ${error.code}`;
  return error instanceof Error ? error.constructor.name : 'Error';
}

export async function operatorMain(run: () => Promise<void>) {
  try {
    await run();
  } catch (error) {
    console.error(operatorDiagnostic(error));
    process.exitCode = 1;
  }
}

export async function withOperatorDatabase(
  run: (db: Database) => Promise<void>,
  config: DatabaseConfig = loadConfig(),
) {
  const db = createDatabase(config);
  try {
    await run(db);
  } finally {
    await db.destroy();
  }
}
