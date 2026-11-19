import { useQuery } from '@tanstack/react-query';

import { Section, SectionContent, SectionHeader, SectionTitle } from '@/components/ui/section';
import { UsageTable } from '@/components/billing/usage-meter';
import { textRole } from '@/components/ui/typography';
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

type UsageRead = ReturnType<typeof useQuery<Awaited<ReturnType<typeof billingApi.usage>>>>;

/**
 * Every quota measured, and none used or held: a measured zero, never an
 * unresolved allowance, an unread count or a reservation, which never read as no usage.
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
export function UsageMeters() {
  const workspaceId = useActiveWorkspaceId();
  const usageQuery = useQuery(billingQueries.usage(workspaceId));
  const idle = usageQuery.data?.status === 'resolved' && nothingUsed(usageQuery.data.items);

  return (
    <Section aria-labelledby="usage-title">
      <SectionHeader>
        <SectionTitle id="usage-title">Usage</SectionTitle>
        {idle ? (
          <p className={textRole('caption', 'text-ink-2')}>No usage yet this period</p>
        ) : null}
      </SectionHeader>
      <SectionContent>
        <UsageBody query={usageQuery} />
      </SectionContent>
    </Section>
  );
}

function UsageBody({ query }: Readonly<{ query: UsageRead }>) {
  if (query.isLoading) {
    return (
      <StateBlock kind="loading" label="Loading usage…" shape={{ kind: 'table', columns: 4 }} />
    );
  }
  if (query.isError || !query.data) {
    return (
      <Notice
        kind="read"
        title="Couldn't load usage"
        {...readErrorProps(query)}
        fallback="Couldn't load usage. Check your connection and retry."
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
  return <UsageTable items={items} />;
}
