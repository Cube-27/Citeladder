import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import {
  authenticateOperator,
  manageAccount,
  type AccountAction,
} from '../workspaces/account-manager.ts';
import { required, withOperatorDatabase } from './operator.ts';

/** Raw terminal mode suppresses echo, including pasted passwords. Always restore it. */
async function password(label: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new Error('Passwords require an interactive terminal');
  process.stdout.write(`${label}: `);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  try {
    return await new Promise<string>((resolve, reject) => {
      let value = '';
      const receive = (chunk: Buffer) => {
        for (const character of chunk.toString('utf8')) {
          if (character === '\u0003' || character === '\u0004') {
            process.stdin.off('data', receive);
            reject(new Error('Password input cancelled'));
            return;
          }
          if (character === '\r' || character === '\n') {
            process.stdin.off('data', receive);
            resolve(value);
            return;
          }
          if (character === '\u007f' || character === '\b') value = value.slice(0, -1);
          else if (character >= ' ') value += character;
        }
      };
      process.stdin.on('data', receive);
    });
  } finally {
    process.stdin.setRawMode(false);
    process.stdin.pause();
    process.stdout.write('\n');
  }
}

async function ask(label: string) {
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await terminal.question(`${label}: `)).trim();
  } finally {
    terminal.close();
  }
}

const { values } = parseArgs({
  options: {
    actor: { type: 'string' },
    'workspace-id': { type: 'string' },
    help: { type: 'boolean' },
  },
});
if (values.help)
  console.log(
    'account:manage --actor WORKSPACE_OWNER_OR_ADMIN_EMAIL --workspace-id UUID (terminal passwords only)',
  );
else {
  const actor = required(values.actor, 'actor'),
    workspaceId = required(values['workspace-id'], 'workspace-id');
  await withOperatorDatabase(async (db) => {
    const session = await authenticateOperator(
      db,
      actor,
      workspaceId,
      await password('Operator password'),
    );
    console.log(`Managing ${workspaceId} as ${actor}`);
    while (true) {
      console.log('1 List members  2 Create/invite user  3 Change role  4 Reset password  0 Exit');
      const choice = await ask('Choice');
      if (choice === '0') return;
      try {
        // Recheck between choices; no transaction/locks remain open during prompts.
        const members = await manageAccount(db, session, { kind: 'list' });
        if (choice === '1') {
          console.log(members);
          continue;
        }
        const email = await ask('Email');
        let action: AccountAction;
        if (choice === '2') {
          const role = (await ask('Workspace role (admin/member/viewer)')).toLowerCase();
          const existing = await db
            .selectFrom('users')
            .select('id')
            .where('email', '=', email.toLowerCase())
            .executeTakeFirst();
          action = {
            kind: 'invite',
            email,
            role,
            ...(!existing ? { password: await password('New login password') } : {}),
          };
        } else if (choice === '3')
          action = {
            kind: 'role',
            email,
            role: (await ask('New role (admin/member/viewer)')).toLowerCase(),
          };
        else if (choice === '4')
          action = { kind: 'password', email, password: await password('New password') };
        else {
          console.log('Choose 0-4.');
          continue;
        }
        if ((await ask(`Confirm ${action.kind} for ${email} [type yes]`)).toLowerCase() !== 'yes')
          continue;
        console.log(await manageAccount(db, session, action));
      } catch (error) {
        console.log(`No change: ${error instanceof Error ? error.message : 'operation failed'}`);
      }
    }
  });
}
