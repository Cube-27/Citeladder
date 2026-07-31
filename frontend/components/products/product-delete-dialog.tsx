'use client';

import { useQuery } from '@tanstack/react-query';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { MutationNotice } from '@/components/ui/mutation-notice';
import type { MutationNotice as MutationNoticeData } from '@/lib/api/mutation-notice';
import { productsApi } from '@/lib/api/products';
import { queryKeys } from '@/lib/api/query-keys';
import type { Product } from '@/lib/api/types';

/**
 * Delete-confirm dialog for one catalog product (D4). The delete itself is
 * always allowed — when the product is frozen into one or more audit
 * configurations the dialog says so (read-only `audit-references` check):
 * past runs keep their frozen copy and stay valid, so the warning is purely
 * informational ("deleting only stops FUTURE runs from measuring it").
 *
 * The check gates the Delete button only while it is PENDING, so the warning
 * cannot be raced past; once it SETTLES it fails open — an errored check
 * shows no warning and leaves Delete armed, since a read-only advisory must
 * never block a destructive action the user is entitled to take.
 */
export function ProductDeleteDialog({
  product,
  open,
  onOpenChange,
  onConfirm,
  isDeleting,
  notice,
}: Readonly<{
  /** The product pending deletion (null keeps the dialog closed). */
  product: Product | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void> | void;
  isDeleting?: boolean;
  /** The A4 mutation notice for a failed delete (verbatim 4xx, transient retry). */
  notice?: MutationNoticeData;
}>) {
  const enabled = open && product !== null;
  const referencesQuery = useQuery({
    queryKey: queryKeys.products.auditReferences(product?.id ?? ''),
    queryFn: ({ signal }) => productsApi.getAuditReferences(product!.id, { signal }),
    enabled,
  });
  const references = referencesQuery.data;
  // The check is still in flight: `data` is undefined here for the SAME reason
  // it is undefined on a settled failure, so treating undefined as "nothing
  // references it" armed Delete before the answer arrived — the user could
  // confirm during the gap and never see the warning. Block only while
  // PENDING; a settled error still fails open (see the component docstring).
  const checking = enabled && referencesQuery.isPending;

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
            disabled={isDeleting || product === null || checking}
          >
            {isDeleting ? 'Deleting…' : checking ? 'Checking…' : 'Delete'}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 py-2">
        {notice ? <MutationNotice notice={notice} /> : null}

        {checking ? (
          <p className="text-muted text-sm" aria-live="polite">
            Checking whether any audits reference this product…
          </p>
        ) : null}

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
