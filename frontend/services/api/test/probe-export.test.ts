import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.ts';
import { policy } from '../src/config.ts';
import { probeMarket } from '../src/probes/market.ts';
import { first, labeller, probeFixtures } from './probe-fixtures.ts';
import { sessionToken, testConfig, testDatabase } from './support.ts';
import { VisibilityFixtures } from './visibility-fixtures.ts';

const config = testConfig();
const db = testDatabase(config);
const app = createApp(config, db);
const fixtures = new VisibilityFixtures(db);
const { probeTenant, launch, answered, label } = probeFixtures(db, fixtures);
afterEach(() => fixtures.cleanup());
afterAll(() => db.destroy());

describe('probe source exports', () => {
  it('exports every cited page of every theme and objection with its full URL and standing, to members of its workspace only', async () => {
    const owner = await probeTenant();
    const other = await probeTenant();
    const [auditId] = await launch(owner.t);
    await answered(owner.t, auditId);
    await label(owner.t, labeller(first));
    const blocked = `https://blocked.test/${'a'.repeat(180)}.pdf?utm_source=openai`;
    const unread = 'https://unread.test/list';
    await fixtures.sourcePage(owner.t, {
      urlHash: 'hash-blocked',
      url: blocked,
      inspectionState: 'blocked',
    });
    await fixtures.sourcePage(owner.t, {
      urlHash: 'hash-unread',
      url: unread,
      pageFormat: 'listicle',
    });
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
          analysis: {
            citations: [
              { url: blocked, title: 'Budget Standards', urlHash: 'hash-blocked' },
              { url: unread, title: '', urlHash: 'hash-unread' },
            ],
          },
        },
        task.id,
        'chatgpt',
        'test',
      );
    const shown = policy.probes.max_sources_per_group;
    policy.probes.max_sources_per_group = 1;
    try {
      const market = await probeMarket(db, owner.t);
      expect(
        market.state === 'value' ? market.themes.map((row) => row.pages.length) : null,
      ).toEqual([1]);
      const download = async (view: string, userId: string, workspaceId: string) =>
        app.request(`/api/v1/projects/${owner.t.projectId}/probes/${view}/export`, {
          headers: {
            cookie: `${config.session.cookieName}=${await sessionToken({ sub: userId, ver: 0 })}`,
            'x-workspace-id': workspaceId,
          },
        });
      const themes = await download('market', owner.t.userId, owner.t.workspaceId);
      expect(themes.headers.get('content-disposition')).toBe(
        'attachment; filename="market-theme-sources.csv"',
      );
      expect(await themes.text()).toBe(
        'theme,position_score,page_title,url,page_type,source_type,mentions_you,citations\r\n' +
          `Comfort,60,Budget Standards,${blocked},Article,Third-party,Blocked,3\r\n` +
          `Comfort,60,unread.test,${unread},Listicle,Third-party,Not read,3\r\n`,
      );
      const objections = await download('objections', owner.t.userId, owner.t.workspaceId);
      expect(await objections.text()).toBe(
        'objection,position_score,page_title,url,page_type,source_type,mentions_you,citations\r\n' +
          `Too expensive,97,Budget Standards,${blocked},Article,Third-party,Blocked,3\r\n` +
          `Too expensive,97,unread.test,${unread},Listicle,Third-party,Not read,3\r\n` +
          `Fit runs small,63,Budget Standards,${blocked},Article,Third-party,Blocked,2\r\n` +
          `Fit runs small,63,unread.test,${unread},Listicle,Third-party,Not read,2\r\n`,
      );
      const outsider = await fixtures.user();
      const refused = [
        await download('market', other.t.userId, other.t.workspaceId),
        await download('objections', outsider, owner.t.workspaceId),
      ];
      expect(refused.map((response) => response.status)).toEqual([404, 404]);
    } finally {
      policy.probes.max_sources_per_group = shown;
    }
  });
});
