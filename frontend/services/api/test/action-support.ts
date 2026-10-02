import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { z } from 'zod';
import { testDatabase } from './support.ts';
import { extractPageFacts, factSettings } from '../src/site-health/analysis/facts.ts';

/** Isolate the Python fixture process from dotenv and inherited provider secrets. */
export async function actionFixture<T>(...args: string[]): Promise<T> {
  const backend = fileURLToPath(new URL('../../../../backend/', import.meta.url));
  const executable = fileURLToPath(
    new URL(
      process.platform === 'win32'
        ? '../../../../backend/.venv/Scripts/python.exe'
        : '../../../../backend/.venv/bin/python',
      import.meta.url,
    ),
  );
  const system = Object.fromEntries(
    ['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'HOME'].flatMap((key) =>
      process.env[key] ? [[key, process.env[key]!]] : [],
    ),
  );
  const { stdout } = await promisify(execFile)(
    executable,
    [fileURLToPath(new URL('./action-fixture.py', import.meta.url)), ...args],
    {
      cwd: backend,
      env: {
        ...system,
        PYTHONPATH: backend,
        CITELADDER_DISABLE_DOTENV: '1',
        APP_ENV: 'test',
        DATABASE_URL: process.env.API_TEST_DATABASE_URL!.replace(
          'postgresql://',
          'postgresql+asyncpg://',
        ),
        JWT_SECRET_KEY: 'pr7b-test-jwt-key-not-a-real-secret-1234',
        ENCRYPTION_KEY: 'pr7b-test-encryption-key-not-a-real-secret',
        REFERRAL_HASH_SALT: 'pr7b-test-referral-salt-not-a-real-secret',
      },
    },
  );
  const parsed = JSON.parse(stdout.trim().split('\n').at(-1)!);
  if (args[0] === 'content') {
    const seed = z
      .object({ workspace_id: z.uuid(), project_id: z.uuid(), crawl_id: z.uuid() })
      .parse(parsed);
    const db = testDatabase();
    try {
      const rows = await db
        .selectFrom('site_page_analyses as a')
        .innerJoin('site_fetch_artifacts as f', 'f.id', 'a.artifact_id')
        .select(['f.id', 'f.final_url'])
        .where('a.workspace_id', '=', seed.workspace_id)
        .where('a.project_id', '=', seed.project_id)
        .where('a.crawl_id', '=', seed.crawl_id)
        .execute();
      const names = ['Garden soil guide', 'Soil testing kit', 'Compost for healthy soil'];
      for (const [index, row] of rows.entries()) {
        const name = names[index % names.length]!;
        const facts = extractPageFacts(
          Buffer.from(
            `<html><title>${name} | Acme</title><main><h1>${name}</h1><p>Use a soil testing kit to understand nutrient levels before planting.</p><p>Add compost to improve moisture retention and support a thriving garden.</p></main></html>`,
          ),
          { finalUrl: row.final_url, contentType: 'text/html', statusCode: 200 },
          factSettings({}),
        );
        await db
          .updateTable('site_fetch_artifacts')
          .set({ normalized_facts: JSON.stringify(facts) })
          .where('id', '=', row.id)
          .where('workspace_id', '=', seed.workspace_id)
          .execute();
      }
    } finally {
      await db.destroy();
    }
  }
  return parsed as T;
}

export type ActionSeed = {
  user_id: string;
  workspace_id: string;
  project_id: string;
  audit_id: string;
  crawl_id: string;
  prompt0_id: string;
  prompt1_id: string;
  metric_snapshot_id: string;
  actions: Record<string, string>;
  members: Record<string, string>;
};
