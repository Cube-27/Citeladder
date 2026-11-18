/**
 * Fanout search terms (AV-8): normalization, counts and brand matches derived
 * at finalization, rising and falling against the previous finalized run, and
 * the workspace-authorized read, against real PostgreSQL.
 */
import { afterAll, describe, expect, it } from 'vitest';

import { countTerms, persistFanoutTerms, searchTerms } from '../src/analysis/fanout-terms.ts';
import { scoringConfig } from '../src/analysis/scoring.ts';
import type { Tenant } from './visibility-fixtures.ts';
import { route, visibilityReads } from './visibility-read-support.ts';

const { db, fixtures, get } = visibilityReads();
const CONFIGURATION = {
  brand_name: 'Acme Cloud',
  brand_aliases: ['Acme'],
  competitors: [{ name: 'Northwind', aliases: ['NW'], domains: [] }],
};

afterAll(async () => {
  await fixtures.cleanup();
  await db.destroy();
});

describe('search term normalization', () => {
  it('keeps distinct singular words and intent words, drops function words and numbers', () => {
    expect(
      searchTerms(
        'Which best CRM for the Agencies & Acme-Cloud vs CRMs 2026 — é boxes classes SaaS',
      ),
    ).toEqual(['best', 'crm', 'agency', 'acme', 'cloud', 'vs', 'box', 'class', 'saas']);
  });

  it('counts a search once per term and gives each term the brands it was part of naming', () => {
    const { totalSearches, terms } = countTerms({
      queries: [
        'NW pricing pricing',
        'acmecloud pricing',
        'Harbor & Pine beans vs Ridgeline Roasting Co.',
        'pine furniture',
        'acme cloud reviews',
      ],
      config: scoringConfig({
        ...CONFIGURATION,
        competitors: [
          ...CONFIGURATION.competitors,
          { name: 'Harbor & Pine', aliases: [], domains: [] },
          { name: 'Ridgeline Roasting Co.', aliases: [], domains: [] },
        ],
      }),
      previous: null,
    });
    const acme = [{ kind: 'brand', name: 'Acme Cloud' }];
    const harbor = [{ kind: 'competitor', name: 'Harbor & Pine' }];
    const ridgeline = [{ kind: 'competitor', name: 'Ridgeline Roasting Co.' }];
    const once = (term: string, brands: { kind: string; name: string }[] = []) => ({
      term,
      searches: 1,
      share: 0.2,
      change: null,
      brands,
    });
    expect(totalSearches).toBe(5);
    expect(terms).toEqual([
      { term: 'pine', searches: 2, share: 0.4, change: null, brands: harbor },
      { term: 'pricing', searches: 2, share: 0.4, change: null, brands: [] },
      once('acme', acme),
      once('acmecloud', acme),
      once('bean'),
      once('cloud', acme),
      once('co', ridgeline),
      once('furniture'),
      once('harbor', harbor),
      once('nw', [{ kind: 'competitor', name: 'Northwind' }]),
      once('review'),
      once('ridgeline', ridgeline),
      once('roasting', ridgeline),
      once('vs'),
    ]);
  });
});

/** One finalized run whose answers searched for `queries`, its terms persisted. */
async function finalizedRun(
  tenant: Tenant,
  completedAt: string,
  answers: { engine: string; queries: string[] }[],
  persist = true,
) {
  const auditId = await fixtures.audit(tenant, {
    completedAt: new Date(completedAt),
    configuration: CONFIGURATION,
  });
  for (const answer of answers)
    await fixtures.execution(tenant, {
      auditId,
      engine: answer.engine,
      artifactEvents: answer.queries.map((query, sequence) => ({ sequence, query })),
      analysis: { searchUsed: true, searchQueryCount: answer.queries.length },
    });
  if (!persist) return auditId;
  const audit = await db
    .selectFrom('audits')
    .selectAll()
    .where('id', '=', auditId)
    .executeTakeFirstOrThrow();
  const analyses = await db
    .selectFrom('response_analyses')
    .selectAll()
    .where('audit_id', '=', auditId)
    .execute();
  await db
    .transaction()
    .execute((trx) =>
      persistFanoutTerms(trx, audit, analyses, scoringConfig(audit.configuration), new Date()),
    );
  return auditId;
}

const mark = (kind: string, name: string) => ({ kind, name, logo_url: null, website: null });

describe('GET /visibility/fanout-terms', () => {
  it('serves top, rising and falling against the previous run, within the workspace', async () => {
    const tenant = await fixtures.tenant();
    const outsider = await fixtures.tenant();
    await finalizedRun(tenant, '2026-02-01T00:00:00Z', [
      { engine: 'chatgpt', queries: ['acme pricing', 'free trial'] },
    ]);
    const current = await finalizedRun(tenant, '2026-03-01T00:00:00Z', [
      { engine: 'chatgpt', queries: ['Acme pricing for agencies', 'NW pricing'] },
      { engine: 'gemini', queries: ['acmecloud review'] },
      // Searched without saying what for: not applicable, never zero.
      { engine: 'claude', queries: [] },
    ]);
    const { status, body } = await get(tenant, route(tenant, '/fanout-terms'), {
      audit_id: current,
    });
    expect(status).toBe(200);
    const row = (term: string, searches: number, share: number, change: number) => ({
      term,
      searches,
      share,
      change,
      brands: [],
    });
    const acme = { ...row('acme', 1, 0.333333, -0.166667), brands: [mark('brand', 'Acme Cloud')] };
    const acmecloud = {
      ...row('acmecloud', 1, 0.333333, 0.333333),
      brands: [mark('brand', 'Acme Cloud')],
    };
    const nw = { ...row('nw', 1, 0.333333, 0.333333), brands: [mark('competitor', 'Northwind')] };
    expect(body).toEqual({
      kind: 'observed',
      audit_id: current,
      total_searches: 3,
      compared: true,
      unreported_engines: ['claude'],
      top: [
        row('pricing', 2, 0.666667, 0.166667),
        acme,
        acmecloud,
        row('agency', 1, 0.333333, 0.333333),
        nw,
        row('review', 1, 0.333333, 0.333333),
      ],
      rising: [
        acmecloud,
        row('agency', 1, 0.333333, 0.333333),
        nw,
        row('review', 1, 0.333333, 0.333333),
        row('pricing', 2, 0.666667, 0.166667),
      ],
      falling: [row('free', 0, 0, -0.5), row('trial', 0, 0, -0.5), acme],
    });
    const foreign = await get(outsider, route(outsider, '/fanout-terms'), { audit_id: current });
    expect(foreign.status).toBe(404);
    expect((await get(outsider, route(tenant, '/fanout-terms'))).status).toBe(404);
  });

  it('reads a run finalized before terms were counted as unavailable, not empty', async () => {
    const tenant = await fixtures.tenant();
    expect((await get(tenant, route(tenant, '/fanout-terms'))).body).toEqual({ kind: 'not_run' });
    const counted = await finalizedRun(tenant, '2026-02-01T00:00:00Z', [
      { engine: 'chatgpt', queries: ['acme pricing'] },
    ]);
    const before = await finalizedRun(
      tenant,
      '2026-03-01T00:00:00Z',
      [{ engine: 'chatgpt', queries: ['acme pricing'] }],
      false,
    );
    expect((await get(tenant, route(tenant, '/fanout-terms'))).body).toEqual({
      kind: 'unavailable',
      audit_id: before,
    });
    expect(
      (await get(tenant, route(tenant, '/fanout-terms'), { audit_id: counted })).body,
    ).toMatchObject({ kind: 'observed', compared: false, rising: [], falling: [] });
  });

  it('never compares across a run whose engines reported no search text', async () => {
    const tenant = await fixtures.tenant();
    await finalizedRun(tenant, '2026-02-01T00:00:00Z', [
      { engine: 'chatgpt', queries: ['acme pricing'] },
    ]);
    const silent = await finalizedRun(tenant, '2026-03-01T00:00:00Z', [
      { engine: 'claude', queries: [] },
    ]);
    expect(
      (await get(tenant, route(tenant, '/fanout-terms'), { audit_id: silent })).body,
    ).toMatchObject({ kind: 'observed', total_searches: 0, compared: false, top: [], falling: [] });
    // The next run compares with February, not with the silent run in between.
    const next = await finalizedRun(tenant, '2026-04-01T00:00:00Z', [
      { engine: 'chatgpt', queries: ['acme pricing', 'acme trial'] },
    ]);
    const { body } = await get(tenant, route(tenant, '/fanout-terms'), { audit_id: next });
    expect(body).toMatchObject({
      compared: true,
      rising: [{ term: 'trial', change: 0.5 }],
      falling: [{ term: 'pricing', change: -0.5 }],
    });
  });
});
