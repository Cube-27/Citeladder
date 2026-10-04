/** Fixture construction through the native identity, project, prompt and provider owners. */
import type { Database } from '../db/database.ts';
import type { ServiceConfig } from '../config.ts';
import { devSeed } from '../config/dev-seed.ts';
import { provisionDevelopmentLogin } from '../auth/bootstrap.ts';
import { projectCreate } from '../projects/inputs.ts';
import { createProject } from '../projects/service.ts';
import { createPromptSet } from '../prompts/prompt-sets.ts';
import { createPrompt, promptInput } from '../prompts/prompts.ts';
import { createConnection } from '../providers/connections.ts';
import { createConnectionInput } from '../providers/inputs.ts';
import { providerSettings } from '../providers/config.ts';
import { initializeCatalog } from '../billing/admin.ts';
import { randomUUID } from 'node:crypto';

async function project(db: Database, workspaceId: string, userId: string, agency: boolean) {
  const input = projectCreate.parse(
    agency
      ? {
          name: 'CamperCo Awnings',
          brand_name: 'CamperCo',
          website_url: 'https://camperco.example.com',
          country_code: 'AU',
          language_code: 'en-AU',
          benchmark_mode: 'forced_grounded',
          products_services: ['RV camper awnings'],
          description: 'Retractable RV awnings for hot climates.',
          brand: { aliases: ['Camper Co'] },
          owned_domains: ['camperco.example.com'],
          competitors: [{ name: 'OutbackShade', domains: ['outbackshade.example.com'] }],
        }
      : {
          name: 'Wanderlust Gear - US Backpacks',
          brand_name: 'Wanderlust Gear Co.',
          website_url: 'https://wanderlustgear.com',
          country_code: 'US',
          language_code: 'en-US',
          benchmark_mode: 'controlled_localized',
          default_repetitions: 2,
          description: 'Evidence-grounded outdoor packs and travel gear.',
          positioning: 'Durable mid-market packs for multi-day travel.',
          products_services: [
            'Hiking backpacks',
            'Travel backpacks',
            'Waterproof backpack',
            'Outdoor gear shops',
          ],
          target_audience: 'Travelers and hikers planning multi-day trips.',
          brand: { aliases: ['Wanderlust', 'Wanderlust Gear'] },
          owned_domains: ['wanderlustgear.com'],
          unintended_domains: ['wanderlustgear.blogspot.com'],
          competitors: [
            { name: 'TrailBlaze Packs', aliases: ['TrailBlaze'], domains: ['trailblazepacks.com'] },
            { name: 'Summit Gear', aliases: ['Summit'], domains: ['summitgear.com'] },
          ],
        },
  );
  const existing = await db
    .selectFrom('projects')
    .select('id')
    .where('workspace_id', '=', workspaceId)
    .where('name', '=', input.name)
    .executeTakeFirst();
  const projectId = existing?.id ?? (await createProject(db, workspaceId, userId, input)).id;
  const set = await db
    .selectFrom('prompt_sets')
    .select('prompt_sets.id')
    .innerJoin('projects', 'projects.id', 'prompt_sets.project_id')
    .where('projects.workspace_id', '=', workspaceId)
    .where('projects.id', '=', projectId)
    .executeTakeFirst();
  const setId =
    set?.id ??
    (
      await createPromptSet(db, workspaceId, {
        project_id: projectId,
        name: agency ? 'Awning Prompts' : 'Core Discovery Set',
        description: '',
      })
    ).id;
  const specs = agency
    ? devSeed.agencyPrompts.map(([text, intent]) => [text, intent, 'active', 'manual'] as const)
    : devSeed.prompts;
  for (const [text, intent, status, origin] of specs) {
    const present = await db
      .selectFrom('prompts')
      .select('id')
      .where('prompt_set_id', '=', setId)
      .where('text', '=', text)
      .executeTakeFirst();
    if (present) continue;
    const prompt = await createPrompt(
      db,
      workspaceId,
      setId,
      promptInput.parse({
        text,
        intent,
        theme: agency ? 'awnings' : 'backpacks',
        enabled: status !== 'archived',
      }),
    );
    // Proposed/archived/imported rows are explicit fixtures; activation is never inferred.
    await db
      .updateTable('prompts')
      .set({ status, origin })
      .where('id', '=', prompt.id)
      .where('prompt_set_id', '=', setId)
      .execute();
  }
  return { workspaceId, projectId, setId };
}

async function providers(
  db: Database,
  workspaceId: string,
  userId: string,
  encryptionKey: string,
  agency: boolean,
) {
  const engines = agency ? (['gemini'] as const) : (['chatgpt', 'claude', 'gemini'] as const);
  const transport = { chatgpt: 'openai', claude: 'anthropic', gemini: 'google' } as const;
  for (const engine of engines) {
    const label = `${engine} (dev key)`;
    const existing = await db
      .selectFrom('provider_connections')
      .select('id')
      .where('workspace_id', '=', workspaceId)
      .where('label', '=', label)
      .executeTakeFirst();
    if (existing) continue;
    const row = await createConnection(
      db,
      workspaceId,
      userId,
      createConnectionInput.parse({
        label,
        transport_provider: transport[engine],
        api_key: `dev-fake-key-for-${engine}`,
        routes: [{ logical_engine: engine, is_default: true }],
      }),
      encryptionKey,
      providerSettings({}),
    );
    // Fixture readiness only: all execution below has an explicit recorded transport.
    await db
      .updateTable('provider_connections')
      .set({ last_test_status: 'ok', last_tested_at: new Date() })
      .where('workspace_id', '=', workspaceId)
      .where('id', '=', row.id)
      .execute();
  }
}

export async function seedStatic(db: Database, config: ServiceConfig, encryptionKey: string) {
  const main = await provisionDevelopmentLogin(db, config, {
    email: devSeed.email,
    password: devSeed.password,
    allowance: devSeed.allowance,
  });
  const agency = await provisionDevelopmentLogin(db, config, {
    email: devSeed.agencyEmail,
    password: devSeed.password,
    allowance: devSeed.allowance,
  });
  await initializeCatalog(db, main.email, null);
  for (const [identity, name] of [
    [main, devSeed.workspace],
    [agency, devSeed.agencyWorkspace],
  ] as const)
    await db
      .updateTable('workspaces')
      .set({ name, updated_at: new Date() })
      .where('id', '=', identity.workspace_id)
      .where('is_system', '=', false)
      .execute();
  const now = new Date();
  await db
    .insertInto('workspace_members')
    .values({
      id: randomUUID(),
      workspace_id: agency.workspace_id,
      user_id: main.user_id,
      role: 'admin',
      product_tour_status: 'not_started',
      created_at: now,
      updated_at: now,
    })
    .onConflict((c) => c.columns(['workspace_id', 'user_id']).doNothing())
    .execute();
  const primary = await project(db, main.workspace_id, main.user_id, false);
  const secondary = await project(db, agency.workspace_id, agency.user_id, true);
  await providers(db, main.workspace_id, main.user_id, encryptionKey, false);
  await providers(db, agency.workspace_id, agency.user_id, encryptionKey, true);
  return { main, agency, primary, secondary };
}
export type StaticSeed = Awaited<ReturnType<typeof seedStatic>>;
