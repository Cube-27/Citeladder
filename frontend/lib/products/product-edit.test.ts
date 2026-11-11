import { describe, expect, it } from 'vite-plus/test';

import { productEditChanges, productEditForm } from './product-edit';

const initial = productEditForm(
  {
    name: 'Road Runner',
    brand: 'Acme',
    description: '',
    url: 'https://shop.example/road',
  },
  {
    lifecycle_state: 'active',
    price: 120,
    currency: 'USD',
    sku: 'RR-1',
    gtin: '',
    mpn: '',
    image_url: '',
    categories: ['Road'],
  },
);

describe('productEditChanges', () => {
  it('sends only changed fields, with a cleared price as null and currency upper-cased', () => {
    expect(
      productEditChanges(initial, {
        ...initial,
        brand: 'Acme Co',
        price: '',
        currency: 'eur',
        categories: ['road', 'Trail'],
      }),
    ).toEqual({
      kind: 'edit',
      edit: { brand: 'Acme Co', price: null, currency: 'EUR', categories: ['road', 'Trail'] },
    });
  });

  it('treats the same category set in another case as unchanged', () => {
    expect(productEditChanges(initial, { ...initial, categories: ['ROAD'] })).toEqual({
      kind: 'unchanged',
    });
  });

  it('refuses a price that is not a number and an empty name', () => {
    expect(productEditChanges(initial, { ...initial, price: 'twelve' })).toEqual({
      kind: 'invalid',
      message: 'Price must be a number',
    });
    expect(productEditChanges(initial, { ...initial, name: ' ' }).kind).toBe('invalid');
  });
});
