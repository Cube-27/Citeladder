/** Browser-side helpers for the Add products dialog: the CSV template and the category review. */
import { CATALOG_TEMPLATE_COLUMNS } from '@citeladder/contracts/commerce-requests';
import type { CatalogCategoryProposal } from '@citeladder/contracts/commerce-suite';

/** One example row under the template header, in column order. */
const EXAMPLE: Record<(typeof CATALOG_TEMPLATE_COLUMNS)[number], string> = {
  title: 'Trail Runner',
  brand: 'Your brand',
  description: 'Light trail running shoe',
  price: '120.00',
  currency: 'USD',
  link: 'https://www.example.com/products/trail-runner',
  image_link: 'https://www.example.com/images/trail-runner.jpg',
  category: 'Footwear > Running',
  sku: 'TR-001',
  gtin: '',
};

/** The downloadable CSV template: the header and one example row. */
export function catalogTemplateCsv(): string {
  const row = CATALOG_TEMPLATE_COLUMNS.map((column) => EXAMPLE[column]);
  return `${CATALOG_TEMPLATE_COLUMNS.join(',')}\n${row.join(',')}\n`;
}

/**
 * The proposed categories left out: each one the person unticked and every
 * category under it, since a product joins a path only up to its first
 * left-out category.
 */
export function leftOutCategories(
  tree: readonly CatalogCategoryProposal[],
  unticked: ReadonlySet<string>,
): Set<string> {
  const parents = new Map(tree.map((node) => [node.key, node.parent_key]));
  const out = new Set<string>();
  for (const node of tree) {
    const seen = new Set<string>();
    for (let key: string | null = node.key; key && !seen.has(key); key = parents.get(key) ?? null) {
      seen.add(key);
      if (unticked.has(key)) {
        out.add(node.key);
        break;
      }
    }
  }
  return out;
}
