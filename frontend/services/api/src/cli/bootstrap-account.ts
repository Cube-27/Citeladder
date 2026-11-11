import { bootstrapDeployment } from '../auth/deployment-bootstrap.ts';
import { createDatabase } from '../db/database.ts';
import { loadConfig } from '../config.ts';
import { operatorMain } from './operator.ts';

await operatorMain(async () => {
  if (process.argv.includes('--help')) {
    console.log(
      'bootstrap:account. Development or demo identity/access, then the idempotent catalog (production: catalog only, once the operator exists), after the schema baseline (migrate).',
    );
    return;
  }
  const config = loadConfig();
  const db = createDatabase(config);
  try {
    console.log(JSON.stringify(await bootstrapDeployment(db, process.env)));
  } finally {
    await db.destroy();
  }
});
