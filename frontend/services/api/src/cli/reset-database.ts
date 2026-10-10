import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { localEnvironment } from './local-environment.ts';
import { operatorMain } from './operator.ts';
import { resetSequence, ResetRefusal } from './reset-sequence.ts';

await operatorMain(async () => {
  try {
    await resetSequence(localEnvironment(), promisify(execFile));
  } catch (error) {
    if (!(error instanceof ResetRefusal)) throw error;
    console.error(error.message);
    process.exitCode = 1;
    return;
  }
  console.log('Database reset, schema baseline and configured provisioning completed.');
});
