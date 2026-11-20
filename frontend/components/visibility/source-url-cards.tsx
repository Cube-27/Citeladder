import type { ReactNode } from 'react';
import { Bot } from 'lucide-react';
import type { z } from 'zod';

import { StatusMark } from '@/components/ui/status-mark';
import { BrandMark } from '@/components/ui/brand-mark';
import { DataTable, type DataTableColumn, type DataTableState } from '@/components/ui/data-table';
import { Inline, Stack } from '@/components/ui/layout';
import { Skeleton } from '@/components/ui/skeleton';
import { TableCell, TableCellLines, TableRow } from '@/components/ui/table';
import { Absence } from '@/components/ui/absence';
import type { visibilitySourceUrlSchema } from '@citeladder/contracts/visibility-evidence';
import { useEngineCatalog } from '@/lib/providers/engines';
import { count } from '@/lib/visibility/sources';
import { StateBlock } from '@/components/ui/state-block';
import { SectionContent, TitledSection } from '@/components/ui/section';

type UrlDetail = z.infer<typeof visibilitySourceUrlSchema>;

/**
 * The three tables and lists below a URL's overview.
 *
 * Split out of the detail page so that one file holds the page's shape and
 * this one holds its contents. Together they exceeded the complexity ceiling,
 * and the states were the half that made the content hard to find.
 */

/** A card whose body is a table once there is one, and a sentence before then. */
function SectionCard({
  title,
  loading,
  errored,
  empty,
  children,
}: Readonly<{
  title: string;
  loading: boolean;
  /** A read that FAILED has no data, so its empty sentence would be a lie. */
  errored?: boolean;
  empty: string;
  children: ReactNode | null;
}>) {
  return (
    <TitledSection title={title}>
      <SectionContent>
        <SectionBody loading={loading} errored={errored} empty={empty}>
          {children}
        </SectionBody>
      </SectionContent>
    </TitledSection>
  );
}

/**
 * The card's body, once its states are separated from its frame.
 *
 * The error branch comes first and renders NOTHING: "no engine used this page"
 * and "we could not find out" are different answers, and a failed request can
 * only honestly give the second. The page's own alert already reports it.
 */
function SectionBody({
  loading,
  errored,
  empty,
  children,
}: Readonly<{
  loading: boolean;
  errored?: boolean;
  empty: string;
  children: ReactNode | null;
}>) {
  if (errored) return null;
  if (loading) return <Skeleton variant="list" />;
  if (children) return <>{children}</>;
  return <StateBlock kind="empty" inline message={empty} />;
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
  // A failed read shows no state of its own: "no engine used this page" and
  // "we could not find out" are different answers, and the page's own alert
  // already reports the failure, so rows kept from an earlier read are not
  // shown as current either. Only a returned, empty list is "no engine".
  const catalog = useEngineCatalog();
  const rows = errored ? [] : (engines ?? []);
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
    <TitledSection title="Retrievals by AI model">
      <DataTable label="Retrievals by AI model" columns={ENGINE_COLUMNS} state={state}>
        {rows.map((row) => (
          <TableRow key={`${row.logical_engine}:${row.transport_model ?? ''}`}>
            <TableCell>
              <TableCellLines
                primary={catalog.label(row.logical_engine)}
                secondary={catalog.modelLabel(row.logical_engine, row.transport_model)}
              />
            </TableCell>
            <TableCell numeric>{count(row.retrievals) ?? <Absence />}</TableCell>
          </TableRow>
        ))}
      </DataTable>
    </TitledSection>
  );
}

const ENGINE_COLUMNS: readonly DataTableColumn[] = [
  { key: 'model', label: 'Model' },
  { key: 'retrievals', label: 'Retrievals', width: 'figure', kind: 'number' },
];

/**
 * The brands named in the answers that cited this page: co-occurrence in an
 * answer, which the title names, not the page's own inspected presence.
 */
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
    <SectionCard
      title="Named in the answers"
      loading={loading}
      errored={errored}
      empty="No tracked brand was named in the answers citing this URL."
    >
      {brands?.length ? (
        <Stack as="ul" gap="item">
          {brands.map((brand) => (
            <Inline as="li" key={`${brand.kind}:${brand.name}`}>
              <BrandMark name={brand.name} logoUrl={brand.logo_url} websiteUrl={brand.website} />
              <span className="min-w-0 flex-1 truncate">{brand.name}</span>
              <StatusMark
                className="shrink-0"
                variant="classification"
                value={brand.kind === 'brand' ? 'owned' : 'competitor'}
              >
                {count(brand.responses) ?? '0'}
              </StatusMark>
            </Inline>
          ))}
        </Stack>
      ) : null}
    </SectionCard>
  );
}
