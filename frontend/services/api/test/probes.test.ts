import { randomUUID } from 'node:crypto';

import { sql } from 'kysely';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { readAgentContext } from '../src/agent/context-adapter.ts';
import { sourceUrl } from '../src/mcp/evidence-analytics.ts';
import { auditRuntime } from '../src/audits/config.ts';
import { settlePromptRun } from '../src/audits/prompt-runs.ts';
import { createRepairAudit } from '../src/audits/repair.ts';
import { policy } from '../src/config.ts';
import { mergeCategories } from '../src/perception/category-merge.ts';
import { enqueueProbeLabelling } from '../src/probes/launch-end.ts';
import { probeMarket } from '../src/probes/market.ts';
import { mergeGroups, renameGroup } from '../src/probes/objection-groups.ts';
import { probeObjections } from '../src/probes/objections.ts';
import { cancelProbe } from '../src/probes/cancel.ts';
import { runProbe } from '../src/probes/plan.ts';
import { setProbeSchedule } from '../src/probes/schedule.ts';
import { probeStatus } from '../src/probes/status.ts';
import { addMarket } from '../src/projects/markets.ts';
import { createTheme, deleteTheme } from '../src/projects/themes.ts';
import { connectClaude, managedPlan } from './audit-fixtures.ts';
import { billingAccount, grant } from './prompt-fixtures.ts';
import { first, labeller, probeFixtures, type Tenant } from './probe-fixtures.ts';
import { asOwner, testDatabase } from './support.ts';
import { VisibilityFixtures } from './visibility-fixtures.ts';

const db = testDatabase();
const fixtures = new VisibilityFixtures(db);
const { probeTenant, launch, ended, answered, label } = probeFixtures(db, fixtures);
const runtime = auditRuntime({});
const LABEL = policy.probes.label_credits;
afterEach(() => fixtures.cleanup());
afterAll(() => db.destroy());

const ledger = (workspaceId: string) =>
  db
    .selectFrom('consumable_ledger')
    .select(['capability_key', 'entry_kind', 'units'])
    .where('workspace_id', '=', workspaceId)
    .where('subject_kind', '=', 'audit')
    .orderBy('capability_key')
    .orderBy('entry_kind')
    .execute();

describe('probe admission', () => {
  it("freezes the brand and theme questions, three asks each on probe engines, holding only labelling credits on the customer's key", async () => {
    const { t, themeId } = await probeTenant();
    const [auditId] = await launch(t);
    const snapshots = await db
      .selectFrom('audit_prompt_snapshots')
      .select(['prompt_id', 'text', 'cohort', 'generation_evidence'])
      .where('audit_id', '=', auditId)
      .orderBy('prompt_index')
      .execute();
    expect(snapshots.map((row) => [row.prompt_id, row.text, row.cohort])).toEqual([
      [null, 'What is Acme Running known for?', 'probe'],
      [null, 'Why might someone not choose Acme Running?', 'probe'],
      [
        null,
        expect.stringMatching(/^Which .+ brands in United States are best known for comfort\?$/u),
        'probe',
      ],
    ]);
    expect(snapshots[2]!.generation_evidence).toEqual({
      probe: { question: 'theme', theme_id: themeId, theme_name: 'Comfort' },
    });
    const tasks = await db
      .selectFrom('audit_tasks')
      .select(['logical_engine'])
      .where('audit_id', '=', auditId)
      .execute();
    expect(tasks).toHaveLength(9);
    expect(new Set(tasks.map((task) => task.logical_engine))).toEqual(new Set(['chatgpt']));
    const holds = await ledger(t.workspaceId);
    expect(holds.every((row) => row.capability_key === 'ai_credits')).toBe(true);
    expect(holds.reduce((sum, row) => sum + Number(row.units), 0)).toBe(9 * LABEL);
  });

  it('refuses a probe its AI credits cannot cover with ai_credits_exhausted, queuing nothing', async () => {
    const { t } = await probeTenant(9 * LABEL - 1);
    await expect(launch(t)).rejects.toMatchObject({ status: 403, code: 'ai_credits_exhausted' });
    const audits = await db
      .selectFrom('audits')
      .select('id')
      .where('workspace_id', '=', t.workspaceId)
      .execute();
    expect(audits).toEqual([]);
  });

  it("spends a recorded answer's whole hold and releases a failed one's", async () => {
    const { t } = await probeTenant();
    const [auditId] = await launch(t);
    const [ok, failed] = await db
      .selectFrom('audit_tasks')
      .selectAll()
      .where('audit_id', '=', auditId)
      .orderBy('randomized_position')
      .limit(2)
      .execute();
    await db.transaction().execute(async (trx) => {
      await settlePromptRun(trx, ok!, true, new Date());
      await settlePromptRun(trx, failed!, false, new Date());
    });
    const debits = (await ledger(t.workspaceId)).filter((row) => row.entry_kind === 'debit');
    expect(debits.map((row) => Number(row.units))).toEqual([LABEL]);
  });

  it('quotes only the engine-market pairs that run, then launches every market holding exactly the quote', async () => {
    const { t } = await probeTenant(1_000_000);
    await grant(db, await billingAccount(db, t.workspaceId), { key: 'market_slots', value: 1 });
    await addMarket(db, t, { country_code: 'BR', language_code: 'pt', label: '' });
    const perMarket = 3 * policy.probes.repetitions;
    const { quote } = await probeStatus(db, t, runtime);
    expect([quote.markets.length, quote.answers]).toEqual([2, 2 * perMarket]);
    const ids = await runProbe(db, t, { fingerprint: quote.fingerprint }, runtime);
    const held = (await ledger(t.workspaceId)).filter((row) => row.entry_kind === 'reservation');
    expect([ids.length, held.reduce((sum, row) => sum + Number(row.units), 0)]).toEqual([
      2,
      quote.credits,
    ]);
    expect((await probeStatus(db, t, runtime)).quote.balance).toBe(quote.balance! - quote.credits);
    await managedPlan(db, t.workspaceId);
    const managed = (await probeStatus(db, t, runtime)).quote;
    expect(managed.answers).toBe((5 + 3) * perMarket);
  });

  it('asks only the chosen engines at their own quote, and cancelling the run releases its hold', async () => {
    const { t } = await probeTenant(1_000_000);
    await managedPlan(db, t.workspaceId);
    const all = (await probeStatus(db, t, runtime)).quote;
    const engines = all.available_engines.slice(0, 2);
    const { quote } = await probeStatus(db, t, runtime, { engines });
    expect([all.engines, quote.engines, quote.available_engines]).toEqual([
      all.available_engines,
      engines,
      all.available_engines,
    ]);
    expect(quote.answers).toBe((all.answers / all.engines.length) * 2);
    expect(quote.credits).toBeLessThan(all.credits);
    await expect(
      runProbe(db, t, { fingerprint: all.fingerprint, engines }, runtime),
    ).rejects.toMatchObject({ status: 409, code: 'probe_quote_changed' });
    const once = (await probeStatus(db, t, runtime, { engines, repetitions: 1 })).quote;
    const per = policy.probes.repetitions;
    expect([once.repetitions, once.answers, once.credits]).toEqual([
      1,
      quote.answers / per,
      quote.credits / per,
    ]);
    expect(once.fingerprint).not.toBe(quote.fingerprint);
    await expect(
      runProbe(db, t, { fingerprint: quote.fingerprint, engines, repetitions: 1 }, runtime),
    ).rejects.toMatchObject({ status: 409, code: 'probe_quote_changed' });
    await expect(
      probeStatus(db, t, runtime, { engines: ['unknown-engine'] }),
    ).rejects.toMatchObject({ status: 422, code: 'probe_engines_unavailable' });
    await expect(
      probeStatus(db, t, runtime, { repetitions: policy.probes.max_repetitions + 1 }),
    ).rejects.toMatchObject({ status: 422, code: 'probe_repetitions_invalid' });
    await expect(cancelProbe(db, t)).rejects.toMatchObject({ code: 'probe_not_running' });
    const { t: own } = await probeTenant(1_000_000);
    const before = (await probeStatus(db, own, runtime, { repetitions: 1 })).quote;
    const [launched] = await runProbe(
      db,
      own,
      { fingerprint: before.fingerprint, engines: before.engines, repetitions: 1 },
      runtime,
    );
    const running = await probeStatus(db, own, runtime);
    const audit = await db
      .selectFrom('audits')
      .select('repetitions')
      .where('id', '=', launched!)
      .executeTakeFirstOrThrow();
    expect([
      running.latest!.state,
      running.latest!.planned,
      audit.repetitions,
      running.quote.balance,
    ]).toEqual(['running', before.answers, 1, before.balance! - before.credits]);
    await cancelProbe(db, own);
    const cancelled = await probeStatus(db, own, runtime);
    expect([cancelled.latest!.state, cancelled.quote.balance]).toEqual([
      'cancelled',
      before.balance,
    ]);
  });

  it('asks Claude to search the web for the objection question and every other ask as frozen', async () => {
    const { t } = await probeTenant(1_000_000);
    await connectClaude(db, t);
    const { quote } = await probeStatus(db, t, runtime, { engines: ['claude', 'chatgpt'] });
    const [auditId] = await runProbe(
      db,
      t,
      { fingerprint: quote.fingerprint, engines: ['claude', 'chatgpt'] },
      runtime,
    );
    const asked = await db
      .selectFrom('audit_tasks')
      .select(['logical_engine', 'prompt_index', 'prompt_text'])
      .where('audit_id', '=', auditId!)
      .where('prompt_index', '<', 2)
      .where('repetition', '=', 1)
      .orderBy('prompt_index')
      .orderBy('logical_engine')
      .execute();
    expect(asked.map((task) => [task.prompt_index, task.logical_engine, task.prompt_text])).toEqual(
      [
        [0, 'chatgpt', 'What is Acme Running known for?'],
        [0, 'claude', 'What is Acme Running known for?'],
        [1, 'chatgpt', 'Why might someone not choose Acme Running?'],
        [
          1,
          'claude',
          'Use web search to answer this question: Why might someone not choose Acme Running?',
        ],
      ],
    );
  });

  it('refuses probe_quote_changed, launching nothing, when the probe changed after its quote', async () => {
    const { t } = await probeTenant();
    const { quote } = await probeStatus(db, t, runtime);
    await createTheme(db, t, { name: 'Price' });
    await expect(
      runProbe(db, t, { fingerprint: quote.fingerprint }, runtime),
    ).rejects.toMatchObject({ status: 409, code: 'probe_quote_changed' });
    const audits = await db
      .selectFrom('audits')
      .select('id')
      .where('workspace_id', '=', t.workspaceId)
      .execute();
    expect(audits).toEqual([]);
  });

  it('blocks Run probe past the task limit in a market, and in a trial, refusing the launch', async () => {
    const { t } = await probeTenant();
    const limited = auditRuntime({ AUDIT_MAX_TASKS_PER_AUDIT: '9' });
    const quote = async () => (await probeStatus(db, t, limited)).quote;
    expect((await quote()).blocked).toBeNull();
    await createTheme(db, t, { name: 'Price' });
    const over = await quote();
    expect(over.blocked).toBe('task_limit');
    await expect(runProbe(db, t, { fingerprint: over.fingerprint }, limited)).rejects.toMatchObject(
      { status: 422 },
    );
    const account = await billingAccount(db, t.workspaceId);
    await asOwner((owner) =>
      owner
        .updateTable('account_grants')
        .set({ profile_key: policy.entitlements.public_trial.profile })
        .where('billing_account_id', '=', account)
        .where('key', '=', 'workspace_access')
        .execute(),
    );
    const trial = (await probeStatus(db, t, runtime)).quote;
    expect(trial.blocked).toBe('trial');
    await expect(
      runProbe(db, t, { fingerprint: trial.fingerprint }, runtime),
    ).rejects.toMatchObject({ status: 403, code: 'capability_not_granted' });
    const audits = await db
      .selectFrom('audits')
      .select('id')
      .where('workspace_id', '=', t.workspaceId)
      .execute();
    expect(audits).toEqual([]);
  });

  it('keeps one probe schedule per project on every managed probe engine, and Off removes it', async () => {
    const { t } = await probeTenant();
    const other = await probeTenant();
    await managedPlan(db, t.workspaceId);
    const schedules = (scope: { workspaceId: string; projectId: string }) =>
      db
        .selectFrom('audit_schedules')
        .select(['id', 'audit_scope', 'cadence', 'enabled', 'engines', 'repetitions'])
        .where('workspace_id', '=', scope.workspaceId)
        .where('project_id', '=', scope.projectId)
        .execute();
    const fingerprint = async (scope: Tenant) =>
      (await probeStatus(db, scope, runtime)).quote.fingerprint;
    await expect(
      setProbeSchedule(db, t, { cadence: 'weekly', fingerprint: 'stale' }, runtime),
    ).rejects.toMatchObject({ status: 409, code: 'probe_quote_changed' });
    await db.transaction().execute(async (launching) => {
      await launching
        .selectFrom('projects')
        .select('id')
        .where('id', '=', t.projectId)
        .forKeyShare()
        .execute();
      const shown = await fingerprint(t);
      await db.transaction().execute(async (trx) => {
        await sql`set local lock_timeout = '5s'`.execute(trx);
        await setProbeSchedule(trx, t, { cadence: 'weekly', fingerprint: shown }, runtime);
      });
    });
    await setProbeSchedule(
      db,
      other.t,
      { cadence: 'daily', fingerprint: await fingerprint(other.t) },
      runtime,
    );
    const [weekly] = await schedules(t);
    const twice = (await probeStatus(db, t, runtime, { repetitions: 2 })).quote.fingerprint;
    await setProbeSchedule(
      db,
      t,
      { cadence: 'daily', fingerprint: twice, repetitions: 2 },
      runtime,
    );
    expect(await schedules(t)).toEqual([
      {
        id: weekly?.id,
        audit_scope: 'probe',
        cadence: 'daily',
        enabled: true,
        engines: policy.probes.engines,
        repetitions: 2,
      },
    ]);
    await setProbeSchedule(db, t, { cadence: null }, runtime);
    expect(await schedules(t)).toEqual([]);
    expect((await schedules(other.t)).map((row) => row.cadence)).toEqual(['daily']);
  });
});

const launchOf = async (auditId: string) =>
  (
    await db
      .selectFrom('audits')
      .select('launch_id')
      .where('id', '=', auditId)
      .executeTakeFirstOrThrow()
  ).launch_id!;

describe('probe labelling and reads', () => {
  it('still labels a probe whose theme was deleted after admission, dropping that theme', async () => {
    const { t, themeId } = await probeTenant();
    const [auditId] = await launch(t);
    await answered(t, auditId);
    await deleteTheme(db, { ...t, themeId });
    await label(t, labeller(first));
    const labelling = await db
      .selectFrom('probe_labellings')
      .select('outcome')
      .where('launch_id', '=', await launchOf(auditId))
      .executeTakeFirstOrThrow();
    const market = await probeMarket(db, t);
    expect([labelling.outcome, market.state === 'value' ? market.themes : null]).toEqual([
      'labelled',
      [],
    ]);
  });

  it('labels a probe once, scores Market and Objections, then maps the next probe onto the same groups', async () => {
    const { t, themeId, rivalId } = await probeTenant();
    const [firstId] = await launch(t);
    await answered(t, firstId);
    await label(t, labeller(first));
    const market = await probeMarket(db, t);
    if (market.state !== 'value') throw new Error('expected a labelled probe');
    expect(market.known_for.map(({ theme, score }) => [theme, score])).toEqual([
      ['Comfort', 67],
      ['Other', 30],
    ]);
    expect(market.themes).toEqual([
      {
        theme_id: themeId,
        theme: 'Comfort',
        entities: [
          { kind: 'brand', id: null, name: 'Acme Running', score: 60, named: true },
          { kind: 'competitor', id: rivalId, name: 'Rival Shoes', score: 97, named: true },
        ],
        rank: 2,
        of: 2,
        leader: { kind: 'competitor', id: rivalId, name: 'Rival Shoes', score: 97, named: true },
        gap: 37,
        sources: 0,
        pages: [],
      },
    ]);
    expect([market.known_for_answers, market.language_code]).toEqual([3, 'en']);
    expect(market.engines).toEqual([
      {
        engine: 'chatgpt',
        answered: true,
        top_themes: [
          { theme_id: themeId, theme: 'Comfort' },
          { theme_id: null, theme: 'Other' },
        ],
        rank_in_top_theme: { kind: 'rank', rank: 2 },
      },
    ]);

    const [secondId] = await launch(t);
    await answered(t, secondId);
    await label(
      t,
      labeller({
        ...first,
        objection: {
          answers: [1, 2, 3].map((answer) => ({
            answer,
            reasons: [
              { group: 'TOO EXPENSIVE', quote: 'pricey' },
              { group: 'Slow delivery', quote: 'late' },
            ],
          })),
        },
      }),
    );
    await enqueueProbeLabelling(db, {
      workspaceId: t.workspaceId,
      projectId: t.projectId,
      launchId: await launchOf(secondId),
    });
    const objections = await probeObjections(db, t);
    if (objections.state !== 'value') throw new Error('expected a labelled probe');
    expect(
      objections.groups.map(({ name, score, engines, history, sources }) => [
        name,
        score,
        engines,
        history,
        sources,
      ]),
    ).toEqual([
      ['Too expensive', 100, ['chatgpt'], [97, 100], 0],
      ['Slow delivery', 90, ['chatgpt'], [0, 90], 0],
      ['Fit runs small', 0, [], [63, 0], null],
    ]);
    expect([objections.average, objections.answered_by]).toEqual([95, ['chatgpt']]);
    expect(objections.groups.map(({ quotes }) => quotes.map(({ text }) => text))).toEqual([
      ['pricey', 'pricey', 'pricey'],
      ['late', 'late', 'late'],
      [],
    ]);
    const [quoted] = objections.groups[0]?.quotes ?? [];
    expect([quoted?.run_id, quoted?.logical_engine]).toEqual([secondId, 'chatgpt']);
    expect(objections.question).toEqual({
      text: 'Why might someone not choose Acme Running?',
      run_id: secondId,
      execution_id: expect.any(String),
    });
    expect(objections.groups[0]?.quotes.map((quote) => quote.execution_id)).toContain(
      objections.question?.execution_id,
    );
    const labellings = await db
      .selectFrom('probe_labellings')
      .select('outcome')
      .where('workspace_id', '=', t.workspaceId)
      .execute();
    expect(labellings).toEqual([{ outcome: 'labelled' }, { outcome: 'labelled' }]);
  });

  it('breaks a score tie by how many answers raised the objection first', async () => {
    const { t } = await probeTenant();
    const [auditId] = await launch(t);
    await answered(t, auditId);
    const reasons = (...groups: string[]) => groups.map((group) => ({ group, quote: '' }));
    await label(
      t,
      labeller({
        ...first,
        objection: {
          answers: [
            { answer: 1, reasons: reasons('Too expensive', 'Slow delivery') },
            { answer: 2, reasons: reasons('Slow delivery', 'Fit runs small', 'Too expensive') },
            { answer: 3, reasons: reasons('Too expensive', 'Slow delivery') },
          ],
        },
      }),
    );
    const objections = await probeObjections(db, t);
    if (objections.state !== 'value') throw new Error('expected a labelled probe');
    expect(objections.groups.map(({ name, score }) => [name, score])).toEqual([
      ['Too expensive', 93],
      ['Slow delivery', 93],
      ['Fit runs small', 30],
    ]);
  });

  it('merges and renames groups and themes inside their project only', async () => {
    const owner = await probeTenant();
    const other = await probeTenant();
    const [auditId] = await launch(owner.t);
    await answered(owner.t, auditId);
    await label(owner.t, labeller(first));
    const groups = await db
      .selectFrom('probe_objection_groups')
      .select(['id', 'name'])
      .where('project_id', '=', owner.t.projectId)
      .orderBy('name')
      .execute();
    const [fit, price] = groups;
    expect(
      await probeObjections(db, { workspaceId: other.t.workspaceId, projectId: owner.t.projectId }),
    ).toEqual({
      state: 'none',
    });
    await expect(
      renameGroup(
        db,
        { workspaceId: other.t.workspaceId, projectId: owner.t.projectId, groupId: fit!.id },
        { name: 'Taken' },
      ),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      mergeGroups(db, { ...other.t, groupId: fit!.id, intoId: price!.id }),
    ).rejects.toMatchObject({ status: 404 });
    await mergeGroups(db, { ...owner.t, groupId: fit!.id, intoId: price!.id });
    const objections = await probeObjections(db, owner.t);
    if (objections.state !== 'value') throw new Error('expected a labelled probe');
    expect(objections.groups.map(({ name, score }) => [name, score])).toEqual([
      ['Too expensive', 100],
    ]);

    const sibling = { ...owner.t, projectId: await fixtures.project(owner.t.workspaceId) };
    const elsewhere = await createTheme(db, sibling, { name: 'Fit' });
    const modelFit = randomUUID();
    await db
      .insertInto('project_themes')
      .values({
        id: modelFit,
        workspace_id: owner.t.workspaceId,
        project_id: owner.t.projectId,
        name: 'Fit',
        position: 1,
        source: 'model',
        created_at: new Date(),
        updated_at: new Date(),
      })
      .execute();
    const filed = (themeId: string) =>
      db
        .selectFrom('probe_answer_items')
        .select(({ fn }) => fn.countAll<string>().as('n'))
        .where('workspace_id', '=', owner.t.workspaceId)
        .where('theme_id', '=', themeId)
        .executeTakeFirstOrThrow()
        .then((row) => Number(row.n));
    const comfort = await filed(owner.themeId);
    await expect(
      mergeCategories(db, { ...owner.t, themeId: owner.themeId, intoId: elsewhere.id }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      mergeCategories(db, { ...owner.t, themeId: owner.themeId, intoId: owner.themeId }),
    ).rejects.toMatchObject({ status: 400 });
    expect(
      await mergeCategories(db, { ...owner.t, themeId: owner.themeId, intoId: modelFit }),
    ).toEqual({ id: modelFit, name: 'Fit', source: 'user' });
    expect([comfort > 0, await filed(owner.themeId), await filed(modelFit)]).toEqual([
      true,
      0,
      comfort,
    ]);
  });

  it('labels a launch once, after its last market ends, reading only the markets that answered', async () => {
    const { t } = await probeTenant(1_000_000);
    await grant(db, await billingAccount(db, t.workspaceId), { key: 'market_slots', value: 1 });
    await addMarket(db, t, { country_code: 'BR', language_code: 'pt', label: '' });
    const { quote } = await probeStatus(db, t, runtime);
    const [usId, brId] = await runProbe(db, t, { fingerprint: quote.fingerprint }, runtime);
    const progress = async () => {
      const run = (await probeStatus(db, t, runtime)).latest!;
      return [run.state, run.answers, run.failed, run.planned];
    };
    expect(await progress()).toEqual(['running', 0, 0, 18]);
    await db
      .updateTable('audits')
      .set({ failed_count: 2 })
      .where('workspace_id', '=', t.workspaceId)
      .where('id', '=', brId!)
      .execute();
    const queued = () =>
      db
        .selectFrom('analytics_tasks')
        .select('payload')
        .where('workspace_id', '=', t.workspaceId)
        .where('task_kind', '=', policy.probes.task_kind)
        .execute();
    await answered(t, usId!);
    expect(await queued()).toEqual([]);
    expect(await progress()).toEqual(['running', 9, 2, 18]);
    await ended(t, brId!, 'cancelled');
    expect(await queued()).toEqual([{ payload: { launch_id: await launchOf(usId!) } }]);
    expect(await progress()).toEqual(['labelling', 9, 2, 18]);
    const sent: string[] = [];
    await label(
      t,
      labeller(first, async (body) => {
        sent.push(body);
      }),
    );
    expect(sent.filter((body) => body.includes('not choose'))).toHaveLength(1);
    expect(await progress()).toEqual(['ready', 9, 2, 18]);
    const market = await probeMarket(db, t);
    if (market.state !== 'value') throw new Error('expected a labelled probe');
    expect(market.probe.markets.map((row) => row.country_code)).toEqual(['US']);
  });

  it('labels each market in its own calls, a later market seeing the groups an earlier one named', async () => {
    const { t } = await probeTenant(1_000_000);
    await grant(db, await billingAccount(db, t.workspaceId), { key: 'market_slots', value: 1 });
    await addMarket(db, t, { country_code: 'BR', language_code: 'pt', label: '' });
    const { quote } = await probeStatus(db, t, runtime);
    const [usId, brId] = await runProbe(db, t, { fingerprint: quote.fingerprint }, runtime);
    await answered(t, usId!);
    await answered(t, brId!);
    const sent: string[] = [];
    await label(
      t,
      labeller(first, async (body) => {
        sent.push(body);
      }),
    );
    const objections = sent.filter((body) => body.includes('not choose'));
    expect(objections.map((body) => body.includes('(none yet)'))).toEqual([true, false]);
    const market = await probeMarket(db, t);
    if (market.state !== 'value') throw new Error('expected a labelled probe');
    expect(new Set(market.probe.markets.map((row) => row.country_code))).toEqual(
      new Set(['BR', 'US']),
    );
    expect(market.language_code).toBe('');
  });

  it('keeps a probe labelled when a theme and a group are deleted while its calls run', async () => {
    const { t, themeId } = await probeTenant();
    const [firstId] = await launch(t);
    await answered(t, firstId!);
    await label(t, labeller(first));
    const fit = await db
      .selectFrom('probe_objection_groups')
      .select('id')
      .where('project_id', '=', t.projectId)
      .where('name', '=', 'Fit runs small')
      .executeTakeFirstOrThrow();
    const [secondId] = await launch(t);
    await answered(t, secondId!);
    let deleted = false;
    await label(
      t,
      labeller(first, async () => {
        if (deleted) return;
        deleted = true;
        await deleteTheme(db, { ...t, themeId });
        await db.deleteFrom('probe_objection_groups').where('id', '=', fit.id).execute();
      }),
    );
    const labellings = await db
      .selectFrom('probe_labellings')
      .select('outcome')
      .where('workspace_id', '=', t.workspaceId)
      .execute();
    expect(labellings).toEqual([{ outcome: 'labelled' }, { outcome: 'labelled' }]);
    const market = await probeMarket(db, t);
    const objections = await probeObjections(db, t);
    expect([
      market.state === 'value' ? market.known_for.map(({ theme }) => theme) : null,
      objections.state === 'value' ? objections.groups.map(({ name }) => name) : null,
    ]).toEqual([['Other'], ['Too expensive']]);
  });

  it('leaves a probe that answered nothing unlabelled, so the reads keep the last labelled one', async () => {
    const { t } = await probeTenant();
    const [firstId] = await launch(t);
    await answered(t, firstId!);
    await label(t, labeller(first));
    const [failedId] = await launch(t);
    await ended(t, failedId!, 'cancelled');
    await label(t, labeller(first));
    const market = await probeMarket(db, t);
    expect(market.state === 'value' ? market.probe.launch_id : null).toBe(await launchOf(firstId!));
  });

  it('refuses to repair a probe run: a new probe is its retry', async () => {
    const { t } = await probeTenant();
    const [auditId] = await launch(t);
    await ended(t, auditId!, 'cancelled');
    await expect(createRepairAudit(db, t.workspaceId, auditId!, {}, runtime)).rejects.toMatchObject(
      { status: 409 },
    );
  });

  it("lists the pages cited per Market theme, seeds an Agent chat with one objection's cited sources and reads each by its listed URL, in its workspace only", async () => {
    const owner = await probeTenant();
    const other = await probeTenant();
    const [auditId] = await launch(owner.t);
    await answered(owner.t, auditId);
    await label(owner.t, labeller(first));
    const listed = 'https://reviews.test/acme?utm_source=openai';
    await fixtures.sourcePage(owner.t, { urlHash: 'acme-review', url: listed });
    const tasks = await db
      .selectFrom('audit_tasks')
      .select('id')
      .where('audit_id', '=', auditId)
      .execute();
    for (const task of tasks)
      await fixtures.analysis(
        owner.t,
        {
          auditId,
          analysis: { citations: [{ url: listed, title: 'Acme review', urlHash: 'acme-review' }] },
        },
        task.id,
        'chatgpt',
        'test',
      );
    const market = await probeMarket(db, owner.t);
    expect(
      market.state === 'value'
        ? market.themes.map(({ theme, sources, pages }) => ({ theme, sources, pages }))
        : null,
    ).toEqual([
      {
        theme: 'Comfort',
        sources: 1,
        pages: [
          {
            url: listed,
            title: 'Acme review',
            domain: 'reviews.test',
            classification: 'third_party',
            page_format: 'article',
            standing: 'not_read',
            citations: 3,
          },
        ],
      },
    ]);
    const fit = await db
      .selectFrom('probe_objection_groups')
      .select('id')
      .where('project_id', '=', owner.t.projectId)
      .where('name', '=', 'Fit runs small')
      .executeTakeFirstOrThrow();
    const context = await readAgentContext(
      db,
      owner.t,
      { objection_group_id: fit.id },
      'Help me answer it',
    );
    expect(context.sections?.objection).toMatchObject({
      name: 'Fit runs small',
      score: 63,
      engines: ['chatgpt'],
      sources: 1,
      pages: [
        {
          url: listed,
          title: 'Acme review',
          classification: 'third_party',
          citations: 2,
        },
      ],
    });
    await expect(
      readAgentContext(db, other.t, { objection_group_id: fit.id }, 'Help me answer it'),
    ).rejects.toMatchObject({ code: 'agent_context_unavailable' });
    const read = (t: Tenant, url: string) =>
      sourceUrl(
        { db, scope: { workspaceId: t.workspaceId, projectId: t.projectId }, origin: '' },
        { url, cohort: 'core' },
      );
    const cited = await read(owner.t, listed);
    expect(cited).toMatchObject({
      state: 'available',
      url: listed,
      title: 'Acme review',
      cited_by: 'market_probe',
      probe: { answers: 9, engines: [{ logical_engine: 'chatgpt', answers: 9 }] },
      page: { state: 'inspected', page_format: 'article' },
    });
    expect(cited).not.toHaveProperty('retrievals');
    const refused = { state: 'unavailable', reason: 'url_not_cited_in_selection' };
    expect(await read(owner.t, 'https://reviews.test/acme')).toMatchObject(refused);
    expect(await read(other.t, listed)).toMatchObject(refused);
  });
});
