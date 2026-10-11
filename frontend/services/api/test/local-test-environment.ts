/**
 * For scripts/api-test.ps1: prints the local database URL (from the shared
 * .env reader) and the inherited credential names the test guard would refuse,
 * as JSON on stdout. The caller captures it; it is never shown.
 */
import { localEnvironment } from '../src/cli/local-environment.ts';
import { isInheritedCredential } from './inherited-credentials.ts';

const url = localEnvironment().DATABASE_URL;
if (!url) throw new Error('Set POSTGRES_* in .env (see .env.example).');
process.stdout.write(
  JSON.stringify({
    url,
    clear: Object.keys(process.env).filter((name) => isInheritedCredential(name)),
  }),
);
