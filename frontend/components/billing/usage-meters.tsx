import { useQuery } from '@tanstack/react-query';

import { SettingsGroup } from '@/components/ui/setting-row';
import { UsageTable } from '@/components/billing/usage-meter';
import { billingQueries, type billingApi, type UsageItem } from '@/lib/api/billing';
import { useActiveWorkspaceId } from '@/lib/project/project-context';
import { Notice, readErrorProps } from '@/components/ui/notice';
import { StateBlock } from '@/components/ui/state-block';

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

export function UsageMeters() {
  const workspaceId = useActiveWorkspaceId();
  const usageQuery = useQuery(billingQueries.usage(workspaceId));

  return (
    <SettingsGroup title="Usage">
      <UsageBody query={usageQuery} />
    </SettingsGroup>
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
    return <Notice tone="warning">Entitlement unresolved, so usage is unavailable.</Notice>;
  }
  const items = ordered(query.data.items);
  if (items.length === 0) {
    return <StateBlock kind="empty" inline message="No allowances." />;
  }
  return <UsageTable items={items} />;
}
