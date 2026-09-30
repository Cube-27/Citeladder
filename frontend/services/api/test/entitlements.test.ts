import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import { admitPrompts } from '../src/entitlements/occupancy.ts';
import {
  entitlementChangeAt,
  foldEntitlement,
  type GrantRow,
} from '../src/entitlements/resolve.ts';
import { ApiError } from '../src/errors.ts';
import { billingAccount, grant, prompt, promptSet } from './prompt-fixtures.ts';
import { testDatabase } from './support.ts';
import { VisibilityFixtures } from './visibility-fixtures.ts';

const at = new Date('2026-09-01T00:00:00Z');
const day = 86_400_000;

function row(input: Partial<GrantRow> & { value: number }): GrantRow {
  return {
    id: randomUUID(),
    key: 'prompt_slots',
    source_kind: 'plan',
    valid_from: new Date(at.getTime() - day),
    valid_until: null,
    bundle_role: 'supplement',
    bundle_id: '',
    profile_priority: 0,
    ...input,
  };
}

describe('foldEntitlement', () => {
  it('expires projections at future grants, selected revocations and subscription boundaries', () => {
    const selected = row({
      value: 50,
      bundle_role: 'primary',
      bundle_id: 'pro',
      profile_priority: 10,
      valid_until: new Date(at.getTime() + 4 * day),
    });
    const ignored = row({
      value: 10,
      bundle_role: 'primary',
      bundle_id: 'free',
      valid_until: new Date(at.getTime() + 1),
    });
    const scheduled = row({ value: 5, valid_from: new Date(at.getTime() + day) });
    expect(entitlementChangeAt([selected, ignored, scheduled], [], null, at)).toEqual(
      scheduled.valid_from,
    );
    expect(
      entitlementChangeAt(
        [selected, ignored],
        [
          { grant_id: ignored.id, effective_from: new Date(at.getTime() + 1) },
          { grant_id: selected.id, effective_from: new Date(at.getTime() + 2 * day) },
        ],
        null,
        at,
      ),
    ).toEqual(new Date(at.getTime() + 2 * day));
    expect(entitlementChangeAt([selected], [], new Date(at.getTime() + day), at)).toEqual(
      new Date(at.getTime() + day),
    );
    expect(entitlementChangeAt([row({ value: 3 })], [], null, at)).toBeNull();
  });

  it('counts one primary bundle, the highest priority, plus every supplement', () => {
    const values = foldEntitlement(
      [
        row({ value: 10, bundle_role: 'primary', bundle_id: 'free', profile_priority: 0 }),
        row({ value: 50, bundle_role: 'primary', bundle_id: 'pro', profile_priority: 10 }),
        row({ value: 5, source_kind: 'override' }),
      ],
      [],
      null,
      at,
    );
    expect(values.get('prompt_slots')).toBe(55);
  });

  it('suspends add-ons without a base subscription end and caps them at it', () => {
    const addon = row({ value: 7, source_kind: 'addon' });
    expect(foldEntitlement([addon], [], null, at).has('prompt_slots')).toBe(false);
    expect(foldEntitlement([addon], [], new Date(at.getTime() + day), at).get('prompt_slots')).toBe(
      7,
    );
    expect(foldEntitlement([addon], [], new Date(at.getTime() - 1), at).has('prompt_slots')).toBe(
      false,
    );
  });

  it('drops revoked, expired and future grants and ORs flags', () => {
    const revoked = row({ value: 3 });
    const values = foldEntitlement(
      [
        revoked,
        row({ value: 4, valid_until: at }),
        row({ value: 9, valid_from: new Date(at.getTime() + 1) }),
        row({ key: 'agent', value: 0 }),
        row({ key: 'agent', value: 1 }),
      ],
      [{ grant_id: revoked.id, effective_from: at }],
      null,
      at,
    );
    expect(values.has('prompt_slots')).toBe(false);
    expect(values.get('agent')).toBe(1);
  });

  it('refuses the whole account when any grant is corrupt', () => {
    expect(() =>
      foldEntitlement([row({ value: 1 }), row({ key: 'nope', value: 1 })], [], null, at),
    ).toThrow();
    expect(() => foldEntitlement([row({ key: 'agent', value: 2 })], [], null, at)).toThrow();
  });
});

describe('admitPrompts', () => {
  const db = testDatabase();
  const fixtures = new VisibilityFixtures(db);
  afterAll(async () => {
    await fixtures.cleanup();
    await db.destroy();
  });

  async function tenant() {
    const t = await fixtures.tenant();
    return { ...t, setId: await promptSet(db, t.projectId) };
  }

  const denial = (fn: () => Promise<unknown>) =>
    fn().then(
      () => null,
      (error: unknown) =>
        error instanceof ApiError
          ? { status: error.status, code: error.code, details: error.details }
          : Promise.reject(error),
    );

  it('fails closed without a billing account and passes an unprovisioned one', async () => {
    const t = await tenant();
    expect(
      await denial(() => db.transaction().execute((trx) => admitPrompts(trx, t.workspaceId, 1))),
    ).toMatchObject({
      status: 403,
      code: 'occupancy_unresolved',
    });
    await billingAccount(db, t.workspaceId);
    expect(
      await denial(() => db.transaction().execute((trx) => admitPrompts(trx, t.workspaceId, 1000))),
    ).toBeNull();
  });

  it('counts every prompt in the workspace against the allowance', async () => {
    const t = await tenant();
    const account = await billingAccount(db, t.workspaceId);
    await grant(db, account, { value: 3 });
    await prompt(db, t.setId, 'first acme prompt');
    await prompt(db, t.setId, 'archived acme prompt', { status: 'archived' });
    expect(
      await denial(() => db.transaction().execute((trx) => admitPrompts(trx, t.workspaceId, 1))),
    ).toBeNull();
    expect(
      await denial(() => db.transaction().execute((trx) => admitPrompts(trx, t.workspaceId, 2))),
    ).toEqual({
      status: 403,
      code: 'occupancy_limit_exceeded',
      details: { key: 'prompt_slots', allowance: 3, current: 2, requested: 2 },
    });
  });

  it('serializes concurrent writers so the grant is never exceeded', async () => {
    const t = await tenant();
    const account = await billingAccount(db, t.workspaceId);
    await grant(db, account, { value: 1 });
    const insert = (text: string) =>
      db.transaction().execute(async (trx) => {
        await admitPrompts(trx, t.workspaceId, 1);
        await prompt(trx, t.setId, text);
      });
    const results = await Promise.allSettled([insert('acme one'), insert('acme two')]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const count = await db
      .selectFrom('prompts')
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .where('prompt_set_id', '=', t.setId)
      .executeTakeFirstOrThrow();
    expect(Number(count.count)).toBe(1);
  });
});
