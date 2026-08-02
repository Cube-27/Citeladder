'use client';

import { useMemo, useRef, useState } from 'react';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { MutationNotice } from '@/components/ui/mutation-notice';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { MutationNotice as MutationNoticeData } from '@/lib/api/mutation-notice';
import type { ProductInput } from '@/lib/api/products';
import type { ProductImportSummary } from '@/lib/api/types';
import { parseProductCsv, validProductRows, type ParsedProductCsv } from '@/lib/products/csv';

/** Read a File as text, falling back to FileReader where `File.text` is absent (jsdom). */
const readFileText = (file: File) =>
  typeof file.text === 'function'
    ? file.text()
    : new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ''));
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
      });

/**
 * Product CSV import dialog (mirrors the prompts CSV import dialog). The file
 * is parsed + validated in the browser and previewed (with per-row
 * warnings/errors) BEFORE anything is persisted. On confirm, only the
 * importable rows are handed to `onImport`, which posts them to the
 * `/projects/{id}/products/import` endpoint. A header row is required —
 * matching the backend. After a successful import the dialog stays open on
 * the server-side outcome (D1): created/skipped counts and the reason every
 * skipped row was dropped, so silent skips are impossible (COM-4).
 */
export function ProductImportDialog({
  open,
  onOpenChange,
  onImport,
  isImporting,
  error,
  onRetry,
  result,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (rows: ProductInput[]) => Promise<void> | void;
  isImporting?: boolean;
  /** The A4 mutation notice for a failed import (verbatim 4xx, transient retry). */
  error?: MutationNoticeData;
  /** Retry affordance for a transient import failure (re-posts the same rows). */
  onRetry?: () => void;
  /** The server-side import summary (D1) — shown after a successful import. */
  result?: ProductImportSummary | null;
}>) {
  const [parsed, setParsed] = useState<ParsedProductCsv | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const importable = useMemo(() => (parsed ? validProductRows(parsed) : []), [parsed]);
  const errorCount = parsed ? parsed.rows.filter((row) => row.errors.length > 0).length : 0;

  const reset = () => {
    setParsed(null);
    setFileName(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    const text = await readFileText(file);
    setParsed(parseProductCsv(text));
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const confirm = async () => {
    if (importable.length === 0) return;
    await onImport(importable);
  };

  if (result) {
    return (
      <Dialog
        open={open}
        onOpenChange={handleOpenChange}
        title="Import complete"
        description="The server-side outcome of the import — every skipped row is named."
        className="w-215"
        footer={
          <Button variant="primary" onClick={() => handleOpenChange(false)}>
            Done
          </Button>
        }
      >
        <ImportResultSummary result={result} />
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={handleOpenChange}
      title="Import products from CSV"
      description="Columns: name, sku, variant, category, price, currency, url, gtin (header row required)."
      className="w-215"
      footer={
        <>
          <Button variant="ghost" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => void confirm()}
            disabled={isImporting || importable.length === 0}
          >
            {isImporting
              ? 'Importing…'
              : `Import ${importable.length} product${importable.length === 1 ? '' : 's'}`}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {error ? <MutationNotice notice={error} onRetry={onRetry} /> : null}

        <label className="grid gap-1.5">
          <span className="text-secondary text-xs font-medium">CSV file</span>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            aria-label="CSV file"
            onChange={(event) => void handleFile(event.target.files?.[0])}
            className="focus-ring border-border bg-well text-foreground file:bg-background-alt file:text-foreground block w-full rounded-sm border px-2 py-1.5 text-sm file:me-2 file:rounded-xs file:border-0 file:px-2 file:py-1 file:text-sm"
          />
        </label>

        {parsed && parsed.errors.length > 0 ? (
          <Alert tone="danger">{parsed.errors.join(' ')}</Alert>
        ) : null}

        {parsed && parsed.rows.length > 0 ? (
          <div className="grid gap-2">
            <div className="text-secondary flex items-center gap-3 text-sm">
              <span>
                Parsed <strong className="text-foreground">{parsed.rows.length}</strong> row
                {parsed.rows.length === 1 ? '' : 's'}
                {fileName ? ` from ${fileName}` : ''}.
              </span>
              {errorCount > 0 ? (
                <Badge variant="status" value="danger">
                  {errorCount} skipped
                </Badge>
              ) : null}
            </div>

            <div className="border-border-subtle max-h-85 overflow-auto rounded-sm border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Row</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Variant</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Currency</TableHead>
                    <TableHead>URL</TableHead>
                    <TableHead>GTIN</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsed.rows.map((row) => {
                    const invalid = row.errors.length > 0;
                    const attributes = row.input.attributes ?? {};
                    return (
                      <TableRow key={row.line} className={invalid ? 'opacity-60' : undefined}>
                        <TableCell numeric className="text-muted">
                          {row.line}
                        </TableCell>
                        <TableCell className="max-w-45 truncate">{row.input.name || '—'}</TableCell>
                        <TableCell className="font-mono text-xs">{row.input.sku || '—'}</TableCell>
                        <TableCell className="max-w-35 truncate">
                          {row.input.variants?.[0]?.name || '—'}
                        </TableCell>
                        <TableCell>{String(attributes.category ?? '') || '—'}</TableCell>
                        <TableCell numeric>
                          {row.input.price !== null && row.input.price !== undefined
                            ? row.input.price
                            : '—'}
                        </TableCell>
                        <TableCell>{row.input.currency || '—'}</TableCell>
                        <TableCell className="max-w-40 truncate">{row.input.url || '—'}</TableCell>
                        <TableCell>{String(attributes.gtin ?? '') || '—'}</TableCell>
                        <TableCell>
                          {invalid ? (
                            <span className="text-danger-text text-xs">{row.errors.join(' ')}</span>
                          ) : row.warnings.length > 0 ? (
                            <span className="text-warning-text text-xs">
                              {row.warnings.join(' ')}
                            </span>
                          ) : (
                            <span className="text-success-text text-xs">Ready</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}

/**
 * The server-side import outcome (D1): created/skipped counts as badges
 * (the text carries the meaning, never color-only) plus one row per skipped
 * source row with its number, field, and reason — replacing the old silent
 * 201 (COM-4). `updated` is reserved and always 0 in v1, so it is not shown.
 */
function ImportResultSummary({ result }: Readonly<{ result: ProductImportSummary }>) {
  return (
    <div className="grid gap-4 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="status" value="success">
          {result.created} created
        </Badge>
        {result.skipped > 0 ? (
          <Badge variant="status" value="warning">
            {result.skipped} skipped
          </Badge>
        ) : (
          <Badge variant="status" value="success">
            0 skipped
          </Badge>
        )}
      </div>

      {result.errors.length === 0 ? (
        <Alert tone="success">Every row imported — no rows were skipped.</Alert>
      ) : (
        <div className="grid gap-2">
          <p className="text-secondary text-sm">
            {result.errors.length} row{result.errors.length === 1 ? ' was' : 's were'} skipped. Fix
            them in the file and import again — already-imported SKUs are left unchanged.
          </p>
          <div className="border-border-subtle max-h-75 overflow-auto rounded-sm border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Row</TableHead>
                  <TableHead>Field</TableHead>
                  <TableHead className="min-w-80">Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.errors.map((rowError) => (
                  <TableRow key={`${rowError.row}:${rowError.field}`}>
                    <TableCell numeric className="text-muted">
                      {rowError.row}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{rowError.field || '—'}</TableCell>
                    <TableCell className="text-secondary text-sm">{rowError.message}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
