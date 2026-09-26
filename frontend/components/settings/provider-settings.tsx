'use client';

import { useQuery } from '@tanstack/react-query';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AppModelCard } from '@/components/providers/app-model-card';
import { ProviderList } from '@/components/providers/provider-list';
import { providersApi } from '@/lib/api/providers';
import { queryKeys } from '@/lib/api/query-keys';
import { useActiveWorkspaceId } from '@/lib/project/project-context';

/**
 * BYOK Provider Settings panel, rendered inside the Settings screen's
 * "Providers" tab.
 *
 * Measurement credentials come first as one list row per provider — a
 * DataForSEO login is entered once and serves every consumer-app and search
 * surface — then the Agent's optional customer model route.
 */
export function ProviderSettings() {
  const workspaceId = useActiveWorkspaceId();
  const connectionsQuery = useQuery({
    queryKey: queryKeys.providers.connections(workspaceId ?? 'unresolved'),
    queryFn: ({ signal }) => providersApi.listConnections({ signal, workspaceId }),
    enabled: workspaceId !== null,
  });
  const connections = connectionsQuery.data ?? [];

  return (
    <div className="grid gap-[var(--workspace-gap)]" data-tour="provider-settings">
      <Card>
        <CardHeader>
          <CardTitle>Measurement providers</CardTitle>
          <CardDescription>
            Bring your own credentials. Each provider is entered once and measures every engine
            listed with it. Saving runs a connection test; stored secrets are never displayed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProviderList />
        </CardContent>
      </Card>

      {connectionsQuery.isLoading ? (
        <Skeleton className="h-72 w-full" />
      ) : (
        <AppModelCard
          key={
            connections.find((connection) => (connection.app_routes?.length ?? 0) > 0)?.id ??
            'new-app-model'
          }
          connections={connections}
        />
      )}
    </div>
  );
}
