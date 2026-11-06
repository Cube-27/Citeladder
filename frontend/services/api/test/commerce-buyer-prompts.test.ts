import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buyerGenerateInput,
  buyerManualInput,
  generateBuyerPrompts,
  manualBuyerPrompt,
} from '../src/commerce/buyer-prompts.ts';
import { importCatalog } from '../src/commerce/import.ts';
import { createModelGateway, gatewaySettings } from '../src/models/gateway.ts';
import { reviewCandidates } from '../src/prompts/candidates.ts';
import { billingAccount, candidate, generationRun, grant } from './prompt-fixtures.ts';
import { testDatabase } from './support.ts';
import { VisibilityFixtures } from './visibility-fixtures.ts';

const db = testDatabase(),
  fixtures = new VisibilityFixtures(db);
let scope: { workspaceId: string; projectId: string },
  target: { kind: 'product'; id: string },
  account: string;
beforeEach(async () => {
  scope = await fixtures.tenant();
  account = await billingAccount(db, scope.workspaceId);
  await importCatalog(db, scope, {
    content:
      'canonical_url,name,description\nhttps://shop.test/shoes,Trail master,Running shoes for wet trails\n',
    filename: 'catalog.csv',
    content_type: 'text/csv',
  });
  const product = await db
    .selectFrom('commerce_products')
    .select('id')
    .where('project_id', '=', scope.projectId)
    .executeTakeFirstOrThrow();
  target = { kind: 'product', id: product.id };
});
afterAll(async () => {
  await fixtures.cleanup();
  await db.destroy();
});

it('saves manual prompts disabled and enforces capacity across concurrent requests', async () => {
  await grant(db, account, { value: 1 });
  const results = await Promise.allSettled(
    ['Which shoes cushion knees?', 'Which shoes grip rain?'].map((text) =>
      manualBuyerPrompt(db, scope, buyerManualInput.parse({ target, text })),
    ),
  );
  expect(results.filter((row) => row.status === 'fulfilled')).toHaveLength(1);
  const success = results.find((row) => row.status === 'fulfilled');
  expect(success?.value).toMatchObject({ enabled: false, approved_at: null, target });
  expect(results.find((row) => row.status === 'rejected')?.reason).toMatchObject({ status: 403 });
});

it('generates target-bound prompts and fails atomically on unusable or foreign targets', async () => {
  const io = {
    fetch: vi.fn<typeof fetch>(async () =>
      Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                prompts: [
                  { text: 'best running shoes for wet trails' },
                  { text: 'lightweight shoes with cushioning for long runs' },
                ],
              }),
            },
          },
        ],
      }),
    ),
    sleep: async () => {},
  };
  const gateway = () =>
    createModelGateway(
      {
        ...gatewaySettings({}),
        apiKey: 'test-only',
        model: 'claude-haiku-5-5',
        baseUrl: 'https://model.test',
      },
      io,
    );
  const rows = await generateBuyerPrompts(
    db,
    scope,
    buyerGenerateInput.parse({ targets: [target], count: 2 }),
    gateway,
  );
  expect(rows).toHaveLength(2);
  expect(rows.every((row) => !row.enabled)).toBe(true);
  const other = await fixtures.tenant();
  await expect(
    generateBuyerPrompts(
      db,
      other,
      buyerGenerateInput.parse({ targets: [target], count: 2 }),
      gateway,
    ),
  ).rejects.toMatchObject({ status: 404 });
  expect(io.fetch).toHaveBeenCalledTimes(1);
  io.fetch.mockImplementationOnce(async () =>
    Response.json({
      choices: [
        {
          message: {
            content: JSON.stringify({ prompts: [{ text: 'What do you prefer in Trail master?' }] }),
          },
        },
      ],
    }),
  );
  await expect(
    generateBuyerPrompts(
      db,
      scope,
      buyerGenerateInput.parse({ targets: [target], count: 2 }),
      gateway,
    ),
  ).rejects.toMatchObject({ status: 503 });
  expect(
    await db
      .selectFrom('commerce_prompt_targets')
      .select('id')
      .where('project_id', '=', scope.projectId)
      .execute(),
  ).toHaveLength(2);
  io.fetch.mockImplementationOnce(async () =>
    Response.json({
      choices: [
        {
          message: {
            content: JSON.stringify({
              prompts: [
                { text: 'best running shoes for wet trails' },
                { text: 'waterproof trail shoes for muddy hikes' },
                // Binds only through the plural fold: "shoe" meets "shoes".
                { text: 'best waterproof shoe for rainy commutes' },
              ],
            }),
          },
        },
      ],
    }),
  );
  const repeat = await generateBuyerPrompts(
    db,
    scope,
    buyerGenerateInput.parse({ targets: [target], count: 2 }),
    gateway,
  );
  expect(repeat.map((row) => row.text)).toEqual([
    'waterproof trail shoes for muddy hikes',
    'best waterproof shoe for rainy commutes',
  ]);
});

it("keeps each target's usable prompts and binds category prompts through the category's own name", async () => {
  await importCatalog(db, scope, {
    content: 'canonical_url,name,category\nhttps://shop.test/shell,Storm shell,Rain jackets\n',
    filename: 'jackets.csv',
    content_type: 'text/csv',
  });
  const category = await db
    .selectFrom('commerce_categories')
    .select('id')
    .where('project_id', '=', scope.projectId)
    .where('normalized_name', '=', 'rain jackets')
    .executeTakeFirstOrThrow();
  const answers = [
    // Binds only through the category name: no product or term says "jacket".
    ['cheap rain jacket that packs small for cycling'],
    // Every prompt for the product is unusable.
    ['What do you prefer in Trail master?'],
  ];
  const io = {
    fetch: vi.fn<typeof fetch>(async () =>
      Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                prompts: (answers.shift() ?? []).map((text) => ({ text })),
              }),
            },
          },
        ],
      }),
    ),
    sleep: async () => {},
  };
  const gateway = () =>
    createModelGateway(
      {
        ...gatewaySettings({}),
        apiKey: 'test-only',
        model: 'claude-haiku-5-5',
        baseUrl: 'https://model.test',
      },
      io,
    );
  const rows = await generateBuyerPrompts(
    db,
    scope,
    buyerGenerateInput.parse({
      targets: [{ kind: 'category', id: category.id }, target],
      count: 2,
    }),
    gateway,
  );
  expect(rows.map((row) => [row.target.kind, row.text])).toEqual([
    ['category', 'cheap rain jacket that packs small for cycling'],
  ]);
});

describe('one prompt insert path shared by candidate review and Commerce', () => {
  /** The Commerce set (created by a first buyer prompt) with one staged candidate per text. */
  async function commerceSetWithCandidates(texts: string[]) {
    await manualBuyerPrompt(
      db,
      scope,
      buyerManualInput.parse({ target, text: 'Which shoes suit muddy trails?' }),
    );
    const set = await db
      .selectFrom('prompt_sets')
      .select('id')
      .where('project_id', '=', scope.projectId)
      .where('name', '=', 'Commerce Buyer Prompts')
      .executeTakeFirstOrThrow();
    const runId = await generationRun(db, { ...scope, setId: set.id }, {});
    const ids = [];
    for (const text of texts)
      ids.push(await candidate(db, { workspaceId: scope.workspaceId, setId: set.id, runId }, text));
    return { setId: set.id, candidateIds: ids };
  }
  const texts = async (setId: string) =>
    (
      await db
        .selectFrom('prompts')
        .select('text')
        .where('prompt_set_id', '=', setId)
        .orderBy('text')
        .execute()
    ).map((row) => row.text);

  it('lets exactly one of a concurrent accept and Commerce insert of the same text in', async () => {
    const text = 'Which shoes grip wet rock?';
    const { setId, candidateIds } = await commerceSetWithCandidates([text]);
    const [review, commerce] = await Promise.allSettled([
      reviewCandidates(db, scope.workspaceId, setId, { accept_ids: candidateIds, reject_ids: [] }),
      manualBuyerPrompt(db, scope, buyerManualInput.parse({ target, text })),
    ]);
    const outcome = [
      review.status === 'fulfilled'
        ? `accepted ${review.value.accepted.length}, dropped ${review.value.dropped_duplicates}`
        : 'review failed',
      commerce.status === 'fulfilled' ? 'commerce inserted' : `commerce ${commerce.reason.status}`,
    ];
    expect([
      ['accepted 1, dropped 0', 'commerce 409'],
      ['accepted 0, dropped 1', 'commerce inserted'],
    ]).toContainEqual(outcome);
    expect(await texts(setId)).toEqual([
      'Which shoes grip wet rock?',
      'Which shoes suit muddy trails?',
    ]);
  });

  it('admits only the allowance when an accept and a Commerce insert race for the last slot', async () => {
    await grant(db, account, { value: 2 });
    const { setId, candidateIds } = await commerceSetWithCandidates([
      'Which shoes drain water fast?',
    ]);
    const [review, commerce] = await Promise.allSettled([
      reviewCandidates(db, scope.workspaceId, setId, { accept_ids: candidateIds, reject_ids: [] }),
      manualBuyerPrompt(
        db,
        scope,
        buyerManualInput.parse({ target, text: 'Which shoes dry overnight?' }),
      ),
    ]);
    expect([review.status, commerce.status].sort()).toEqual(['fulfilled', 'rejected']);
    const refusal =
      review.status === 'rejected' ? review.reason : (commerce as PromiseRejectedResult).reason;
    expect(refusal).toMatchObject({ status: 403 });
    expect(await texts(setId)).toHaveLength(2);
  });

  it('files a Commerce prompt as active and unbranded in its workspace', async () => {
    const { setId } = await commerceSetWithCandidates([]);
    const row = await db
      .selectFrom('prompts')
      .select(['cohort', 'branded', 'status', 'origin', 'workspace_id'])
      .where('prompt_set_id', '=', setId)
      .executeTakeFirstOrThrow();
    expect(row).toEqual({
      cohort: 'commerce',
      branded: false,
      status: 'active',
      origin: 'manual',
      workspace_id: scope.workspaceId,
    });
  });
});
