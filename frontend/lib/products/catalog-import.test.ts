import { describe, expect, it } from 'vite-plus/test';

import { catalogTemplateCsv, leftOutCategories } from './catalog-import';

const node = (key: string, parent_key: string | null) => ({
  key,
  name: key,
  parent_key,
  depth: 0,
  product_count: 1,
  existing: false,
});

describe('the Add products helpers', () => {
  it('builds the template with the required columns first and one example row', () => {
    expect(catalogTemplateCsv().split('\n')[0]).toBe(
      'title,brand,description,price,currency,link,image_link,category,sku,gtin',
    );
    expect(catalogTemplateCsv().split('\n')[1]).toContain('Footwear > Running');
  });

  it('leaves out an unticked category and everything under it', () => {
    const tree = [
      node('footwear', null),
      node('running', 'footwear'),
      node('trail', 'running'),
      node('sale', null),
    ];
    expect([...leftOutCategories(tree, new Set(['running']))]).toEqual(['running', 'trail']);
    expect([...leftOutCategories(tree, new Set())]).toEqual([]);
  });
});
