import { afterAll, beforeEach, expect, it, vi } from 'vitest';

import {
  buyerGenerateInput,
  buyerManualInput,
  generateBuyerPrompts,
  manualBuyerPrompt,
} from '../src/commerce/buyer-prompts.ts';
import { importCatalog } from '../src/commerce/import.ts';
import { createModelGateway, gatewaySettings } from '../src/models/gateway.ts';
import { billingAccount, grant } from './prompt-fixtures.ts';
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
      { ...gatewaySettings({}), apiKey: 'test-only', model: 'test', baseUrl: 'https://model.test' },
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
                { text: 'which trail running shoes grip wet rocks' },
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
  expect(repeat.map((row) => row.text)).toEqual(
    expect.arrayContaining([
      'waterproof trail shoes for muddy hikes',
      'which trail running shoes grip wet rocks',
    ]),
  );
  expect(repeat).toHaveLength(2);
});
