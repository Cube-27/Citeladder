'use client';

import { useQuery } from '@tanstack/react-query';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { productsApi } from '@/lib/api/products';
import { queryKeys } from '@/lib/api/query-keys';
import type { Product } from '@/lib/api/types';

/**
 * Delete-confirm dialog for one catalog product (D4). The delete itself is
 * always allowed — when the product is frozen into one or more audit
 * configurations the dialog says so (read-only `audit-references` check):
 * past runs keep their frozen copy and stay valid, so the warning is purely
 * informational ("deleting only stops FUTURE runs from measuring it"). A
 * failed check fails open (no warning) rather than blocking the delete.
 */
export function ProductDeleteDialog({
  product,
  open,
  onOpenChange,
  onConfirm,
  isDeleting,
  error,
}: Readonly<{
  /** The product pending deletion (null keeps the dialog closed). */
  product: Product | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void> | void;
  isDeleting?: boolean;
  /** Delete-mutation failure, shown inside the dialog. */
  error?: string;
}>) {
  const referencesQuery = useQuery({
    queryKey: queryKeys.products.auditReferences(product?.id ?? ''),
    queryFn: ({ signal }) => productsApi.getAuditReferences(product!.id, { signal }),
    enabled: open && product !== null,
  });
  const references = referencesQuery.data;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Delete ${product?.name ?? 'product'}?`}
      description="This removes the product from the catalog. This cannot be undone."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isDeleting}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => void onConfirm()}
            disabled={isDeleting || product === null}
          >
            {isDeleting ? 'Deleting…' : 'Delete'}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 py-2">
        {error ? <Alert tone="danger">{error}</Alert> : null}

        {references?.referenced ? (
          <Alert tone="warning">
            This product is frozen into {references.audit_count} audit configuration
            {references.audit_count === 1 ? '' : 's'}. Past runs keep their frozen copy and stay
            valid — deleting only stops future runs from measuring it.
          </Alert>
        ) : null}

        {product ? (
          <p className="text-secondary text-sm">
            <span className="text-foreground font-medium">{product.name}</span> (
            <span className="font-mono text-xs">{product.sku}</span>) will be removed from the
            catalog.
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
