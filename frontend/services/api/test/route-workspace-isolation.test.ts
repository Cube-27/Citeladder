import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, expect, it } from 'vitest';

import { createApp } from '../src/app.ts';
import { createDiscovery } from '../src/projects/discovery.ts';
import { discoveryCreate } from '../src/projects/discovery-inputs.ts';
import { createConnection } from '../src/providers/connections.ts';
import { createConnectionInput } from '../src/providers/inputs.ts';
import { providerSettings } from '../src/providers/config.ts';
import { PRODUCT_ROUTES } from '../src/routes/index.ts';
import { auditTestKey } from './audit-fixtures.ts';
import { actionRow, opportunityRow } from './opportunity-fixtures.ts';
import { billingAccount, prompt, promptSet, topic } from './prompt-fixtures.ts';
import { SiteFixtures, type SiteSeed } from './site-health-fixtures.ts';
import { asOwner, sessionToken, testConfig, testDatabase } from './support.ts';

const config = testConfig();
const db = testDatabase(config);
const fixtures = new SiteFixtures(db);
const app = createApp(config, db);
const accounts: string[] = [];

const ROUTES = PRODUCT_ROUTES.flatMap(({ contract }) => {
  const { path } = contract;
  const first = /\{[a-z_]+\}/u.exec(path);
  if (!path.startsWith('/api/v1/') || !first || first[0] === '{provider}') return [];
  if (path.startsWith('/api/v1/projects/{project_id}')) return [];
  const family = path.slice(0, first.index + first[0].length);
  return [{ method: contract.method.toUpperCase(), path, family }];
});

const now = () => new Date();

async function chat(owner: SiteSeed) {
  const id = randomUUID();
  await db
    .insertInto('agent_chats')
    .values({
      id,
      workspace_id: owner.workspaceId,
      project_id: owner.projectId,
      title: 'Isolation',
      context_refs: {},
      turn_count: 0,
      model: 'claude-haiku-5-5',
      reasoning_effort: 'medium',
      last_activity_at: now(),
      created_at: now(),
      updated_at: now(),
    })
    .execute();
  return id;
}

async function apiKey(owner: SiteSeed) {
  const id = randomUUID();
  await db
    .insertInto('api_keys')
    .values({
      id,
      workspace_id: owner.workspaceId,
      name: 'automation',
      prefix: id.slice(0, 8),
      secret_hmac: Buffer.from(randomUUID()),
      scopes: ['read'],
      project_ids: null,
      created_by_user_id: owner.userId,
      created_at: now(),
      expires_at: null,
      last_used_at: null,
      rejection_logged_at: null,
      revoked_at: null,
      revoke_reason: null,
    })
    .execute();
  return id;
}

async function mcpGrant(owner: SiteSeed) {
  const clientId = randomUUID();
  await db
    .insertInto('mcp_oauth_clients')
    .values({
      id: randomUUID(),
      client_id: clientId,
      client_metadata: JSON.stringify({ client_name: 'isolation' }),
      client_secret_encrypted: '',
      created_at: now(),
    })
    .execute();
  const id = randomUUID();
  await db
    .insertInto('mcp_oauth_grants')
    .values({
      id,
      client_id: clientId,
      user_id: owner.userId,
      workspace_ids: JSON.stringify([owner.workspaceId]),
      scopes: JSON.stringify(['citeladder:read']),
      resource: 'https://protocol.example.test/mcp',
      access_token_hash: randomUUID(),
      refresh_token_hash: randomUUID(),
      access_expires_at: new Date(Date.now() + 3_600_000),
      refresh_expires_at: new Date(Date.now() + 7_200_000),
      revoked_at: null,
      created_at: now(),
      updated_at: now(),
    })
    .execute();
  return id;
}

async function integrationConnection(
  owner: SiteSeed,
  transport: 'google_oauth' | 'microsoft_oauth' = 'google_oauth',
  provider: 'gsc' | 'bing' = 'gsc',
) {
  const grantId = randomUUID();
  await db
    .insertInto('integration_oauth_grants')
    .values({
      id: grantId,
      workspace_id: owner.workspaceId,
      transport,
      access_token_encrypted: 'ciphertext',
      refresh_token_encrypted: 'ciphertext',
      token_expires_at: null,
      token_revision: 1,
      refresh_claim_id: null,
      refresh_claim_expires_at: null,
      granted_scopes: JSON.stringify([]),
      status: 'connected',
      created_at: now(),
      updated_at: now(),
    })
    .execute();
  const id = randomUUID();
  await db
    .insertInto('integration_connections')
    .values({
      id,
      workspace_id: owner.workspaceId,
      grant_id: grantId,
      provider,
      label: `Recorded ${provider}`,
      account_ref: `recorded-${provider}`,
      dataset_capabilities: JSON.stringify({}),
      last_synced_at: null,
      created_at: now(),
      updated_at: now(),
    })
    .execute();
  return id;
}

async function integrationMapping(owner: SiteSeed) {
  const id = randomUUID();
  await db
    .insertInto('integration_property_mappings')
    .values({
      id,
      workspace_id: owner.workspaceId,
      connection_id: await integrationConnection(owner, 'microsoft_oauth', 'bing'),
      provider: 'bing',
      property_ref: 'https://example.test',
      project_id: owner.projectId,
      status: 'active',
      created_at: now(),
      updated_at: now(),
    })
    .execute();
  return id;
}

const usd = (amount_minor: number) => ({ currency: 'USD', amount_minor });
const quote = {
  quote_id: 'isolation',
  catalog_revision: 'isolation',
  catalog_key: 'tier_1',
  credential_mode: 'byok',
  country_code: 'US',
  region: 'international',
  base_price: usd(1000),
  subtotal_price: usd(1000),
  discount: usd(0),
  taxable_value: usd(1000),
  tax: usd(0),
  tax_treatment: 'EXPORT_ZERO_RATED',
  tax_rate: '0',
  cgst: usd(0),
  sgst: usd(0),
  igst: usd(0),
  tax_policy_version: 1,
  total_price: usd(1000),
  expires_at: new Date(Date.now() + 3_600_000).toISOString(),
};

async function activation(owner: SiteSeed) {
  const id = randomUUID();
  await db
    .insertInto('pending_activations')
    .values({
      id,
      billing_account_id: await billingAccount(db, owner.workspaceId),
      activation_kind: 'base',
      catalog_key: 'tier_1',
      catalog_revision: 'isolation',
      country_code: 'US',
      credential_mode: 'byok',
      expires_at: new Date(Date.now() + 3_600_000),
      idempotency_key: randomUUID(),
      provider: 'razorpay',
      provider_mode: 'test',
      quantity: 1,
      region: 'international',
      request_fingerprint: randomUUID(),
      status: 'pending',
      quote: JSON.stringify(quote),
      created_at: now(),
      updated_at: now(),
    })
    .execute();
  return id;
}

async function invoice(owner: SiteSeed) {
  const accountId = await billingAccount(db, owner.workspaceId);
  accounts.push(accountId);
  const paymentId = randomUUID();
  await db
    .insertInto('billing_payments')
    .values({
      id: paymentId,
      billing_account_id: accountId,
      provider: 'razorpay',
      provider_mode: 'test',
      receipt_kind: 'payment',
      external_payment_id: `pay_${paymentId}`,
      amount_minor: 118000,
      currency: 'INR',
      payment_method: 'upi',
      status: 'paid',
      paid_at: now(),
      receipt_sha256: 'a'.repeat(64),
      created_at: now(),
    })
    .execute();
  const id = randomUUID();
  await db
    .insertInto('billing_invoices')
    .values({
      id,
      billing_account_id: accountId,
      payment_id: paymentId,
      invoice_number: `CL/2627/${randomUUID().slice(0, 6)}`,
      receipt_number: 'CLR/2627/000001',
      financial_year: '2026-27',
      document_kind: 'gst_tax_receipt',
      invoice_date: now(),
      paid_at: now(),
      created_at: now(),
      currency: 'INR',
      total_amount_minor: 118000,
      tax_treatment: 'IGST',
      tax_policy_version: 1,
      payload_sha256: 'a'.repeat(64),
      payload: {},
    })
    .execute();
  return id;
}

async function providerConnection(owner: SiteSeed) {
  const connection = await createConnection(
    db,
    owner.workspaceId,
    owner.userId,
    createConnectionInput.parse({
      transport_provider: 'openai',
      api_key: 'test-key',
      routes: [{ logical_engine: 'chatgpt' }],
    }),
    auditTestKey,
    providerSettings({}),
  );
  return connection.id;
}

const FACTORIES: Record<string, (owner: SiteSeed) => Promise<string>> = {
  '/api/v1/actions/{action_id}': async (owner) => {
    const row = actionRow(
      { workspace_id: owner.workspaceId, project_id: owner.projectId },
      { group_key: 'isolation', target_kind: 'page', target_label: 'Isolation' },
    );
    await db.insertInto('actions').values(row).execute();
    return row.id;
  },
  '/api/v1/agent/chats/{chat_id}': chat,
  '/api/v1/api-keys/{key_id}': apiKey,
  '/api/v1/audits/{audit_id}': (owner) => fixtures.audit(owner),
  '/api/v1/billing/activations/{activation_id}': activation,
  '/api/v1/billing/invoices/{invoice_id}': invoice,
  '/api/v1/brand-discoveries/{discovery_id}': async (owner) =>
    (
      await createDiscovery(
        db,
        owner.workspaceId,
        discoveryCreate.parse({
          brand_name: 'Acme',
          website_url: 'acme.com',
          primary_market: 'US',
        }),
        randomUUID(),
      )
    ).id,
  '/api/v1/executions/{execution_id}': async (owner) =>
    (await fixtures.execution(owner, { auditId: await fixtures.audit(owner) })).taskId,
  '/api/v1/integrations/{connection_id}': (owner) => integrationConnection(owner),
  '/api/v1/integrations/mappings/{mapping_id}': integrationMapping,
  '/api/v1/integrations/workspaces/{workspace_id}': async (owner) => owner.workspaceId,
  '/api/v1/mcp/connections/{grant_id}': mcpGrant,
  '/api/v1/opportunities/{opportunity_id}': async (owner) => {
    const row = opportunityRow(
      { workspace_id: owner.workspaceId, project_id: owner.projectId },
      {
        rule_id: 'brand_absent_high_value_prompt',
        opportunity_type: 'visibility',
        severity: 'high',
        target_key: 'isolation',
        evidence: JSON.stringify({ prompt_text: 'best crm for small teams' }),
      },
    );
    await db.insertInto('opportunities').values(row).execute();
    return row.id;
  },
  '/api/v1/prompt-sets/{prompt_set_id}': (owner) => promptSet(db, owner.projectId),
  '/api/v1/prompts/{prompt_id}': async (owner) =>
    prompt(db, await promptSet(db, owner.projectId), 'Which tool suits isolation?'),
  '/api/v1/provider-connections/{connection_id}': providerConnection,
  '/api/v1/site-crawls/{crawl_id}': async (owner) => owner.crawlId,
  '/api/v1/topics/{topic_id}': (owner) => topic(db, owner.projectId, 'Isolation'),
  '/api/v1/workspaces/{workspace_id}': async (owner) => owner.workspaceId,
};

const revision = { base_revision_id: randomUUID() };
const promptBody = { text: 'Which tool suits isolation?', cohort: 'core' };
const BODIES: Record<string, unknown> = {
  'POST /api/v1/agent/chats/{chat_id}/messages': {
    message: 'Hello',
    mentions: [],
    attachments: [{ kind: 'pasted_text', text: 'Pasted' }],
  },
  'POST /api/v1/agent/chats/{chat_id}/outputs/{output_id}/revisions': {
    ...revision,
    title: 'Draft',
    body: 'Body',
  },
  'POST /api/v1/agent/chats/{chat_id}/outputs/{output_id}/target': { decision: 'keep' },
  'POST /api/v1/agent/chats/{chat_id}/outputs/{output_id}/suggestions/{suggestion_id}/apply':
    revision,
  'POST /api/v1/agent/chats/{chat_id}/outputs/{output_id}/suggestions/{suggestion_id}/dismiss':
    revision,
  'POST /api/v1/agent/chats/{chat_id}/outputs/{output_id}/suggestions/{suggestion_id}/revert':
    revision,
  'POST /api/v1/agent/chats/{chat_id}/outputs/{output_id}/suggestions/apply-all': revision,
  'POST /api/v1/agent/chats/{chat_id}/outputs/{output_id}/suggestions/dismiss-all': revision,
  'POST /api/v1/billing/activations/{activation_id}/verify': {
    fields: { razorpay_payment_id: 'pay_isolation' },
  },
  'POST /api/v1/brand-discoveries/{discovery_id}/complete': {
    profile: { category: 'Analytics consultancy' },
    domains: ['acme.com'],
  },
  'PATCH /api/v1/actions/{action_id}': { status: 'dismissed' },
  'POST /api/v1/actions/{action_id}/declaration': {
    declared_implemented_at: new Date().toISOString(),
  },
  'POST /api/v1/prompt-sets/{prompt_set_id}/prompts': promptBody,
  'POST /api/v1/prompt-sets/{prompt_set_id}/prompts/bulk-status': {
    prompt_ids: [randomUUID()],
    status: 'archived',
  },
  'POST /api/v1/prompt-sets/{prompt_set_id}/import': { prompts: [promptBody] },
  'POST /api/v1/prompt-sets/{prompt_set_id}/candidates/review': {
    accept_ids: [randomUUID()],
    reject_ids: [],
  },
  'POST /api/v1/integrations/{connection_id}/mappings': {
    provider: 'gsc',
    property_ref: 'https://example.test',
    project_id: randomUUID(),
  },
};

let owner: SiteSeed;
let stranger: string;
const resources = new Map<string, string>();

beforeAll(async () => {
  owner = await fixtures.crawl();
  for (const family of new Set(ROUTES.map((route) => route.family))) {
    const factory = FACTORIES[family];
    if (factory) resources.set(family, await factory(owner));
  }
  const member = await fixtures.user();
  await fixtures.ownedWorkspace(member);
  stranger = `${config.session.cookieName}=${await sessionToken({ sub: member, ver: 0 })}`;
});

afterAll(async () => {
  if (accounts.length) {
    await db.deleteFrom('billing_invoices').where('billing_account_id', 'in', accounts).execute();
    await asOwner((ownerDb) =>
      ownerDb.deleteFrom('billing_payments').where('billing_account_id', 'in', accounts).execute(),
    );
  }
  await fixtures.cleanup();
  await db.destroy();
});

it('has a resource factory for every registered route family outside a project path', () => {
  const families = [...new Set(ROUTES.map((route) => route.family))];
  expect(families.filter((family) => !FACTORIES[family])).toEqual([]);
  expect(families).toContain('/api/v1/api-keys/{key_id}');
});

it('serves each family resource to its own workspace, so the stranger 404s are not missing rows', async () => {
  const session = `${config.session.cookieName}=${await sessionToken({ sub: owner.userId, ver: 0 })}`;
  const stateful = new Set([
    '/api/v1/billing/activations/{activation_id}/checkout',
    '/api/v1/billing/invoices/{invoice_id}/pdf',
    '/api/v1/audits/{audit_id}/metrics',
  ]);
  const reads = ROUTES.filter(
    ({ method, path, family }) =>
      method === 'GET' && !path.includes('{', family.length) && !stateful.has(path),
  );
  const answers = [];
  for (const { path, family } of reads) {
    const concrete = path.replace(family.slice(family.lastIndexOf('{')), resources.get(family)!);
    const response = await app.request(concrete, {
      headers: { cookie: session, 'x-workspace-id': owner.workspaceId },
    });
    answers.push([path, response.status]);
  }
  expect(answers).toEqual(reads.map(({ path }) => [path, 200]));
});

it('hides every other-workspace resource from a stranger on every registered route, and changes nothing', async () => {
  const answers = [];
  for (const { method, path, family } of ROUTES) {
    const concrete = path
      .replace(family.slice(family.lastIndexOf('{')), resources.get(family) ?? 'missing-factory')
      .replace('{provider}', 'google')
      .replace('{index}', '0')
      .replaceAll(/\{[a-z_]+\}/gu, () => randomUUID());
    const write = method !== 'GET' && method !== 'DELETE';
    const response = await app.request(concrete, {
      method,
      headers: {
        cookie: stranger,
        'idempotency-key': randomUUID(),
        ...(write ? { 'content-type': 'application/json' } : {}),
      },
      ...(write ? { body: JSON.stringify(BODIES[`${method} ${path}`] ?? {}) } : {}),
    });
    answers.push([method, path, response.status]);
  }
  expect(answers).toEqual(ROUTES.map(({ method, path }) => [method, path, 404]));

  const key = await db
    .selectFrom('api_keys')
    .select('revoked_at')
    .where('id', '=', resources.get('/api/v1/api-keys/{key_id}')!)
    .executeTakeFirstOrThrow();
  const chats = await db
    .selectFrom('agent_chats')
    .select('id')
    .where('id', '=', resources.get('/api/v1/agent/chats/{chat_id}')!)
    .execute();
  const sets = await db
    .selectFrom('prompt_sets')
    .select('id')
    .where('id', '=', resources.get('/api/v1/prompt-sets/{prompt_set_id}')!)
    .execute();
  const members = await db
    .selectFrom('workspace_members')
    .select('user_id')
    .where('workspace_id', '=', owner.workspaceId)
    .execute();
  expect({
    revoked: key.revoked_at,
    chats: chats.length,
    sets: sets.length,
    members: members.map((row) => row.user_id),
  }).toEqual({ revoked: null, chats: 1, sets: 1, members: [owner.userId] });
});
