import { parseArgs } from 'node:util';
import { loadConfig } from '../config.ts';
import { createDatabase } from '../db/database.ts';
import { provisionDevelopmentLogin } from '../auth/bootstrap.ts';
import { initializeCatalog } from '../billing/admin.ts';
import { operatorMain, required } from './operator.ts';
import { policy } from '../config.ts';
import { localEnvironment } from './local-environment.ts';

await operatorMain(async () => {
  const { values } = parseArgs({
    options: {
      email: { type: 'string' },
      'password-stdin': { type: 'boolean' },
      'counter-allowance': { type: 'string' },
      help: { type: 'boolean' },
    },
  });
  if (values.help) {
    console.log('provision:dev --email EMAIL --password-stdin --counter-allowance N');
    return;
  }
  if (!values['password-stdin']) throw new Error('password_stdin_required');
  let password = '';
  for await (const chunk of process.stdin) {
    password += String(chunk);
    if (password.length > policy.secret_policy.login_password.max_chars + 2)
      throw new Error('password_input_too_large');
  }
  const config = loadConfig(localEnvironment());
  const db = createDatabase(config);
  try {
    const result = await provisionDevelopmentLogin(db, config, {
      email: required(values.email, 'email'),
      password: password.replace(/\r?\n$/u, ''),
      allowance: Number(required(values['counter-allowance'], 'counter-allowance')),
    });
    await initializeCatalog(db, result.email, null);
    console.log(JSON.stringify(result));
  } finally {
    await db.destroy();
  }
});
