'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Dialog } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Pressable } from '@/components/ui/pressable';
import {
  integrationsApi,
  type IntegrationConnection,
  type IntegrationProperty,
} from '@/lib/api/integrations';
import { queryKeys } from '@/lib/api/query-keys';
import { humanizeApiError } from '@/lib/api/errors';
import { useProjectContext, useWorkspaceCapability } from '@/lib/project/project-context';
import { cn } from '@/lib/utils';
import { textRole } from '@/components/ui/typography';
import { tagClasses } from '@/components/ui/filter-chip-variants';

const PROVIDER_NOUN: Record<IntegrationConnection['provider'], string> = {
  gsc: 'Search Console property',
  ga4: 'Analytics property',
  bing: 'Bing site',
};

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
    <Pressable
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        'flex w-full items-center gap-3 rounded-[var(--radius-control)] px-3 py-2 text-start',
        'focus-ring enabled:hover:bg-hover enabled:active:bg-active',
        'disabled:pointer-events-none disabled:[&_.type-item-title]:text-muted',
        selected && 'bg-selected text-foreground enabled:hover:bg-selected',
      )}
    >
      <span className="min-w-0 flex-1">
        <span className={textRole('itemTitle', 'block truncate')}>{property.label}</span>
        <span className="type-caption block truncate tabular-nums">{property.property_ref}</span>
      </span>
      {pending ? <Spinner className="text-muted" /> : null}
      {selected && !pending ? <Check className="text-accent size-4 shrink-0" aria-hidden /> : null}
    </Pressable>
  );
}

/**
 * Property picker for one integration connection.
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
/**
 * The connection's ACTIVE property mapping, or `null`.
 *
 * The mapping — not `connection.account_ref` — is what decides whether a sync
 * produces anything: the worker fetches from `account_ref`, but derivation
 * then has to resolve that ref back to a project through an active mapping,
 * and a run whose mapping is missing fails `unmapped_property` after the
 * fetch. The two drift apart for real: mappings cascade away when their
 * project is deleted, while `account_ref` lives on the connection and
 * survives. Reading `account_ref` alone therefore renders a confidently
 * "selected" property whose every sync is failing.
 *
 * Shared with `integration-card` so the row's Sync button and the picker
 * agree; react-query dedupes the two subscribers onto one request.
 */
export function useActiveMapping(workspaceId: string, connectionId: string) {
  const query = useQuery({
    queryKey: queryKeys.integrations.mappings(connectionId),
    queryFn: ({ signal }) => integrationsApi.listMappings(connectionId, { signal, workspaceId }),
    staleTime: 60 * 1000,
  });
  return query.data?.find((mapping) => mapping.status === 'active') ?? null;
}

export function PropertyPicker({
  connection,
  disabled = false,
}: Readonly<{ connection: IntegrationConnection; disabled?: boolean }>) {
  const queryClient = useQueryClient();
  const { activeProject } = useProjectContext();
  const mayDiscover = useWorkspaceCapability('manage_credentials');
  const activeMapping = useActiveMapping(connection.workspace_id, connection.id);
  const [open, setOpen] = useState(false);
  const [pendingRef, setPendingRef] = useState<string | null>(null);

  const discovery = useMutation({
    mutationFn: () =>
      integrationsApi.discoverProperties(connection.id, {
        workspaceId: connection.workspace_id,
      }),
    retry: false,
  });

  const selectMutation = useMutation({
    mutationFn: (propertyRef: string) => {
      if (!activeProject) throw new Error('Select a project first.');
      return integrationsApi.createMapping(
        connection.id,
        {
          provider: connection.provider,
          property_ref: propertyRef,
          project_id: activeProject.id,
        },
        { workspaceId: connection.workspace_id },
      );
    },
    onSuccess: async () => {
      setOpen(false);
      setPendingRef(null);
      // account_ref moved with the mapping — refresh the connection list.
      await queryClient.invalidateQueries({ queryKey: queryKeys.integrations.all });
    },
    onError: () => setPendingRef(null),
  });

  // The active mapping, never the connection's account_ref — see
  // `useActiveMapping`. A stale account_ref would show a property as chosen
  // while every sync of it fails.
  const selected = activeMapping?.property_ref ?? '';
  const noun = PROVIDER_NOUN[connection.provider];

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        {selected ? (
          <span className={tagClasses('outline', 'max-w-full truncate tabular-nums')}>
            {selected}
          </span>
        ) : (
          <span
            className={textRole(
              'label',
              'text-warning-text bg-warning-bg/50 max-w-full truncate rounded-xs px-2 py-0.5',
            )}
          >
            No {noun} selected
          </span>
        )}
        {mayDiscover ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (discovery.isPending) return;
              discovery.reset();
              setOpen(true);
              discovery.mutate();
            }}
            disabled={disabled || discovery.isPending}
            data-testid={`select-property-${connection.provider}`}
          >
            {selected ? 'Change' : 'Select'}
          </Button>
        ) : null}
      </div>

      <Dialog
        open={open}
        // Hold the dialog open while a selection is in flight, matching the
        // sibling confirm dialog: dismissing mid-mutation would unmount the
        // only surface showing the pending row and any resulting error.
        onOpenChange={(next) => {
          if (!selectMutation.isPending) setOpen(next);
        }}
        title={`Choose a ${noun}`}
        description={
          activeProject
            ? `Data for the selected property is imported into ${activeProject.name}.`
            : 'Select a project before choosing a property.'
        }
      >
        <div className="grid gap-2 py-3">
          {!activeProject ? (
            <Alert tone="warning">
              No active project. Create or select a project first — a property must be imported into
              one.
            </Alert>
          ) : null}

          {discovery.isPending ? (
            <>
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </>
          ) : null}

          {discovery.isError ? (
            <Alert tone="danger">
              Could not load your properties from the provider.{' '}
              {humanizeApiError(discovery.error).message}
            </Alert>
          ) : null}

          {discovery.data?.length === 0 ? (
            <Alert tone="neutral">
              This account has no {noun} available. Verify the property in the provider&rsquo;s own
              console first, then reopen this dialog.
            </Alert>
          ) : null}

          {discovery.data?.map((property) => (
            <PropertyOption
              key={property.property_ref}
              property={property}
              selected={property.property_ref === selected}
              disabled={!activeProject || selectMutation.isPending}
              pending={pendingRef === property.property_ref}
              onSelect={() => {
                setPendingRef(property.property_ref);
                selectMutation.mutate(property.property_ref);
              }}
            />
          ))}

          {selectMutation.isError ? (
            <Alert tone="danger">{humanizeApiError(selectMutation.error).message}</Alert>
          ) : null}
        </div>
      </Dialog>
    </>
  );
}
