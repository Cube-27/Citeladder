import type { NamedBrand } from '@citeladder/contracts';

import { Absence } from '@/components/ui/absence';
import { MarkStack } from '@/components/ui/mark-stack';

export function NamedBrandMarks({
  brands,
  total,
  answers,
}: Readonly<{ brands: readonly NamedBrand[]; total: number; answers: string }>) {
  if (!brands.length) return <Absence state="none" />;
  return (
    <MarkStack
      marks={brands.map((brand) => ({
        key: `${brand.kind}:${brand.name}`,
        tip: `${brand.name}: named in ${brand.responses} of ${answers}`,
        mark: { name: brand.name, logoUrl: brand.logo_url, websiteUrl: brand.website },
      }))}
      more={total - brands.length}
    />
  );
}
