import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { policy, resolveSettingSpec } from '../config.ts';
import { accountDatabaseConfig } from '../config/account-management.ts';
import type { Database } from '../db/database.ts';
import {
  authenticatePlatformOperator,
  managePlatformAccounts,
  platformAccountInventory,
  platformAccountGrants,
  type PlatformAction,
  type PlatformSession,
} from '../workspaces/account-manager.ts';
import { terminalPassword } from './terminal-password.ts';
import { redact } from '../billing/admin.ts';
import { operatorDiagnostic, withOperatorDatabase } from './operator.ts';

/** One terminal answer, trimmed, with an optional default. */
export async function accountPrompt(label: string, fallback?: string): Promise<string> {
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (
      (
        await terminal.question(`${label}${fallback === undefined ? '' : ` [${fallback}]`}: `)
      ).trim() ||
      fallback ||
      ''
    );
  } finally {
    terminal.close();
  }
}

async function confirmedPassword(label: string) {
  const password = await terminalPassword(label);
  if (password !== (await terminalPassword(`Confirm ${label.toLowerCase()}`)))
    throw new Error('password_confirmation_mismatch');
  return password;
}

const splitList = (value: string) => value.split(',').map((item) => item.trim());

function display(value: unknown) {
  console.log(JSON.stringify(redact(value), null, 2));
}

async function selectWorkspace(db: Database, session: PlatformSession) {
  const inventory = await platformAccountInventory(db, session);
  inventory.workspaces.forEach((workspace, index) =>
    console.log(`${index + 1} ${workspace.name} — ${workspace.owner} (${workspace.id})`),
  );
  const selected = inventory.workspaces[Number(await accountPrompt('Workspace number')) - 1];
  if (!selected?.account_id) throw new Error('workspace_not_found');
  return { workspaceId: selected.id, accountId: selected.account_id };
}

/** A real calendar instant: `new Date` would roll 2026-02-30 over into March. */
function calendarDate(value: string) {
  const parts = /^(\d{4})-(\d{2})-(\d{2})/u.exec(value);
  const date = new Date(value);
  if (!parts || !Number.isFinite(date.getTime())) throw new Error('invalid_grant_validity');
  const [, year, month, day] = parts.map(Number);
  const calendar = new Date(Date.UTC(year!, month! - 1, day!));
  if (calendar.getUTCMonth() !== month! - 1 || calendar.getUTCDate() !== day!)
    throw new Error('invalid_grant_validity');
  return date;
}

async function accessSettings() {
  console.log('All issuable feature flags and highest feature levels; finite counter allowances.');
  console.log(
    'Dev-only Agent funding, Crawl Logs ingestion and advanced Site Health remain restricted.',
  );
  const allowance = Number(
    await accountPrompt(
      'Counter allowance',
      String(resolveSettingSpec(policy.settings.dev_login_counter_allowance)),
    ),
  );
  const expiry = await accountPrompt(
    'Extra entitlements expiry (ISO timestamp; blank means no expiry)',
  );
  return { allowance, until: expiry ? calendarDate(expiry) : null };
}

async function collectPlatformAction(
  db: Database,
  session: PlatformSession,
  choice: string,
): Promise<PlatformAction | null> {
  if (choice === '2') {
    const emails = splitList(await accountPrompt('Emails (comma separated)'));
    const password = await confirmedPassword('New login password');
    const destination = await accountPrompt(
      '1 New owned workspace per account  2 Join existing workspace',
      '1',
    );
    const target = destination === '2' ? await selectWorkspace(db, session) : undefined;
    if (!['1', '2'].includes(destination)) return null;
    const role = target
      ? await accountPrompt('Workspace role (admin/member/viewer)', 'admin')
      : 'owner';
    const grant = await accountPrompt(
      'Grant extra full evaluation entitlements? (yes/no)',
      target ? 'no' : 'yes',
    );
    if (!['yes', 'no'].includes(grant)) return null;
    return {
      kind: 'create',
      emails,
      password,
      workspaceId: target?.workspaceId,
      role,
      access: grant === 'yes' ? await accessSettings() : undefined,
    };
  }
  if (choice === '5')
    return {
      kind: 'access',
      ...(await selectWorkspace(db, session)),
      access: await accessSettings(),
    };
  if (choice === '3' || choice === '4' || choice === '8') {
    const { workspaceId } = await selectWorkspace(db, session);
    const email = await accountPrompt('Member email');
    if (choice === '3')
      return {
        kind: 'role',
        workspaceId,
        email,
        role: await accountPrompt('Workspace role (admin/member/viewer)'),
      };
    if (choice === '8') return { kind: 'remove', workspaceId, email };
    return {
      kind: 'password',
      workspaceId,
      email,
      password: await confirmedPassword('New password'),
    };
  }
  if (choice === '6') {
    const scope = await selectWorkspace(db, session);
    const grants = await platformAccountGrants(db, session, scope);
    display(grants);
    return {
      kind: 'revoke',
      ...scope,
      grantIds: splitList(await accountPrompt('Exact grant IDs to revoke (comma separated)')),
    };
  }
  if (choice === '7') {
    const email = await accountPrompt('Account email');
    console.log(
      '1 Disable login (retains workspaces and history)  2 Enable login  3 Permanently delete unused account',
    );
    const decision = await accountPrompt('Account action');
    if (decision === '3') {
      console.log(
        'Permanent deletion removes only empty personal workspaces and the identity. Any retained activity or grants blocks deletion.',
      );
      return { kind: 'delete', email };
    }
    if (decision === '1' || decision === '2')
      return { kind: 'state', email, active: decision === '2' };
  }
  return null;
}

export function runPlatformAccountManager(actor: string) {
  return withOperatorDatabase(async (db) => {
    let password = process.env.ACCOUNT_MANAGER_OPERATOR_PASSWORD || '';
    delete process.env.ACCOUNT_MANAGER_OPERATOR_PASSWORD;
    if (!password) password = await terminalPassword('Platform operator password');
    const session = await authenticatePlatformOperator(db, actor, password);
    password = '';
    console.log(
      `Production account management as ${actor}. Workspace roles never grant platform administration.`,
    );
    while (true) {
      console.log(
        '\n1 List accounts/workspaces  2 Create accounts  3 Change workspace role  4 Reset member password',
      );
      console.log(
        '5 Grant full evaluation access  6 Revoke grants  7 Disable/enable/delete account  8 Remove workspace member  0 Exit',
      );
      const choice = await accountPrompt('Choice');
      if (choice === '0') break;
      try {
        // Every read and mutation below rechecks the operator's live authority.
        if (choice === '1') {
          display(await platformAccountInventory(db, session));
          continue;
        }
        const action = await collectPlatformAction(db, session, choice);
        if (!action) {
          console.log('Choose 0-8. No changes.');
          continue;
        }
        const reason = await accountPrompt('Reason');
        const request = { reason, key: `account-manager:${randomUUID()}`, at: new Date() };
        const preview = await managePlatformAccounts(db, session, action, request);
        console.log('Preview only — no changes committed:');
        display(preview);
        const confirmation = action.kind === 'delete' ? `delete ${action.email}` : 'yes';
        if (
          (await accountPrompt(`Commit this operation (type ${confirmation})`)) !== confirmation
        ) {
          console.log('Cancelled. No changes.');
          continue;
        }
        display(await managePlatformAccounts(db, session, action, { ...request, apply: true }));
      } catch (error) {
        console.log(`No change: ${operatorDiagnostic(error)}`);
      }
    }
  }, accountDatabaseConfig(process.env));
}
