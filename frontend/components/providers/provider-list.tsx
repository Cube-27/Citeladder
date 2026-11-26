import { useQuery } from '@tanstack/react-query';

import { SectionBleed } from '@/components/ui/section';
import { providerQueries } from '@/lib/api/providers';
import type { LogicalEngine } from '@citeladder/contracts';
import { buildEngineCards, buildProviderGroups, transportForEngine } from '@/lib/providers/catalog';
import { useActiveWorkspaceId } from '@/lib/project/project-context';

import { ProviderRow } from './provider-row';
import { StateBlock } from '@/components/ui/state-block';

export function ProviderList({
  expandEngine = null,
  compact = false,
}: Readonly<{
  expandEngine?: LogicalEngine | null;
  compact?: boolean;
}>) {
  const catalogQuery = useQuery(providerQueries.catalog());
  const workspaceId = useActiveWorkspaceId();
  const connectionsQuery = useQuery({
    ...providerQueries.connections(workspaceId),
    enabled: workspaceId !== null,
  });
  const statesQuery = useQuery({
    ...providerQueries.states(workspaceId),
    enabled: workspaceId !== null,
  });

  if (catalogQuery.isError || connectionsQuery.isError) {
    return (
      <StateBlock
        kind="error"
        title="Couldn't load providers"
        error={catalogQuery.error ?? connectionsQuery.error}
        fallback="Couldn't load providers. The request failed or timed out."
        onRetry={() => {
          if (catalogQuery.isError) void catalogQuery.refetch();
          if (connectionsQuery.isError) void connectionsQuery.refetch();
        }}
        pending={catalogQuery.isFetching || connectionsQuery.isFetching}
      />
    );
  }
  if (catalogQuery.isLoading || connectionsQuery.isLoading) {
    return <StateBlock kind="loading" label="Loading providers…" shape={{ kind: 'list' }} />;
  }

  const groups = buildProviderGroups(
    buildEngineCards(catalogQuery.data, statesQuery.data?.providers),
  );
  const connections = connectionsQuery.data ?? [];
  const expand = expandEngine ? transportForEngine(groups, expandEngine) : null;
  return (
    <SectionBleed as="ul" rows>
      {groups.map((group) => (
        <ProviderRow
          key={group.transport}
          group={group}
          connections={connections}
          defaultOpen={group.transport === expand}
          compact={compact}
        />
      ))}
    </SectionBleed>
  );
}
