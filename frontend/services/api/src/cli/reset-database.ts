import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { localEnvironment } from './local-environment.ts';
import { operatorMain } from './operator.ts';
import { resetSequence } from './reset-sequence.ts';

await operatorMain(async () => {
  await resetSequence(localEnvironment(), promisify(execFile));
  console.log('Database reset, schema baseline and configured provisioning completed.');
});
