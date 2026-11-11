import { randomUUID } from 'node:crypto';
import type {
  CatalogImport,
  CommerceCatalog,
  CommerceProduct,
  CommerceProductDetail,
  CommerceProductPage,
} from '@citeladder/contracts/commerce-suite';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../src/app.ts';
import { sessionToken, testConfig, testDatabase } from './support.ts';
import { VisibilityFixtures, type Tenant } from './visibility-fixtures.ts';

const db = testDatabase();
const fixtures = new VisibilityFixtures(db);
const config = testConfig();
const app = createApp(config, db);
let t: Tenant;
beforeEach(async () => {
  t = await fixtures.tenant();
});
afterAll(async () => {
  await fixtures.cleanup();
  await db.destroy();
});

async function call<T>(
  path: string,
  options: { method?: string; body?: unknown; tenant?: Tenant } = {},
) {
  const tenant = options.tenant ?? t;
  const token = await sessionToken({ sub: tenant.userId, ver: 0 });
  const response = await app.request(`/api/v1/projects/${tenant.projectId}/commerce${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'x-workspace-id': tenant.workspaceId,
      cookie: `${config.session.cookieName}=${token}`,
      'content-type': 'application/json',
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  return { status: response.status, body: (await response.json()) as T };
}

const importCsv = (content: string, tenant?: Tenant) =>
  call<CatalogImport>('/catalog/import', { method: 'POST', body: { content }, tenant });
const edit = (id: string, body: unknown, tenant?: Tenant) =>
  call<CommerceProduct>(`/products/${id}`, { method: 'PATCH', body, tenant });
const lifecycle = (id: string, state: string, tenant?: Tenant) =>
  call<CommerceProduct>(`/products/${id}/lifecycle`, {
    method: 'PUT',
    body: { lifecycle_state: state },
    tenant,
  });

const ONE =
  'canonical_url,name,price,sku,category\nhttps://shop.example/products/one,"One, large",19.25,A1,Tools\n';

async function importedProduct(tenant?: Tenant) {
  const imported = await importCsv(ONE, tenant);
  return imported.body.row_outcomes[0]!.product_id!;
}

async function stored(id: string) {
  return db
    .selectFrom('commerce_products')
    .select(['name', 'brand', 'price', 'sku', 'canonical_url', 'lifecycle_state'])
    .where('id', '=', id)
    .executeTakeFirstOrThrow();
}

async function categoryNames(id: string) {
  const detail = await call<CommerceProductDetail>(`/products/${id}`);
  return detail.body.product.catalog?.categories;
}

describe('product edits', () => {
  it('wins over CSV until a later import changes the field, appending edit observations', async () => {
    const id = await importedProduct();
    const edited = await edit(id, {
      name: 'Edited',
      price: 21,
      categories: ['Gear'],
      image_url: 'https://cdn.example/one.png',
    });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({ id, name: 'Edited' });

    // The row repeats every value it imported before, and adds a brand.
    const repeat = await importCsv(
      'canonical_url,name,price,sku,category,brand\nhttps://shop.example/products/one,"One, large",19.25,A1,Tools,Acme\n',
    );
    expect(repeat.status).toBe(201);
    expect(await stored(id)).toMatchObject({ name: 'Edited', price: '21.00', brand: 'Acme' });
    expect(await categoryNames(id)).toEqual(['Gear']);

    // A new imported name changes the field; the untouched price keeps its edit.
    await importCsv('sku,name,price,category\nA1,Renamed,19.25,Outdoor\n');
    expect(await stored(id)).toMatchObject({ name: 'Renamed', price: '21.00' });
    expect(await categoryNames(id)).toEqual(['Gear', 'Outdoor']);

    const detail = await call<CommerceProductDetail>(`/products/${id}`);
    expect(detail.body.product).toMatchObject({
      name: 'Renamed',
      image_url: 'https://cdn.example/one.png',
      catalog: {
        lifecycle_state: 'active',
        price: 21,
        sku: 'A1',
        image_url: 'https://cdn.example/one.png',
      },
    });

    const observations = await db
      .selectFrom('commerce_product_observations')
      .select(['source_kind', 'edit_version'])
      .where('product_id', '=', id)
      .orderBy('created_at')
      .execute();
    expect(observations.map((row) => row.source_kind)).toEqual(['csv', 'edit', 'csv', 'csv']);
    expect(observations[1]!.edit_version).toBe('commerce-product-edit-1');
    const revisions = await db
      .selectFrom('commerce_catalog_revisions')
      .select('source_kind')
      .where('project_id', '=', t.projectId)
      .orderBy('revision_number')
      .execute();
    expect(revisions.map((row) => row.source_kind)).toEqual(['import', 'edit', 'import', 'import']);
  });

  it('matches a re-import of the URL an edit replaced to the edited product', async () => {
    const first = await importCsv('canonical_url,name\nhttps://shop.example/old,Old\n');
    const id = first.body.row_outcomes[0]!.product_id!;
    expect((await edit(id, { canonical_url: 'https://shop.example/new' })).status).toBe(200);

    // The same row in a new file (an identical file is the same import).
    const repeat = await importCsv('name,canonical_url\nOld,https://shop.example/old\n');
    expect(repeat.body.row_outcomes).toEqual([
      { row_number: 2, status: 'unchanged', product_id: id, error_code: '', detail: '' },
    ]);
    expect(await stored(id)).toMatchObject({ canonical_url: 'https://shop.example/new' });
    const catalog = await call<CommerceCatalog>('/catalog');
    expect(catalog.body.products.map((row) => row.id)).toEqual([id]);
  });

  it('clears identifiers, refuses another product identity and invalid values', async () => {
    await importCsv(
      'canonical_url,name,sku\nhttps://shop.example/a,A,A1\nhttps://shop.example/b,B,B1\n',
    );
    const catalog = await call<CommerceCatalog>('/catalog');
    const [a, b] = catalog.body.products;
    expect((await edit(a!.id, { sku: '' })).status).toBe(200);
    expect((await stored(a!.id)).sku).toBeNull();
    expect((await edit(a!.id, { sku: 'B1' })).status).toBe(409);
    expect((await edit(a!.id, { canonical_url: b!.canonical_url })).status).toBe(409);
    for (const body of [{}, { name: '' }, { currency: 'dollars' }, { price: -1 }])
      expect((await edit(a!.id, body)).status).toBe(422);
    expect(await stored(a!.id)).toMatchObject({
      name: 'A',
      canonical_url: 'https://shop.example/a',
    });
  });
});

describe('archive and restore', () => {
  it('moves a product out of the catalog, matching identity and table, keeping its page', async () => {
    const imported = await importCsv(
      'canonical_url,name,category\nhttps://shop.example/a,Ash,Wood\nhttps://shop.example/b,Birch,Wood\n',
    );
    const [ash] = imported.body.row_outcomes.map((row) => row.product_id!);
    const archived = await lifecycle(ash!, 'archived');
    expect(archived.status).toBe(200);
    expect((await stored(ash!)).lifecycle_state).toBe('archived');

    const catalog = await call<CommerceCatalog>('/catalog');
    expect(catalog.body.products.map((row) => row.name)).toEqual(['Birch']);
    expect(catalog.body.categories.map((row) => [row.name, row.product_count])).toEqual([
      ['Wood', 1],
    ]);
    const listed = async (source: string) =>
      (await call<CommerceProductPage>(`/products?source=${source}`)).body.items.map(
        (row) => row.name,
      );
    expect(await listed('catalog')).toEqual(['Birch']);
    expect(await listed('all')).toEqual(['Birch']);
    expect(await listed('archived')).toEqual(['Ash']);
    const page = await call<CommerceProductDetail>(`/products/${ash}`);
    expect(page.status).toBe(200);
    expect(page.body.product.catalog?.lifecycle_state).toBe('archived');

    // New answers match only the active catalog.
    const matched = async () => {
      const revision = await db
        .selectFrom('commerce_catalog_revisions')
        .select(['source_kind', 'identity_snapshot'])
        .where('project_id', '=', t.projectId)
        .orderBy('revision_number', 'desc')
        .executeTakeFirstOrThrow();
      const identity = revision.identity_snapshot as { products: { name: string }[] };
      return [revision.source_kind, identity.products.map((row) => row.name).sort()];
    };
    expect(await matched()).toEqual(['edit', ['Birch']]);
    // Nor does it take new competitors until restored.
    const discover = await call('/competitors/discover', {
      method: 'POST',
      body: { targets: [{ kind: 'product', id: ash }] },
    });
    expect(discover.status).toBe(404);

    expect((await lifecycle(ash!, 'active')).status).toBe(200);
    expect(await listed('catalog')).toEqual(['Ash', 'Birch']);
    expect(await listed('archived')).toEqual([]);
    expect(await matched()).toEqual(['edit', ['Ash', 'Birch']]);
    const id = ash!;
    const kinds = await db
      .selectFrom('commerce_product_observations')
      .select('observed_fields')
      .where('product_id', '=', id)
      .where('source_kind', '=', 'edit')
      .orderBy('created_at')
      .execute();
    expect(kinds.map((row) => row.observed_fields)).toEqual([
      { lifecycle_state: 'archived' },
      { lifecycle_state: 'active' },
    ]);
  });
});

describe('add to tracking', () => {
  it('approves an AI-observed competitor, which the table then lists as approved', async () => {
    const id = await importedProduct();
    const candidateId = randomUUID();
    await db
      .insertInto('commerce_competitor_candidates')
      .values({
        id: candidateId,
        workspace_id: t.workspaceId,
        project_id: t.projectId,
        target_kind: 'product',
        target_id: id,
        canonical_url: 'https://rival.example/products/rival',
        product_name: 'Rival',
        brand_name: 'Rival',
        evidence: '{}',
        source_kind: 'ai_observed',
        state: 'pending',
        created_at: new Date(),
      })
      .execute();
    const kind = async () =>
      (await call<CommerceProductPage>('/products?source=all')).body.items.find(
        (row) => row.holder_id === candidateId,
      )?.kind;
    expect(await kind()).toBe('ai_observed_competitor');
    const approved = await call(`/competitors/${candidateId}`, {
      method: 'PATCH',
      body: { decision: 'approved' },
    });
    expect(approved.status).toBe(200);
    expect(await kind()).toBe('approved_competitor');
  });
});

describe('workspace isolation', () => {
  it("never edits or archives another workspace's product", async () => {
    const other = await fixtures.tenant();
    const theirs = await importedProduct(other);
    expect((await edit(theirs, { name: 'Taken' })).status).toBe(404);
    expect((await lifecycle(theirs, 'archived')).status).toBe(404);
    expect((await call(`/products/${theirs}`)).status).toBe(404);
    expect(await stored(theirs)).toMatchObject({ name: 'One, large', lifecycle_state: 'active' });
    expect(
      await db
        .selectFrom('commerce_product_observations')
        .select('source_kind')
        .where('product_id', '=', theirs)
        .execute(),
    ).toEqual([{ source_kind: 'csv' }]);
  });
});
