import { useMutation } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { OptionGroup, OptionRow } from '@/components/ui/list-row';
import { Notice } from '@/components/ui/notice';
import { StateBlock } from '@/components/ui/state-block';
import { PROVIDER_META } from '@/components/settings/grant-model';
import {
  integrationsMutations,
  type IntegrationConnection,
  type IntegrationProperty,
  type IntegrationProvider,
} from '@/lib/api/integrations';
import { RefreshCw } from '@/lib/icons';

import { ownPropertiesFirst } from './data-sources';

export function usePropertyDiscovery(connection: IntegrationConnection) {
  const discovery = useMutation(
    integrationsMutations.discoverProperties(connection.workspace_id, connection.id),
  );
  const select = useMutation(
    integrationsMutations.createMapping(connection.workspace_id, connection.id),
  );
  const pendingRef = select.isPending ? (select.variables?.property_ref ?? null) : null;
  return { discovery, select, pendingRef };
}

export function PropertyDiscoveryState({
  provider,
  discovery,
  onRetry,
}: Readonly<{
  provider: IntegrationProvider;
  discovery: Readonly<{
    isPending: boolean;
    error: Error | null;
    data: readonly IntegrationProperty[] | undefined;
  }>;
  onRetry: () => void;
}>) {
  const source = PROVIDER_META[provider];
  if (discovery.isPending)
    return (
      <StateBlock
        kind="loading"
        label={`Loading your ${source.noun}s…`}
        shape={{ kind: 'list', rows: 2 }}
      />
    );
  if (discovery.error)
    return (
      <Notice
        kind="mutation"
        error={discovery.error}
        act={`load your ${source.noun}s`}
        recovery={
          <Button variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        }
      />
    );
  if (discovery.data?.length !== 0) return null;
  return (
    <Notice tone="info">
      This account has no {source.noun}. Add and verify the site in {source.console}, then{' '}
      <Button variant="quiet" onClick={onRetry}>
        <Icon icon={RefreshCw} />
        check again
      </Button>
    </Notice>
  );
}

export function PropertyOptions({
  provider,
  properties,
  selected,
  blocked,
  pendingRef,
  onSelect,
}: Readonly<{
  provider: IntegrationProvider;
  properties: readonly IntegrationProperty[];
  selected: string;
  blocked: boolean;
  pendingRef: string | null;
  onSelect: (propertyRef: string) => void;
}>) {
  const ordered = ownPropertiesFirst(properties);
  const open = (property: IntegrationProperty) => !blocked && property.matches_project !== false;
  const stop =
    ordered.find((property) => property.property_ref === selected && open(property)) ??
    ordered.find(open);
  return (
    <OptionGroup label={PROVIDER_META[provider].noun}>
      {ordered.map((property) => (
        <OptionRow
          key={property.property_ref}
          title={property.label}
          caption={
            property.matches_project === false
              ? 'Belongs to a different site'
              : property.property_ref
          }
          selected={property.property_ref === selected}
          pending={pendingRef === property.property_ref}
          busy={pendingRef !== null}
          disabled={!open(property)}
          tabStop={property === stop}
          onSelect={() => onSelect(property.property_ref)}
        />
      ))}
    </OptionGroup>
  );
}

export function PropertySaveFailure({ error }: Readonly<{ error: Error | null }>) {
  if (!error) return null;
  return <Notice kind="mutation" error={error} act="save the property" />;
}
