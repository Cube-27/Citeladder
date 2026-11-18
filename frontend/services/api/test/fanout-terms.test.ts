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
  it('keeps distinct folded words and drops function words and single letters', () => {
    expect(searchTerms('Best CRM for the Agencies & Acme-Cloud, CRM 2026 — é')).toEqual([
      'best',
      'crm',
      'agencies',
      'acme',
      'cloud',
      '2026',
    ]);
  });

  it('counts a search once per term and matches brands by name or alias', () => {
    const { totalSearches, terms } = countTerms({
      queries: ['NW pricing pricing', 'acmecloud pricing', 'Northwind trial'],
      config: scoringConfig(CONFIGURATION),
      previous: null,
    });
    expect(totalSearches).toBe(3);
    expect(terms).toEqual([
      { term: 'pricing', searches: 2, share: 0.666667, change: null, brands: [] },
      {
        term: 'acmecloud',
        searches: 1,
        share: 0.333333,
        change: null,
        brands: [{ kind: 'brand', name: 'Acme Cloud' }],
      },
      {
        term: 'northwind',
        searches: 1,
        share: 0.333333,
        change: null,
        brands: [{ kind: 'competitor', name: 'Northwind' }],
      },
      {
        term: 'nw',
        searches: 1,
        share: 0.333333,
        change: null,
        brands: [{ kind: 'competitor', name: 'Northwind' }],
      },
      { term: 'trial', searches: 1, share: 0.333333, change: null, brands: [] },
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
        row('agencies', 1, 0.333333, 0.333333),
        nw,
        row('review', 1, 0.333333, 0.333333),
      ],
      rising: [
        acmecloud,
        row('agencies', 1, 0.333333, 0.333333),
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
});
