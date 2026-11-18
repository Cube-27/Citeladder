import type { RankingRow } from '@citeladder/contracts';

import { BrandMark } from '@/components/ui/brand-mark';

/**
 * A brand's mark from a ranking read that names it: the tracked brand when
 * `name` is null, else the competitor of that name. The letter holds the
 * place until the read loads, so the name beside it never moves.
 */
export function RankedBrandMark({
  rows,
  name,
}: Readonly<{
  rows: readonly Pick<RankingRow, 'name' | 'is_brand' | 'logo_url' | 'website_url'>[] | undefined;
  name: string | null;
}>) {
  const row = rows?.find((entry) =>
    name === null ? entry.is_brand : !entry.is_brand && entry.name === name,
  );
  return (
    <BrandMark
      name={row?.name ?? name ?? 'You'}
      logoUrl={row?.logo_url}
      websiteUrl={row?.website_url}
      placement="inline"
    />
  );
}
