import type { ReactNode } from 'react';
import type { z } from 'zod';

import { StatusMark } from '@/components/ui/status-mark';
import { BrandMark } from '@/components/ui/brand-mark';
import { DataTable, type DataTableColumn, type DataTableState } from '@/components/ui/data-table';
import { Inline } from '@/components/ui/layout';
import { TableCell, TableRow } from '@/components/ui/table';
import { Absence } from '@/components/ui/absence';
import type { visibilitySourceUrlSchema } from '@citeladder/contracts/visibility-evidence';
import { Bot } from '@/lib/icons';
import { useEngineCatalog } from '@/lib/providers/engines';
import { count } from '@/lib/visibility/sources';
import { StateBlock } from '@/components/ui/state-block';
import { SectionBleed, TitledSection } from '@/components/ui/section';
import { ClampText } from '@/components/ui/clamp-text';

type UrlDetail = z.infer<typeof visibilitySourceUrlSchema>;

function ListSection({
  title,
  loading,
  errored,
  empty,
  children,
}: Readonly<{
  title: string;
  loading: boolean;
  errored?: boolean;
  empty: string;
  children: ReactNode | null;
}>) {
  return (
    <TitledSection title={title}>
      {errored ? null : (
        <SectionBody loading={loading} empty={empty}>
          {children}
        </SectionBody>
      )}
    </TitledSection>
  );
}

function SectionBody({
  loading,
  empty,
  children,
}: Readonly<{
  loading: boolean;
  empty: string;
  children: ReactNode | null;
}>) {
  if (loading) return <StateBlock kind="loading" shape={{ kind: 'list' }} />;
  if (children) return <>{children}</>;
  return <StateBlock kind="empty" inline message={empty} />;
}

function retrievalsByEngine(engines: UrlDetail['engines']) {
  const totals = new Map<string, number>();
  for (const row of engines) {
    totals.set(row.logical_engine, (totals.get(row.logical_engine) ?? 0) + row.retrievals);
  }
  return [...totals]
    .map(([logical_engine, retrievals]) => ({ logical_engine, retrievals }))
    .sort((left, right) => right.retrievals - left.retrievals);
}

export function EnginesCard({
  engines,
  loading,
  errored,
}: Readonly<{
  engines: UrlDetail['engines'] | undefined;
  loading: boolean;
  errored?: boolean;
}>) {
  const catalog = useEngineCatalog();
  const rows = errored ? [] : retrievalsByEngine(engines ?? []);
  let state: DataTableState | undefined;
  if (!errored && loading) state = { kind: 'loading', label: 'Loading retrievals…' };
  else if (!errored && engines?.length === 0) {
    state = {
      kind: 'empty',
      headingLevel: 3,
      icon: Bot,
      heading: 'No engine used this page in this selection',
    };
  }
  return (
    <DataTable title="Retrievals by engine" columns={ENGINE_COLUMNS} state={state}>
      {rows.map((row) => (
        <TableRow key={row.logical_engine}>
          <TableCell>{catalog.label(row.logical_engine)}</TableCell>
          <TableCell numeric>{count(row.retrievals) ?? <Absence />}</TableCell>
        </TableRow>
      ))}
    </DataTable>
  );
}

const ENGINE_COLUMNS: readonly DataTableColumn[] = [
  { key: 'engine', label: 'Engine' },
  { key: 'retrievals', label: 'Retrievals', width: 'figure', kind: 'number' },
];

export function BrandsCard({
  brands,
  loading,
  errored,
}: Readonly<{
  brands: UrlDetail['brands'] | undefined;
  loading: boolean;
  errored?: boolean;
}>) {
  return (
    <ListSection
      title="Named in the answers"
      loading={loading}
      errored={errored}
      empty="No tracked brand was named in the answers citing this URL."
    >
      {brands?.length ? (
        <SectionBleed as="ul" rows>
          {brands.map((brand) => (
            <Inline as="li" key={`${brand.kind}:${brand.name}`}>
              <BrandMark name={brand.name} logoUrl={brand.logo_url} websiteUrl={brand.website} />
              <ClampText box="fill">{brand.name}</ClampText>
              <StatusMark
                variant="classification"
                value={brand.kind === 'brand' ? 'owned' : 'competitor'}
              >
                {count(brand.responses) ?? '0'}
              </StatusMark>
            </Inline>
          ))}
        </SectionBleed>
      ) : null}
    </ListSection>
  );
}
