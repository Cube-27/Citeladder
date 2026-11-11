import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { pruneSecurityEvents } from '../src/abuse/usage.ts';
import { testConfig, testDatabase } from './support.ts';

const db = testDatabase(testConfig());
const actor = randomUUID();
// The clock is fixed years in the past so the cutoff never reaches rows other
// test files write at the real time on the shared database.
const now = new Date('2020-01-31T00:00:00Z');
const days = (n: number) => new Date(now.getTime() - n * 86_400_000);

async function record(occurredAt: Date) {
  const id = randomUUID();
  await db
    .insertInto('security_events')
    .values({
      id,
      event: 'auth.login',
      actor_id: actor,
      workspace_id: null,
      target_id: null,
      occurred_at: occurredAt,
    })
    .execute();
  return id;
}
const remaining = async () =>
  (await db.selectFrom('security_events').select('id').where('actor_id', '=', actor).execute())
    .map((row) => row.id)
    .sort();

afterAll(async () => {
  await db.deleteFrom('security_events').where('actor_id', '=', actor).execute();
  await db.destroy();
});

it('deletes events older than the retention period in batches and keeps newer ones', async () => {
  await record(days(45));
  await record(days(40));
  await record(days(31));
  const recent = await record(days(29));
  const today = await record(now);

  expect(await pruneSecurityEvents(db, now, 30, 2)).toBe(2);
  expect(await remaining()).toHaveLength(3);
  expect(await pruneSecurityEvents(db, now, 30, 2)).toBe(1);
  expect(await pruneSecurityEvents(db, now, 30, 2)).toBe(0);
  expect(await remaining()).toEqual([recent, today].sort());
});

it('deletes nothing once admission has closed', async () => {
  const old = await record(days(60));
  expect(await pruneSecurityEvents(db, now, 30, 10, () => false)).toBe(0);
  expect(await remaining()).toContain(old);
  expect(await pruneSecurityEvents(db, now, 30, 10)).toBe(1);
});
