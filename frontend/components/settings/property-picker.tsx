import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { Absence } from '@/components/ui/absence';
import { Dialog } from '@/components/ui/dialog';
import { StatusMark } from '@/components/ui/status-mark';
import { Stack } from '@/components/ui/layout';
import { OptionRow } from '@/components/ui/list-row';
import {
  integrationsMutations,
  integrationsQueries,
  type IntegrationConnection,
  type IntegrationProperty,
} from '@/lib/api/integrations';
import { mutationNoticeForError } from '@/lib/api/mutation-notice';
import { useProjectContext, useWorkspaceCapability } from '@/lib/project/project-context';
import { ClampText } from '@/components/ui/clamp-text';
import { textRole } from '@/components/ui/typography';
import { activeMappingFor, ownPropertiesFirst } from '@/components/integrations/data-sources';
import { PROVIDER_META } from '@/components/settings/grant-model';
import { Notice } from '@/components/ui/notice';
import { StateBlock } from '@/components/ui/state-block';

/**
 * One selectable row in the picker list.
 *
 * A button rather than a radio: selecting IS the commit here (there is no
 * separate confirm step), so the row must read as an action.
 */
function PropertyOption({
  property,
  selected,
  disabled,
  pending,
  onSelect,
}: Readonly<{
  property: IntegrationProperty;
  selected: boolean;
  disabled: boolean;
  pending: boolean;
  onSelect: () => void;
}>) {
  return (
    <OptionRow
      title={property.label}
      caption={property.property_ref}
      selected={selected}
      pending={pending}
      disabled={disabled}
      onSelect={onSelect}
    />
  );
}

/**
 * The connection's ACTIVE property mapping for `projectId`, or `null`.
 *
 * The mapping — not `connection.account_ref` — is what decides whether a sync
 * produces anything, and one connection can serve several projects, so only
 * the active project's mapping describes this row.
 */
export function useActiveMapping(
  workspaceId: string,
  connectionId: string,
  projectId: string | null,
) {
  const query = useQuery(integrationsQueries.mappings(workspaceId, connectionId));
  return activeMappingFor(query.data, projectId);
}

/**
 * The discovered properties, the project's own first. A property of another
 * site is shown but cannot be chosen: mapping it would be refused.
 */
function PropertyOptions({
  properties,
  selected,
  blocked,
  selecting,
  onSelect,
}: Readonly<{
  properties: IntegrationProperty[];
  selected: string;
  blocked: boolean;
  /** The selection mutation: its variables name the row being imported. */
  selecting: { isPending: boolean; variables?: string };
  onSelect: (propertyRef: string) => void;
}>) {
  const pendingRef = selecting.isPending ? selecting.variables : undefined;
  return ownPropertiesFirst(properties).map((property) => (
    <PropertyOption
      key={property.property_ref}
      property={property}
      selected={property.property_ref === selected}
      disabled={blocked || property.matches_project === false}
      pending={pendingRef === property.property_ref}
      onSelect={() => onSelect(property.property_ref)}
    />
  ));
}

/** The provider read's loading, failure or empty answer above the options. */
function DiscoveryState({
  pending,
  error,
  properties,
  noun,
}: Readonly<{
  pending: boolean;
  error: Error | null;
  properties: readonly IntegrationProperty[] | undefined;
  noun: string;
}>) {
  if (pending)
    return <StateBlock kind="loading" label={`Loading ${noun}s…`} shape={{ kind: 'list' }} />;
  if (error)
    return (
      <Notice
        kind="mutation"
        notice={mutationNoticeForError(error, { action: 'load your properties from the provider' })}
      />
    );
  if (properties?.length !== 0) return null;
  return <Notice tone="info">No {noun} on this account.</Notice>;
}

/**
 * The chosen property's name, or a visible "none selected". The mapping is
 * this project's; the connection is the workspace's.
 */
export function SelectedPropertyMark({
  connection,
}: Readonly<{ connection: IntegrationConnection }>) {
  const { activeProject } = useProjectContext();
  const mappings = useQuery(integrationsQueries.mappings(connection.workspace_id, connection.id));
  // Unread is unknown, never "none selected". It holds the code face's line,
  // so the row does not grow when the id lands.
  if (mappings.isPending)
    return (
      <span aria-hidden className={textRole('code')}>
        {' '}
      </span>
    );
  if (mappings.isError) return <Absence state="unavailable" label="Property unavailable" />;
  const selected = activeMappingFor(mappings.data, activeProject?.id ?? null)?.property_ref ?? '';
  if (!selected)
    return (
      <StatusMark variant="status" value="warning">
        No property selected
      </StatusMark>
    );
  // An id in the code face, cut to its share of the caption with the whole in a tooltip.
  return <ClampText className={textRole('code', 'text-ink-2')}>{selected}</ClampText>;
}

/**
 * Property picker for one integration connection: what the row's Select (or
 * Change) action needs and the dialog it opens. The dialog is returned apart
 * from the action, so a menu item can open it and close without unmounting it.
 *
 * A connected OAuth grant does not by itself tell a sync WHAT to pull: the
 * worker fetches from the connection's `account_ref`, and derivation resolves
 * that ref back to a project through an active property mapping. Selecting
 * here creates that mapping against the ACTIVE project, which is also what
 * points `account_ref` at the property — so an unselected connection syncs
 * nothing and says so, rather than failing against an empty property id.
 *
 * Options come from the provider itself (`POST …/properties`), never free
 * text, so a ref can't be typed wrong. That call is live and lazy: it runs
 * only once the dialog opens.
 */
export function usePropertyPicker(connection: IntegrationConnection) {
  const { activeProject } = useProjectContext();
  const mayDiscover = useWorkspaceCapability('manage_credentials');
  const activeMapping = useActiveMapping(
    connection.workspace_id,
    connection.id,
    activeProject?.id ?? null,
  );
  const [open, setOpen] = useState(false);

  const discovery = useMutation(
    integrationsMutations.discoverProperties(connection.workspace_id, connection.id),
  );

  // The descriptor refreshes the imported reads: account_ref moved with the mapping.
  const selectMutation = useMutation(
    integrationsMutations.createMapping(connection.workspace_id, connection.id),
  );
  // The options are blocked without a project, so a selection always names one.
  const selectProperty = (propertyRef: string) => {
    if (!activeProject) return;
    selectMutation.mutate(
      { provider: connection.provider, property_ref: propertyRef, project_id: activeProject.id },
      { onSuccess: () => setOpen(false) },
    );
  };

  // The active mapping, never the connection's account_ref — see
  // `useActiveMapping`. A stale account_ref would show a property as chosen
  // while every sync of it fails.
  const selected = activeMapping?.property_ref ?? '';
  const noun = PROVIDER_META[connection.provider].noun;
  const verb = selected ? 'Change' : 'Select';
  const openPicker = () => {
    if (discovery.isPending) return;
    discovery.reset();
    setOpen(true);
    discovery.mutate(activeProject?.id);
  };

  const dialog = mayDiscover ? (
    <Dialog
      open={open}
      // Hold the dialog open while a selection is in flight, matching the
      // sibling confirm dialog: dismissing mid-mutation would unmount the
      // only surface showing the pending row and any resulting error.
      onOpenChange={(next) => {
        if (!selectMutation.isPending) setOpen(next);
      }}
      title={`Choose a ${noun}`}
    >
      <Stack gap="compact">
        {!activeProject ? <Notice tone="warning">No active project.</Notice> : null}
        <DiscoveryState
          pending={discovery.isPending}
          error={discovery.error}
          properties={discovery.data}
          noun={noun}
        />
        <Stack gap="tight">
          <PropertyOptions
            properties={discovery.data ?? []}
            selected={selected}
            blocked={!activeProject || selectMutation.isPending}
            selecting={{
              isPending: selectMutation.isPending,
              variables: selectMutation.variables?.property_ref,
            }}
            onSelect={selectProperty}
          />
        </Stack>

        {selectMutation.isError ? (
          <Notice
            kind="mutation"
            notice={mutationNoticeForError(selectMutation.error, { action: 'save the property' })}
          />
        ) : null}
      </Stack>
    </Dialog>
  ) : null;

  return {
    /** Only a role that may discover properties chooses one. */
    allowed: mayDiscover,
    verb,
    /** "Change Search Console property": the action's accessible name. */
    label: `${verb} ${noun}`,
    pending: discovery.isPending,
    open: openPicker,
    dialog,
  };
}
