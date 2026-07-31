'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import { Package, Plus, Upload } from 'lucide-react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardEyebrow } from '@/components/ui/card';
import { IconChip } from '@/components/ui/icon-chip';
import { Skeleton } from '@/components/ui/skeleton';
import { displayHeadingLgClasses } from '@/components/ui/typography';
import { integrationsApi, type IntegrationSyncRun } from '@/lib/api/integrations';
import { mutationNoticeForError } from '@/lib/api/mutation-notice';
import { productsApi, type ProductInput } from '@/lib/api/products';
import { queryKeys } from '@/lib/api/query-keys';
import type { Product } from '@/lib/api/types';
import { isActiveSyncRun, SYNC_RUN_POLL_MS } from '@/lib/integrations/sync-runs';
import type { useCatalogQueries } from '@/lib/products/use-products-screen';

import { CatalogTable } from './catalog-table';
import { ProductDeleteDialog } from './product-delete-dialog';
import { ProductFormDialog } from './product-form-dialog';
import { ProductImportDialog } from './product-import-dialog';

type CatalogQueries = ReturnType<typeof useCatalogQueries>;

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong. Please try again.';
}

/**
 * Catalog tab container (Commerce workspace). Receives the active Catalog
 * queries from the screen (instantiated there so they stay disabled while
 * another tab is active), owns every CRUD + import mutation, and polls each
 * connection's ACTIVE latest sync at `SYNC_RUN_POLL_MS` until terminal —
 * the terminal transition invalidates the catalog, health, and integration
 * namespaces. Renders the toolbar (Add product / Import CSV) above the
 * catalog table, with the empty state when the catalog is empty.
 */
export function CatalogPanel({
  projectId,
  queries,
}: Readonly<{ projectId: string; queries: CatalogQueries }>) {
  const queryClient = useQueryClient();
  const { productsQuery, catalogHealthQuery } = queries;

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | undefined>(undefined);
  const [importOpen, setImportOpen] = useState(false);
  // The product awaiting delete confirmation (D4) — non-null opens the dialog.
  const [pendingDelete, setPendingDelete] = useState<Product | null>(null);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.products.list(projectId) });
  };

  // Open the import dialog on a CLEAN slate. Closing already resets the
  // mutation, but only via `onOpenChange(false)` — a reopen that skipped that
  // path (or any future one) would render the previous run's completion
  // summary instead of the upload form, so clearing here is what actually
  // guarantees the result prop is null when the dialog mounts.
  const openImport = () => {
    importMutation.reset();
    setImportOpen(true);
  };

  const createMutation = useMutation({
    mutationFn: (input: ProductInput) => productsApi.create(projectId, input),
    onSuccess: async () => {
      await invalidate();
      setFormOpen(false);
      setEditing(undefined);
    },
  });

  const updateMutation = useMutation({
    mutationFn: (vars: { id: string; input: ProductInput }) =>
      productsApi.update(vars.id, vars.input),
    onSuccess: async () => {
      await invalidate();
      setFormOpen(false);
      setEditing(undefined);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => productsApi.remove(id),
    onSuccess: async () => {
      await invalidate();
      setPendingDelete(null);
    },
  });

  const importMutation = useMutation({
    mutationFn: (rows: ProductInput[]) => productsApi.importRows(projectId, rows),
    // The dialog stays open on the server-side summary (D1); it closes from
    // its own Done button, which resets the mutation below.
    onSuccess: invalidate,
  });

  const health = catalogHealthQuery.data;

  // Every connection whose latest sync is still active gets polled on its
  // existing integration sync detail (terminal rows are never polled).
  const activeSyncs = useMemo(
    () =>
      (health?.connections ?? []).filter(
        (connection) =>
          connection.latest_sync !== null && isActiveSyncRun(connection.latest_sync.status),
      ),
    [health],
  );

  // `useQueries` keeps the hook count fixed across the variable fan-out
  // (the F5/F6 idiom); each query stops itself on a terminal status.
  const syncQueries = useQueries({
    queries: activeSyncs.map((connection) => {
      const syncRunId = connection.latest_sync!.sync_run_id;
      return {
        queryKey: queryKeys.integrations.sync(connection.connection_id, syncRunId),
        queryFn: ({ signal }: { signal: AbortSignal }) =>
          integrationsApi.getSync(connection.connection_id, syncRunId, { signal }),
        refetchInterval: (query: { state: { data?: IntegrationSyncRun; status: string } }) => {
          if (query.state.status === 'error') return false;
          const polled = query.state.data;
          if (!polled) return SYNC_RUN_POLL_MS;
          return isActiveSyncRun(polled.status) ? SYNC_RUN_POLL_MS : false;
        },
      };
    }),
  });

  // The freshest polled status per connection (drives the live Sync cell
  // while the health projection catches up).
  const syncOverrides = useMemo(() => {
    const overrides: Record<string, IntegrationSyncRun> = {};
    for (const query of syncQueries) {
      const run = query.data;
      if (run) overrides[run.connection_id] = run;
    }
    return overrides;
  }, [syncQueries]);

  const allTerminal =
    activeSyncs.length > 0 &&
    syncQueries.every((query) => query.data !== undefined && !isActiveSyncRun(query.data.status));

  // Every active run reached a terminal status: the new projection is
  // (being) persisted — invalidate the health, catalog, and integration
  // namespaces so the table re-reads the terminal state.
  useEffect(() => {
    if (!allTerminal) return;
    void queryClient.invalidateQueries({ queryKey: queryKeys.commerce.catalogHealth(projectId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.products.list(projectId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.integrations.all });
  }, [allTerminal, queryClient, projectId]);

  if (productsQuery.isLoading) {
    return (
      <Card aria-hidden>
        <CardContent className="grid gap-3">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-48 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (productsQuery.isError) {
    return (
      <Alert tone="danger">
        Could not load the product catalog.{' '}
        <button type="button" className="underline" onClick={() => productsQuery.refetch()}>
          Retry
        </button>
      </Alert>
    );
  }

  const products = productsQuery.data ?? [];

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-secondary text-sm">
          {products.length} product{products.length === 1 ? '' : 's'} in the catalog
        </p>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={openImport}>
            <Upload className="size-4" aria-hidden />
            Import CSV
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setEditing(undefined);
              setFormOpen(true);
            }}
          >
            <Plus className="size-4" aria-hidden />
            Add product
          </Button>
        </div>
      </div>

      {products.length === 0 ? (
        <Card>
          <CardContent className="grid justify-items-center gap-4 py-12 text-center">
            <CardEyebrow>Catalog</CardEyebrow>
            <IconChip>
              <Package className="size-6" aria-hidden />
            </IconChip>
            <div className="grid gap-1">
              <h2 className={displayHeadingLgClasses}>No products yet</h2>
              <p className="text-secondary max-w-md text-sm">
                Add the products you sell — manually or via CSV — so audits can measure how AI
                answer engines rank and price them against competitor products.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="md" onClick={openImport}>
                Import CSV
              </Button>
              <Button variant="primary" size="md" onClick={() => setFormOpen(true)}>
                Add your first product
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <CatalogTable
          products={products}
          health={health ?? null}
          healthPending={catalogHealthQuery.isPending}
          syncOverrides={syncOverrides}
          onEdit={(product) => {
            setEditing(product);
            setFormOpen(true);
          }}
          onDelete={(product) => setPendingDelete(product)}
        />
      )}

      <ProductFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        product={editing}
        isSaving={createMutation.isPending || updateMutation.isPending}
        error={
          createMutation.isError
            ? errorMessage(createMutation.error)
            : updateMutation.isError
              ? errorMessage(updateMutation.error)
              : undefined
        }
        onSubmit={async (input) => {
          if (editing) {
            await updateMutation.mutateAsync({ id: editing.id, input });
          } else {
            await createMutation.mutateAsync(input);
          }
        }}
      />

      <ProductImportDialog
        open={importOpen}
        onOpenChange={(open) => {
          // Closing clears the finished/failed mutation so a reopen starts
          // fresh (never a stale summary or error notice).
          if (!open) importMutation.reset();
          setImportOpen(open);
        }}
        isImporting={importMutation.isPending}
        error={
          importMutation.isError
            ? mutationNoticeForError(importMutation.error, { action: 'import the products' })
            : undefined
        }
        onRetry={() => {
          // Re-post the exact failed row set (existing SKUs are skipped, so a
          // retry never double-imports).
          if (importMutation.variables) importMutation.mutate(importMutation.variables);
        }}
        result={importMutation.data?.summary ?? null}
        onImport={async (rows) => {
          await importMutation.mutateAsync(rows);
        }}
      />

      <ProductDeleteDialog
        product={pendingDelete}
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDelete(null);
            deleteMutation.reset();
          }
        }}
        isDeleting={deleteMutation.isPending}
        notice={
          deleteMutation.isError
            ? mutationNoticeForError(deleteMutation.error, { action: 'delete the product' })
            : undefined
        }
        onConfirm={() => {
          // `mutate`, not `mutateAsync`: nothing awaits the result here, and an
          // un-awaited rejected promise is an unhandled rejection. Failure is
          // surfaced through `deleteMutation.isError` above — the same pattern
          // the import flow uses.
          if (pendingDelete) deleteMutation.mutate(pendingDelete.id);
        }}
      />
    </div>
  );
}
