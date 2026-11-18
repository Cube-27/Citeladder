/**
 * The topic dimension (AV-5): finalization groups a run's answers by the
 * topic each prompt had when the run froze it, so refiling or renaming a
 * topic later never moves past answers, and every topic-filtered read serves
 * those frozen groups inside the reader's workspace.
 */
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.ts';
import { finalizedRuns } from './finalized-runs.ts';
import { prompt, topic } from './prompt-fixtures.ts';
import { sessionToken, testConfig, testDatabase } from './support.ts';
import { VisibilityFixtures, type Tenant } from './visibility-fixtures.ts';

const config = testConfig(),
  db = testDatabase(config),
  app = createApp(config, db),
  fixtures = new VisibilityFixtures(db),
  { tenant, finalizedRun, cleanup } = finalizedRuns(db, fixtures);
afterEach(cleanup);
afterAll(async () => {
  await db.destroy();
});

async function read(t: Tenant, projectId: string, path: string) {
  const response = await app.request(`/api/v1/projects/${projectId}/visibility${path}`, {
    headers: {
      cookie: `${config.session.cookieName}=${await sessionToken({ sub: t.userId, ver: 0 })}`,
    },
  });
  const json = (await response.json()) as Record<string, unknown> & {
    error?: { code?: string };
  };
  return { status: response.status, json };
}

/**
 * Run 1 asks the road prompt under Pricing and the trail prompt under
 * Security. Pricing is then renamed and the trail prompt refiled to it, and
 * run 2 asks both under the renamed Pricing. Onboarding is never asked. The
 * fixture's project asks each prompt three times per run.
 */
async function refiledHistory() {
  const t = await tenant();
  const pricing = await topic(db, t.projectId, 'Pricing');
  const security = await topic(db, t.projectId, 'Security');
  const onboarding = await topic(db, t.projectId, 'Onboarding');
  await db.updateTable('prompts').set({ topic_id: pricing }).where('id', '=', t.promptId).execute();
  const trail = await prompt(db, t.setId, 'Which trail shoes grip mud?', { topicId: security });
  const first = await finalizedRun(t, ['https://review.example/a']);
  await db
    .updateTable('topics')
    .set({ name: 'Pricing & plans' })
    .where('id', '=', pricing)
    .execute();
  await db.updateTable('prompts').set({ topic_id: pricing }).where('id', '=', trail).execute();
  const second = await finalizedRun(t, ['https://review.example/a']);
  return { t, pricing, security, onboarding, first, second };
}

// Every answer names the brand first, so it wins each one (AV-7).
const measured = {
  visibility_rate: 1,
  share_of_voice: 1,
  rank: 1,
  ranked_brands: 1,
  win_count: 9,
  win_answers: 9,
  win_rate: 1,
};

describe('topic dimension', () => {
  it('groups answers by the frozen topic, so refiling and renaming never move a run', async () => {
    const { t, pricing, security, onboarding } = await refiledHistory();
    const range = await read(t, t.projectId, '/topics?selection_mode=range');
    expect(range.status).toBe(200);
    expect(range.json.items).toMatchObject([
      { kind: 'not_run', topic_id: onboarding, name: 'Onboarding', renamed_from: [] },
      {
        kind: 'measured',
        topic_id: pricing,
        name: 'Pricing & plans',
        renamed_from: ['Pricing'],
        answers: 9,
        ...measured,
      },
      { kind: 'measured', topic_id: security, name: 'Security', renamed_from: [], answers: 3 },
    ]);
    // The latest run froze only the new name and asked nothing under Security.
    const latest = await read(t, t.projectId, '/topics');
    expect(latest.json.items).toMatchObject([
      { kind: 'not_run', topic_id: onboarding },
      { kind: 'measured', topic_id: pricing, renamed_from: [], answers: 6 },
      { kind: 'not_run', topic_id: security, renamed_from: [] },
    ]);
  });

  it('filters the dashboard, trend and Sources reads by the frozen topic', async () => {
    const { t, pricing, security, first, second } = await refiledHistory();
    const dashboard = await read(t, t.projectId, `?topic=${pricing}`);
    expect([dashboard.status, dashboard.json.total_completed]).toEqual([200, 6]);
    const unasked = await read(t, t.projectId, `?topic=${security}`);
    expect([unasked.status, unasked.json.error?.code]).toEqual([404, 'visibility_not_measured']);

    const trend = await read(t, t.projectId, `/trends?granularity=run&topic=${security}`);
    expect((trend.json as unknown as { audit_id: string }[]).map((p) => p.audit_id)).toEqual([
      first,
    ]);

    const runs = `audit_ids=${first}&audit_ids=${second}`;
    const responses = async (filter: string) =>
      (await read(t, t.projectId, `/sources?${runs}${filter}`)).json.responses;
    expect([
      await responses(''),
      await responses(`&topic=${pricing}`),
      await responses(`&topic=${security}`),
    ]).toEqual([12, 9, 3]);
  });

  it("reads only the reader's workspace, whatever topic it names", async () => {
    const { t, pricing } = await refiledHistory();
    const other = await tenant();
    const foreignTopic = await topic(db, other.projectId, 'Pricing');
    expect((await read(other, t.projectId, '/topics')).status).toBe(404);
    expect((await read(other, t.projectId, `/trends?topic=${pricing}`)).status).toBe(404);
    // Another workspace's topic groups none of this project's answers.
    const trend = await read(t, t.projectId, `/trends?topic=${foreignTopic}`);
    expect([trend.status, trend.json]).toEqual([200, []]);
    expect((await read(t, t.projectId, `/trends?topic=${pricing}`)).json).toHaveLength(2);
  });
});
