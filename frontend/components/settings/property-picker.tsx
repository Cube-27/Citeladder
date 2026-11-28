import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { Absence } from '@/components/ui/absence';
import { Dialog } from '@/components/ui/dialog';
import { StatusMark } from '@/components/ui/status-mark';
import { integrationsQueries, type IntegrationConnection } from '@/lib/api/integrations';
import { useProjectContext, useWorkspaceCapability } from '@/lib/project/project-context';
import { ClampText } from '@/components/ui/clamp-text';
import { Text } from '@/components/ui/typography';
import { activeMappingFor } from '@/components/integrations/data-sources';
import {
  PropertyDiscoveryState,
  PropertyOptions,
  PropertySaveFailure,
  usePropertyDiscovery,
} from '@/components/integrations/property-options';
import { PROVIDER_META } from '@/components/settings/grant-model';
import { Notice } from '@/components/ui/notice';

export function useActiveMapping(
  workspaceId: string,
  connectionId: string,
  projectId: string | null,
) {
  const query = useQuery(integrationsQueries.mappings(workspaceId, connectionId));
  return activeMappingFor(query.data, projectId);
}

export function SelectedPropertyMark({
  connection,
}: Readonly<{ connection: IntegrationConnection }>) {
  const { activeProject } = useProjectContext();
  const mappings = useQuery(integrationsQueries.mappings(connection.workspace_id, connection.id));
  if (mappings.isPending)
    return (
      <Text variant="code" aria-hidden>
        {' '}
      </Text>
    );
  if (mappings.isError) return <Absence state="unavailable" label="Property unavailable" />;
  const selected = activeMappingFor(mappings.data, activeProject?.id ?? null)?.property_ref ?? '';
  if (!selected) return <StatusMark tone="warning">No property selected</StatusMark>;
  return (
    <ClampText text="code" tone="ink-2">
      {selected}
    </ClampText>
  );
}

export function usePropertyPicker(connection: IntegrationConnection) {
  const { activeProject } = useProjectContext();
  const mayDiscover = useWorkspaceCapability('manage_credentials');
  const activeMapping = useActiveMapping(
    connection.workspace_id,
    connection.id,
    activeProject?.id ?? null,
  );
  const [open, setOpen] = useState(false);
  const { discovery, select, pendingRef } = usePropertyDiscovery(connection);
  const selectProperty = (propertyRef: string) => {
    if (!activeProject) return;
    select.mutate(
      { provider: connection.provider, property_ref: propertyRef, project_id: activeProject.id },
      { onSuccess: () => setOpen(false) },
    );
  };

  const selected = activeMapping?.property_ref ?? '';
  const noun = PROVIDER_META[connection.provider].noun;
  const verb = selected ? 'Change' : 'Select';
  const discover = () => discovery.mutate(activeProject?.id);
  const openPicker = () => {
    if (discovery.isPending) return;
    discovery.reset();
    setOpen(true);
    discover();
  };

  const dialog = mayDiscover ? (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!select.isPending) setOpen(next);
      }}
      title={`Choose a ${noun}`}
    >
      <>
        {!activeProject ? <Notice tone="warning">No active project.</Notice> : null}
        <PropertyDiscoveryState
          provider={connection.provider}
          discovery={discovery}
          onRetry={discover}
        />
        {discovery.data?.length ? (
          <PropertyOptions
            provider={connection.provider}
            properties={discovery.data}
            selected={selected}
            blocked={!activeProject}
            pendingRef={pendingRef}
            onSelect={selectProperty}
          />
        ) : null}
        <PropertySaveFailure error={select.error} />
      </>
    </Dialog>
  ) : null;

  return {
    allowed: mayDiscover,
    verb,
    label: `${verb} ${noun}`,
    pending: discovery.isPending,
    open: openPicker,
    dialog,
  };
}
