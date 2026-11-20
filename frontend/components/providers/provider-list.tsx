import { useQuery } from '@tanstack/react-query';

import { ledgerClasses } from '@/components/ui/workspace';
import { providerQueries } from '@/lib/api/providers';
import type { LogicalEngine } from '@citeladder/contracts';
import { buildEngineCards, buildProviderGroups, transportForEngine } from '@/lib/providers/catalog';
import { useActiveWorkspaceId } from '@/lib/project/project-context';

import { ProviderRow } from './provider-row';
import { StateBlock } from '@/components/ui/state-block';

/**
 * The workspace's BYOK credentials, one row per provider. Shared by Settings
 * and the launch dialog's inline setup so both connect the same way.
 *
 * Rows are driven by `/provider-catalog`: a transport appears once, with every
 * engine it measures, so one DataForSEO login covers all its surfaces.
 * `expandEngine` opens the row that measures that engine on arrival (the
 * launch dialog's clicked engine chip). Settings draws no rule between rows
 * (`ruled={false}`); the launch dialog keeps them.
 */
export function ProviderList({
  expandEngine = null,
  ruled = true,
}: Readonly<{ expandEngine?: LogicalEngine | null; ruled?: boolean }>) {
  const catalogQuery = useQuery(providerQueries.catalog());
  const workspaceId = useActiveWorkspaceId();
  const connectionsQuery = useQuery({
    ...providerQueries.connections(workspaceId),
    enabled: workspaceId !== null,
  });
  // A failure here leaves every row at its fail-closed default.
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
        fallback="Couldn't load providers. Check your connection and try again."
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
    <ul className={ruled ? ledgerClasses() : 'grid'}>
      {groups.map((group) => (
        <ProviderRow
          key={group.transport}
          group={group}
          connections={connections}
          defaultOpen={group.transport === expand}
        />
      ))}
    </ul>
  );
}
