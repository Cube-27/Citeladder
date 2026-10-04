import { bootstrapDeployment } from '../auth/deployment-bootstrap.ts';
import { createDatabase } from '../db/database.ts';
import { loadConfig } from '../config.ts';
import { operatorMain } from './operator.ts';

await operatorMain(async () => {
  if (process.argv.includes('--help')) {
    console.log(
      'bootstrap:account. Configured identity/access and idempotent catalog, after Alembic upgrade/check.',
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
