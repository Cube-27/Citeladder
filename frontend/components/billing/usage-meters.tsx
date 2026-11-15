import { useQuery } from '@tanstack/react-query';

import {
  Section,
  SectionContent,
  SectionDescription,
  SectionHeader,
  SectionTitle,
} from '@/components/ui/section';
import { UsageMeter } from '@/components/billing/usage-meter';
import { billingQueries, type billingApi, type UsageItem } from '@/lib/api/billing';
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

  return (
    <Section aria-labelledby="usage-title">
      <SectionHeader>
        <SectionTitle id="usage-title">Usage</SectionTitle>
        <SectionDescription>
          Measured against the allowances your active grants provide.
        </SectionDescription>
      </SectionHeader>
      {/* The meters take the card's full width at every size (Settings template). */}
      <SectionContent data-settings-wide="">
        <UsageBody enabled={enabled} query={usageQuery} />
      </SectionContent>
    </Section>
  );
}

function UsageBody({
  enabled,
  query,
}: Readonly<{
  enabled: boolean;
  query: ReturnType<typeof useQuery<Awaited<ReturnType<typeof billingApi.usage>>>>;
}>) {
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
  // Cells of at least 220px that drop a column before a label could break.
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(13.75rem,1fr))] gap-4">
      {items.map((item) => (
        <UsageMeter key={item.key} item={item} />
      ))}
    </div>
  );
}
