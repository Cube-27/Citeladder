import { useEffect, useRef, useState, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Stack } from '@/components/ui/layout';
import { List } from '@/lib/icons';
import type {
  IntegrationConnection,
  IntegrationProperty,
  IntegrationProvider,
} from '@/lib/api/integrations';

import { PROVIDER_META } from '@/components/settings/grant-model';

import { ownPropertiesFirst } from './data-sources';
import {
  PropertyDiscoveryState,
  PropertyOptions,
  PropertySaveFailure,
  usePropertyDiscovery,
} from './property-options';

const onlyItem = <T,>(items: readonly T[]) => (items.length === 1 ? items[0] : undefined);

function suggestedProperty(provider: IntegrationProvider, properties: IntegrationProperty[]) {
  const matching = properties.filter((property) => property.matches_project === true);
  return onlyItem(matching) ?? (provider === 'ga4' ? onlyItem(properties) : undefined) ?? null;
}

export function usePropertyChoice({
  provider,
  connection,
  projectId,
  autoStart,
}: Readonly<{
  provider: IntegrationProvider;
  connection: IntegrationConnection;
  projectId: string;
  autoStart: boolean;
}>): { action: ReactNode; body: ReactNode } {
  const source = PROVIDER_META[provider];
  const [showAll, setShowAll] = useState(false);
  const { discovery, select, pendingRef } = usePropertyDiscovery(connection);
  const discover = () => discovery.mutate(projectId);
  const choose = (propertyRef: string) =>
    select.mutate({ provider, property_ref: propertyRef, project_id: projectId });
  const started = useRef(false);
  useEffect(() => {
    if (!autoStart || started.current) return;
    started.current = true;
    discovery.mutate(projectId);
  }, [autoStart, discovery, projectId]);

  if (discovery.isIdle)
    return {
      action: (
        <Button variant="secondary" onClick={discover}>
          Choose {source.noun}
        </Button>
      ),
      body: null,
    };
  if (!discovery.isSuccess || discovery.data.length === 0)
    return {
      action: null,
      body: <PropertyDiscoveryState provider={provider} discovery={discovery} onRetry={discover} />,
    };
  const properties = ownPropertiesFirst(discovery.data);
  const suggested = suggestedProperty(provider, properties);
  const listed = !suggested || showAll;
  return {
    action: suggested ? (
      <SuggestionButtons
        label={`${suggested.label} for ${source.label}`}
        suggestedLabel={suggested.label}
        offerOthers={!listed && properties.length > 1}
        onShowAll={() => setShowAll(true)}
        onUse={() => choose(suggested.property_ref)}
        pending={pendingRef === suggested.property_ref}
        disabled={select.isPending}
      />
    ) : null,
    body:
      listed || select.isError ? (
        <Stack gap="compact">
          {listed ? (
            <PropertyOptions
              provider={provider}
              properties={properties}
              selected=""
              blocked={false}
              pendingRef={pendingRef}
              onSelect={choose}
            />
          ) : null}
          <PropertySaveFailure error={select.error} />
        </Stack>
      ) : null,
  };
}

function SuggestionButtons({
  label,
  suggestedLabel,
  offerOthers,
  onShowAll,
  onUse,
  pending,
  disabled,
}: Readonly<{
  label: string;
  suggestedLabel: string;
  offerOthers: boolean;
  onShowAll: () => void;
  onUse: () => void;
  pending: boolean;
  disabled: boolean;
}>) {
  return (
    <>
      {offerOthers ? (
        <Button variant="quiet" onClick={onShowAll}>
          <Icon icon={List} />
          Choose another
        </Button>
      ) : null}
      <Button
        variant="secondary"
        onClick={onUse}
        pending={pending}
        pendingLabel="Importing…"
        disabled={disabled}
        aria-label={`Use ${label}`}
      >
        Use {suggestedLabel}
      </Button>
    </>
  );
}
