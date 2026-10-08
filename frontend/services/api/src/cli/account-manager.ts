import { parseArgs } from 'node:util';
import type { Database } from '../db/database.ts';
import {
  authenticateOperator,
  manageAccount,
  type AccountAction,
  type OperatorSession,
} from '../workspaces/account-manager.ts';
import { required, withOperatorDatabase, operatorMain } from './operator.ts';
import { terminalPassword } from './terminal-password.ts';
import { accountPrompt, runPlatformAccountManager } from './account-management.ts';

async function collectAction(
  db: Database,
  choice: string,
): Promise<Exclude<AccountAction, { kind: 'list' }> | null> {
  if (!['2', '3', '4'].includes(choice)) {
    console.log('Choose 0-4.');
    return null;
  }
  const email = await accountPrompt('Email');
  if (choice === '4')
    return { kind: 'password', email, password: await terminalPassword('New password') };
  const role = (await accountPrompt('Workspace role (admin/member/viewer)')).toLowerCase();
  if (choice === '3') return { kind: 'role', email, role };
  const existing = await db
    .selectFrom('users')
    .select('id')
    .where('email', '=', email.toLowerCase())
    .executeTakeFirst();
  return {
    kind: 'invite',
    email,
    role,
    ...(!existing ? { password: await terminalPassword('New login password') } : {}),
  };
}

async function manageChoice(db: Database, session: OperatorSession): Promise<boolean> {
  console.log('1 List members  2 Create/invite user  3 Change role  4 Reset password  0 Exit');
  const choice = await accountPrompt('Choice');
  if (choice === '0') return false;
  try {
    // Recheck between choices; no transaction/locks remain open during prompts.
    const members = await manageAccount(db, session, { kind: 'list' });
    if (choice === '1') console.log(members);
    else {
      const action = await collectAction(db, choice);
      if (
        action &&
        (
          await accountPrompt(`Confirm ${action.kind} for ${action.email} [type yes]`)
        ).toLowerCase() === 'yes'
      )
        console.log(await manageAccount(db, session, action));
    }
  } catch (error) {
    console.log(`No change: ${error instanceof Error ? error.message : 'operation failed'}`);
  }
  return true;
}

const { values } = parseArgs({
  options: {
    actor: { type: 'string' },
    'workspace-id': { type: 'string' },
    platform: { type: 'boolean' },
    help: { type: 'boolean' },
  },
});
if (values.help)
  console.log(
    'account:manage --actor EMAIL (--platform | --workspace-id UUID). Platform mode requires an explicit DATABASE_URL and an authenticated platform admin.',
  );
else if (values.platform)
  await operatorMain(() => runPlatformAccountManager(required(values.actor, 'actor')));
else {
  const actor = required(values.actor, 'actor'),
    workspaceId = required(values['workspace-id'], 'workspace-id');
  await withOperatorDatabase(async (db) => {
    const session = await authenticateOperator(
      db,
      actor,
      workspaceId,
      await terminalPassword('Operator password'),
    );
    console.log(`Managing ${workspaceId} as ${actor}`);
    // A choice includes prompts and confirmation; finish it before asking for another.
    while (await manageChoice(db, session)) {
      /* interactive session */
    }
  });
}
