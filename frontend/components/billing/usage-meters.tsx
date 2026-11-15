import { useQuery } from '@tanstack/react-query';

import {
  Section,
  SectionContent,
  SectionDescription,
  SectionHeader,
  SectionTitle,
} from '@/components/ui/section';
import { ExpiryLine, UsageMeter, usageLabel } from '@/components/billing/usage-meter';
import { Absence } from '@/components/ui/absence';
import { AppGrid } from '@/components/ui/app-grid';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { Stack } from '@/components/ui/layout';
import { TableCell, TableRow } from '@/components/ui/table';
import { billingQueries, type billingApi, type UsageItem } from '@/lib/api/billing';
import { formatCount } from '@/lib/format';
import { useActiveWorkspaceId } from '@/lib/project/project-context';
import { Notice, readErrorProps } from '@/components/ui/notice';
import { StateBlock } from '@/components/ui/state-block';

/**
 * Preferred display order. Rows the backend sends that are not listed here
 * still render, after these — the list is an ordering hint, not a filter, so a
 * new backend counter appears without a frontend change.
 */
const PREFERRED_ORDER = [
  'prompt_slots',
  'project_slots',
  'manual_runs_per_day',
  'prompt_runs_per_period',
  'ai_credits',
];

function ordered(items: readonly UsageItem[]): UsageItem[] {
  return [...items].sort((a, b) => {
    const ai = PREFERRED_ORDER.indexOf(a.key);
    const bi = PREFERRED_ORDER.indexOf(b.key);
    if (ai === -1 && bi === -1) return a.key.localeCompare(b.key);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

type UsageRead = ReturnType<typeof useQuery<Awaited<ReturnType<typeof billingApi.usage>>>>;

/**
 * Every quota measured, and none used or held: a measured zero, never an
 * unresolved allowance, an unread count or a reservation, which keep their meters.
 */
function nothingUsed(items: readonly UsageItem[]): boolean {
  return (
    items.length > 0 &&
    items.every((item) => item.limit_state !== 'unknown' && item.consumed === 0 && !item.reserved)
  );
}

/**
 * Account usage, extracted from `BillingScreen` so plan orchestration and
 * meter rendering have separate owners.
 *
 * Fails closed on an unresolved entitlement: an account whose fold did not
 * resolve has no verified allowance, and showing meters against unverified
 * numbers would be worse than showing none.
 */
export function UsageMeters({ enabled = true }: Readonly<{ enabled?: boolean }>) {
  const workspaceId = useActiveWorkspaceId();
  const usageQuery = useQuery({ ...billingQueries.usage(workspaceId), enabled });
  const idle =
    enabled && usageQuery.data?.status === 'resolved' && nothingUsed(usageQuery.data.items);

  return (
    <Section aria-labelledby="usage-title">
      <SectionHeader>
        <SectionTitle id="usage-title">Usage</SectionTitle>
        <SectionDescription>
          {idle
            ? 'Nothing used yet this period.'
            : 'Measured against the allowances your active grants provide.'}
        </SectionDescription>
      </SectionHeader>
      {/* The meters take the card's full width at every size (Settings template). */}
      <SectionContent data-settings-wide="">
        <UsageBody enabled={enabled} query={usageQuery} />
      </SectionContent>
    </Section>
  );
}

function UsageBody({ enabled, query }: Readonly<{ enabled: boolean; query: UsageRead }>) {
  if (!enabled || query.isLoading) {
    return <StateBlock kind="loading" label="Loading usage…" />;
  }
  if (query.isError || !query.data) {
    return (
      <Notice
        kind="read"
        title="Couldn't load usage"
        {...readErrorProps(query)}
        fallback="Could not load usage. Check your connection and retry."
      />
    );
  }
  if (query.data.status !== 'resolved') {
    return (
      <Notice tone="warning">
        Your entitlement could not be resolved, so usage is unavailable. Contact support if this
        persists.
      </Notice>
    );
  }
  const items = ordered(query.data.items);
  if (items.length === 0) {
    return (
      <StateBlock kind="empty" inline message="No measurable allowances on this account yet." />
    );
  }
  if (nothingUsed(items)) return <QuotaTable items={items} />;
  return (
    <AppGrid layout="cells">
      {items.map((item) => (
        <UsageMeter key={item.key} item={item} />
      ))}
    </AppGrid>
  );
}

const QUOTA_COLUMNS: readonly DataTableColumn[] = [
  { key: 'quota', label: 'Quota' },
  { key: 'limit', label: 'Limit', width: 'figure', kind: 'number' },
];

/** With nothing used, a meter per quota is an empty bar each; the limits read as one table. */
function QuotaTable({ items }: Readonly<{ items: readonly UsageItem[] }>) {
  return (
    <DataTable label="Usage limits" columns={QUOTA_COLUMNS}>
      {items.map((item) => (
        <QuotaRow key={item.key} item={item} />
      ))}
    </DataTable>
  );
}

/** The quota's name over its reset or expiry, and its limit. */
function QuotaRow({ item }: Readonly<{ item: UsageItem }>) {
  const { label, unit } = usageLabel(item);
  return (
    <TableRow>
      <TableCell>
        <Stack gap="tight">
          <span>{label}</span>
          <ExpiryLine item={item} unit={unit} />
        </Stack>
      </TableCell>
      <TableCell numeric>
        <QuotaLimit item={item} />
      </TableCell>
    </TableRow>
  );
}

function QuotaLimit({ item }: Readonly<{ item: UsageItem }>) {
  if (item.limit_state === 'unlimited') return <>Unlimited</>;
  const allowance = item.allowance ?? 0;
  if (allowance === 0) return <Absence state="not_applicable" label="Not included" />;
  return <>{formatCount(allowance)}</>;
}
