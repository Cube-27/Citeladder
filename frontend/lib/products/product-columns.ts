'use client';

import { useState } from 'react';

import type { CommerceProductRow } from '@citeladder/contracts/commerce-suite';

import { formatCount, formatPercent } from '@/lib/format';

/**
 * The Products table's metric columns, in order (the plan's "Metric
 * definitions", formula version 1). The product column is always shown; the
 * reader hides any of these from the column settings.
 */
export const PRODUCT_COLUMNS = [
  {
    key: 'visibility',
    label: 'Visibility',
    hint: 'Share of answers in the window that named the product.',
  },
  { key: 'appearances', label: 'Appearances', hint: 'Answers that named the product.' },
  {
    key: 'win_rate',
    label: 'Win rate',
    hint: 'Of the ranked answers that named it, the share that ranked it first.',
  },
  {
    key: 'position',
    label: 'Position',
    hint: 'Its mean rank in the answers that ranked it; a carousel rank counts first.',
  },
  {
    key: 'mentioned_price',
    label: 'Mentioned price',
    hint: 'Median price the answers quoted; other currencies are counted, not converted.',
  },
  { key: 'catalog_price', label: 'Catalog price', hint: 'The price in your catalog.' },
  { key: 'merchants', label: 'Merchants', hint: 'Where the answers send shoppers to buy it.' },
] as const;

export type ProductColumnKey = (typeof PRODUCT_COLUMNS)[number]['key'];

/**
 * A cell's text, or the state that stands in for a missing value: no answer
 * in scope is `unavailable`, a price the catalog lacks is `unknown`. A real
 * zero is text ("0", "0%"), never a state.
 */
export type ProductCell =
  | Readonly<{ kind: 'value'; text: string; note?: string }>
  | Readonly<{ kind: 'missing'; state: 'unavailable' | 'unknown' | 'none' }>;

const missing = (state: 'unavailable' | 'unknown' | 'none'): ProductCell => ({
  kind: 'missing',
  state,
});

/** A price in its currency when the code is a currency, else the bare amount. */
export function formatPrice(amount: number, currency: string): string {
  if (/^[A-Z]{3}$/u.test(currency)) {
    try {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
    } catch {
      // An unknown code falls through to the bare amount with its code.
    }
  }
  const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(amount);
  return currency ? `${number} ${currency}` : number;
}

export function productCell(row: CommerceProductRow, key: ProductColumnKey): ProductCell {
  switch (key) {
    case 'visibility':
      return row.visibility === null
        ? missing('unavailable')
        : { kind: 'value', text: formatPercent(row.visibility, 1) };
    case 'appearances':
      return { kind: 'value', text: formatCount(row.appearances) };
    case 'win_rate':
      return row.win_rate === null
        ? missing('unavailable')
        : { kind: 'value', text: formatPercent(row.win_rate, 1) };
    case 'position':
      return row.position === null
        ? missing('unavailable')
        : { kind: 'value', text: row.position.toFixed(1) };
    case 'mentioned_price': {
      const { median, currency, other_currency } = row.mentioned_price;
      const note = other_currency
        ? `+${formatCount(other_currency)} in other currencies`
        : undefined;
      return median === null
        ? missing('unavailable')
        : { kind: 'value', text: formatPrice(median, currency), note };
    }
    case 'catalog_price': {
      const price = row.catalog_price;
      if (price === null) return missing(row.kind === 'owned' ? 'unknown' : 'none');
      const text =
        price.min === price.max
          ? formatPrice(price.min, price.currency)
          : `${formatPrice(price.min, price.currency)}–${formatPrice(price.max, price.currency)}`;
      return { kind: 'value', text };
    }
    case 'merchants':
      return row.merchants.length
        ? {
            kind: 'value',
            text: row.merchants
              .map((merchant) => `${merchant.domain} (${formatCount(merchant.count)})`)
              .join(', '),
          }
        : missing('none');
    default: {
      const exhaustive: never = key;
      return exhaustive;
    }
  }
}

const HOLDER_LABELS = {
  owned: 'Your product',
  approved_competitor: 'Competitor',
  ai_observed_competitor: 'Seen in answers',
} as const satisfies Record<CommerceProductRow['kind'], string>;

export const holderLabel = (kind: CommerceProductRow['kind']) => HOLDER_LABELS[kind];

/** A cell as CSV text: a missing value is an empty field, not a word. */
const csvText = (cell: ProductCell) => (cell.kind === 'value' ? cell.text : '');

/** The shown columns' headers and rows, for the export of the rows on screen. */
export function productCsv(
  rows: readonly CommerceProductRow[],
  columns: readonly ProductColumnKey[],
): { headers: string[]; rows: string[][] } {
  const shown = PRODUCT_COLUMNS.filter((column) => columns.includes(column.key));
  return {
    headers: ['Product', 'Brand', 'Holder', 'URL', ...shown.map((column) => column.label)],
    rows: rows.map((row) => [
      row.name,
      row.brand,
      holderLabel(row.kind),
      row.url,
      ...shown.map((column) => csvText(productCell(row, column.key))),
    ]),
  };
}

const STORAGE_KEY = 'citeladder:commerce:product-columns';
const ALL_KEYS = PRODUCT_COLUMNS.map((column) => column.key);
const isColumnKey = (value: unknown): value is ProductColumnKey =>
  ALL_KEYS.some((key) => key === value);

function storedColumns(): ProductColumnKey[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (Array.isArray(parsed)) return ALL_KEYS.filter((key) => parsed.some((v) => v === key));
  } catch {
    // Unreadable storage keeps every column.
  }
  return [...ALL_KEYS];
}

/**
 * The shown metric columns, a reader preference kept per browser. Hiding a
 * column changes what is drawn and exported, never what is read.
 */
export function useProductColumns() {
  const [shown, setShown] = useState<ProductColumnKey[]>(storedColumns);
  const toggle = (key: ProductColumnKey) => {
    const next = shown.includes(key)
      ? shown.filter((value) => value !== key)
      : ALL_KEYS.filter((value) => value === key || shown.includes(value));
    setShown(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next.filter(isColumnKey)));
    } catch {
      // A browser without storage keeps the choice for this visit.
    }
  };
  return { shown, toggle };
}
