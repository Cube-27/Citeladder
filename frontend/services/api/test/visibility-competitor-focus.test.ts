/**
 * One roster competitor against the brand over HTTP: the sources cited when
 * it is named with the "cited too" count, the prompts naming it instead of
 * the brand, an unknown roster name, and workspace isolation.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { record } from '../src/db/json.ts';
import { promptSet, prompt as trackedPrompt } from './prompt-fixtures.ts';
import type { Tenant } from './visibility-fixtures.ts';
import { frozen, route, visibilityReads } from './visibility-read-support.ts';

const { db, fixtures, get } = visibilityReads();

afterAll(async () => {
  await fixtures.cleanup();
  await db.destroy();
});

describe('GET /visibility/competitors/{name}', () => {
  let tenant: Tenant;
  let auditId: string;
  let tracked: string;

  beforeAll(async () => {
    tenant = await fixtures.tenant();
    await fixtures.competitor(tenant.projectId, { name: 'Globex' });
    await fixtures.competitor(tenant.projectId, { name: 'Initech' });
    tracked = await trackedPrompt(db, await promptSet(db, tenant.projectId), 'best crm');
    auditId = await fixtures.audit(tenant, { configuration: frozen() });
    const answer = (input: {
      prompt: number;
      engine: string;
      you: boolean;
      named: string[];
      cited: string[];
    }) =>
      fixtures.execution(tenant, {
        auditId,
        promptIndex: input.prompt,
        promptId: input.prompt === 0 ? tracked : undefined,
        promptText: ['best crm', 'cheap crm', 'crm for teams'][input.prompt],
        theme: input.prompt === 1 ? 'Pricing' : '',
        engine: input.engine,
        analysis: {
          brandMentioned: input.you,
          brandMentions: input.you ? ['Acme Corp'] : [],
          competitorMentions: input.named,
          citations: input.cited.map((domain) => ({ url: `https://${domain}/page` })),
        },
      });
    // Prompt 0: Globex alone on chatgpt, beside you on gemini.
    await answer({
      prompt: 0,
      engine: 'chatgpt',
      you: false,
      named: ['Globex'],
      cited: ['g2.example', 'review.example'],
    });
    await answer({
      prompt: 0,
      engine: 'gemini',
      you: true,
      named: ['Globex'],
      cited: ['g2.example'],
    });
    // Prompt 1: Globex alone on chatgpt; you alone on perplexity cite review.example.
    await answer({ prompt: 1, engine: 'chatgpt', you: false, named: ['Globex'], cited: [] });
    await answer({
      prompt: 1,
      engine: 'perplexity',
      you: true,
      named: [],
      cited: ['review.example'],
    });
    // Prompt 2: only Initech, never Globex.
    await answer({
      prompt: 2,
      engine: 'chatgpt',
      you: false,
      named: ['Initech'],
      cited: ['other.example'],
    });
  });

  it('serves the sources cited when it is named and the prompts naming it instead of you', async () => {
    const { status, body } = await get(tenant, route(tenant, '/competitors/Globex'), {
      audit_id: auditId,
    });
    expect(status).toBe(200);
    expect(body).toEqual({
      competitor: { id: expect.any(String), name: 'Globex' },
      answers: 3,
      sources: [
        // Cited in both Globex answers on prompt 0, one of which names you.
        { domain: 'g2.example', answers: 2, answers_naming_you: 1 },
        // Cited beside Globex once; your perplexity answer cites it too.
        { domain: 'review.example', answers: 1, answers_naming_you: 1 },
      ],
      // Prompt 2 never names Globex; ties on engines run in prompt order.
      named_instead: [
        {
          prompt_id: tracked,
          prompt: 'best crm',
          topic: 'Untagged',
          engines: 1,
          engines_answered: 2,
        },
        {
          prompt_id: null,
          prompt: 'cheap crm',
          topic: 'Pricing',
          engines: 1,
          engines_answered: 2,
        },
      ],
    });
  });

  it('flags a source that never appears beside you', async () => {
    const { body } = await get(tenant, route(tenant, '/competitors/Initech'), {
      audit_id: auditId,
    });
    expect([body.answers, body.sources, body.named_instead]).toEqual([
      1,
      [{ domain: 'other.example', answers: 1, answers_naming_you: 0 }],
      [
        {
          prompt_id: null,
          prompt: 'crm for teams',
          topic: 'Untagged',
          engines: 1,
          engines_answered: 1,
        },
      ],
    ]);
  });

  it('is not found for a name off the roster, or from another workspace', async () => {
    const outsider = await fixtures.tenant();
    await fixtures.competitor(outsider.projectId, { name: 'Globex' });
    const [unknown, foreign, listed] = await Promise.all([
      get(tenant, route(tenant, '/competitors/Hooli'), { audit_id: auditId }),
      get(outsider, route(tenant, '/competitors/Globex'), { audit_id: auditId }),
      get(tenant, route(tenant, '/competitors/Globex'), { audit_id: auditId }),
    ]);
    expect([
      unknown.status,
      record(unknown.body.error).code,
      foreign.status,
      record(foreign.body.error).message,
      listed.status,
    ]).toEqual([404, 'competitor_not_found', 404, 'Project not found', 200]);
    // The outsider's own roster entry does not open this tenant's run, and
    // that is not read as an unknown competitor.
    const crossed = await get(outsider, route(outsider, '/competitors/Globex'), {
      audit_id: auditId,
    });
    expect([crossed.status, record(crossed.body.error).code]).toEqual([404, 'not_found']);
  });
});
