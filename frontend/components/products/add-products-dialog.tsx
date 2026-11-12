'use client';

import { useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { CsvImportFileInput } from '@/components/ui/csv-import';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Inline, Stack } from '@/components/ui/layout';
import { TreeCheckOption, TreeList } from '@/components/ui/list-row';
import { MutationNotice } from '@/components/ui/mutation-notice';
import { TabPanel, Tabs } from '@/components/ui/tabs';
import { textRole } from '@/components/ui/typography';
import { ledgerClasses, ledgerItemClasses } from '@/components/ui/workspace';
import { commerceMutations } from '@/lib/api/commerce';
import { mutationNoticeForError } from '@/lib/api/mutation-notice';
import { downloadCsv } from '@/lib/csv/download';
import { READ_FAILED_MESSAGE, readCsvFileText } from '@/lib/csv/read-file-text';
import { pluralCount } from '@/lib/format';
import {
  CATALOG_SAMPLE,
  MERCHANT_FEED_SAMPLE,
  leftOutCategories,
  type SampleCsv,
} from '@/lib/products/catalog-import';
import type { CatalogImportRequest } from '@citeladder/contracts/commerce-requests';
import type { CatalogImport, CatalogImportStage } from '@citeladder/contracts/commerce-suite';

type Source = CatalogImportRequest['source'];
const SOURCES = [
  { value: 'shopify', label: 'Shopify store' },
  { value: 'merchant_center', label: 'Merchant Center feed' },
  { value: 'csv', label: 'CSV' },
] as const satisfies readonly { value: Source; label: string }[];

const STATUS_LABEL: Record<CatalogImport['row_outcomes'][number]['status'], string> = {
  created: 'Added',
  updated: 'Updated',
  unchanged: 'Unchanged',
  rejected: 'Rejected',
};

/** A file picker for one feed or CSV file, naming the file chosen, with its sample download. */
function FilePick({
  label,
  accept,
  file,
  onFile,
  sample,
}: Readonly<{
  label: string;
  accept: string;
  file: File | null;
  onFile: (file: File | null) => void;
  sample: SampleCsv;
}>) {
  return (
    <Stack gap="compact">
      <CsvImportFileInput label={label} accept={accept} onSelect={(next) => onFile(next ?? null)} />
      {file ? <p className={textRole('body')}>Chosen: {file.name}</p> : null}
      <div>
        <Button
          variant="secondary"
          onClick={() => downloadCsv(sample.filename, sample.columns, sample.rows)}
        >
          Download sample CSV
        </Button>
      </div>
    </Stack>
  );
}

/** The proposed category tree with a box per category; a cleared box leaves out its branch. */
function CategoryReview({
  stage,
  unticked,
  onToggle,
}: Readonly<{
  stage: CatalogImportStage;
  unticked: ReadonlySet<string>;
  onToggle: (key: string) => void;
}>) {
  const leftOut = leftOutCategories(stage.categories, unticked);
  return (
    <Stack>
      <p className={textRole('body')}>
        {pluralCount(stage.products, 'product')} ready from {stage.source_label}
        {stage.rejected ? `; ${pluralCount(stage.rejected, 'row')} cannot be imported` : ''}.
      </p>
      {stage.categories.length ? (
        <Stack gap="compact">
          <h3 className={textRole('itemTitle')}>Categories</h3>
          <p className={textRole('body')}>
            Clear a category to leave it and the categories under it out of your catalog.
          </p>
          <TreeList label="Proposed categories">
            {stage.categories.map((node) => (
              <TreeCheckOption
                key={node.key}
                label={`${node.name} (${pluralCount(node.product_count, 'product')})`}
                depth={node.depth}
                checked={!leftOut.has(node.key)}
                disabled={leftOut.has(node.key) && !unticked.has(node.key)}
                badge={node.existing ? <Badge>In catalog</Badge> : null}
                onCheckedChange={() => onToggle(node.key)}
              />
            ))}
          </TreeList>
        </Stack>
      ) : (
        <p className={textRole('body')}>The file names no categories.</p>
      )}
    </Stack>
  );
}

/** Added, updated, unchanged and rejected rows; rejected rows first, each with its reason. */
function ImportResults({
  result,
  repeated,
}: Readonly<{ result: CatalogImport; repeated: boolean }>) {
  return (
    <Stack>
      {repeated ? (
        <Callout tone="info">This content was imported before; these are its results.</Callout>
      ) : null}
      <p aria-label="Import results" className={textRole('body')}>
        {result.created} added, {result.updated} updated, {result.unchanged} unchanged,{' '}
        {result.rejected} rejected
      </p>
      {result.row_outcomes.length ? (
        <ul className={ledgerClasses()} aria-label="Rows">
          {result.row_outcomes.map((row) => (
            <Inline
              as="li"
              key={row.row_number}
              gap="compact"
              className={ledgerItemClasses('flex-wrap')}
            >
              <span className="text-ink-tertiary tabular-nums">Row {row.row_number}</span>
              {row.status === 'rejected' ? (
                <Badge variant="status" value="danger">
                  {STATUS_LABEL[row.status]}
                </Badge>
              ) : (
                <Badge>{STATUS_LABEL[row.status]}</Badge>
              )}
              {row.detail ? <span className="text-ink-secondary">{row.detail}</span> : null}
            </Inline>
          ))}
        </ul>
      ) : null}
    </Stack>
  );
}

/**
 * Add products from a Shopify store, a Merchant Center feed or the CSV
 * template (CM3): stage the source, confirm its category tree, then read what
 * was added, updated, unchanged and rejected.
 */
export function AddProductsDialog({
  workspaceId,
  projectId,
  open,
  onOpenChange,
}: Readonly<{
  workspaceId: string;
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>) {
  const scope = { workspaceId, projectId };
  const stage = useMutation(commerceMutations.stageImport(scope));
  const apply = useMutation(commerceMutations.applyImport(scope));
  const [source, setSource] = useState<Source>('shopify');
  const [store, setStore] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [unticked, setUnticked] = useState<ReadonlySet<string>>(new Set());
  const [readError, setReadError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  // Set before the file read starts, so a second click cannot stage it twice.
  const submitting = useRef(false);

  const reset = () => {
    stage.reset();
    apply.reset();
    setStore('');
    setFile(null);
    setUnticked(new Set());
    setReadError(null);
    submitting.current = false;
  };
  const close = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };
  const staged = stage.data;
  const result = apply.data ?? staged?.result ?? null;
  const ready = source === 'shopify' ? store.trim().length > 0 : file !== null;

  const chooseFile = (next: File | null) => {
    setFile(next);
    setReadError(null);
  };
  // Held from the click until the stage request settles.
  const settled = {
    onSettled: () => {
      submitting.current = false;
    },
  };
  const submit = async () => {
    if (submitting.current) return;
    if (source === 'shopify') {
      submitting.current = true;
      return stage.mutate({ source, store: store.trim() }, settled);
    }
    if (!file) return;
    submitting.current = true;
    setReading(true);
    setReadError(null);
    let content: string;
    try {
      content = await readCsvFileText(file);
    } catch (cause) {
      submitting.current = false;
      setReadError(cause instanceof Error ? cause.message : READ_FAILED_MESSAGE);
      return;
    } finally {
      setReading(false);
    }
    stage.mutate({ source, content, filename: file.name }, settled);
  };
  const toggle = (key: string) =>
    setUnticked((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  let body;
  let footer;
  if (result) {
    body = <ImportResults result={result} repeated={!apply.data} />;
    footer = (
      <Button variant="primary" onClick={() => close(false)}>
        Done
      </Button>
    );
  } else if (staged) {
    body = (
      <Stack>
        <CategoryReview stage={staged} unticked={unticked} onToggle={toggle} />
        {apply.error ? (
          <MutationNotice
            notice={mutationNoticeForError(apply.error, { action: 'import the products' })}
          />
        ) : null}
      </Stack>
    );
    footer = (
      <>
        <Button variant="secondary" disabled={apply.isPending} onClick={() => stage.reset()}>
          Back
        </Button>
        <Button
          variant="primary"
          disabled={apply.isPending || staged.products === 0}
          onClick={() =>
            apply.mutate({
              importId: staged.import_id,
              // Every category shown cleared, so one also reached by a path
              // without its cleared parent is left out as the review showed.
              excluded_categories: [...leftOutCategories(staged.categories, unticked)],
            })
          }
        >
          {apply.isPending ? 'Importing…' : `Import ${pluralCount(staged.products, 'product')}`}
        </Button>
      </>
    );
  } else {
    body = (
      <Stack>
        <Tabs
          items={SOURCES}
          ariaLabel="Product source"
          value={source}
          onValueChange={(next) => {
            setSource(next);
            chooseFile(null);
          }}
          spaced
        >
          <TabPanel value="shopify">
            <Field
              label="Store domain"
              hint="Your own domain or your store’s .myshopify.com address. Its public product list is read once."
            >
              {(props) => (
                <Input
                  {...props}
                  value={store}
                  placeholder="shop.example.com"
                  onChange={(event) => setStore(event.target.value)}
                />
              )}
            </Field>
          </TabPanel>
          <TabPanel value="merchant_center">
            <FilePick
              label="Feed file (CSV, TSV, XML or JSON)"
              accept=".csv,.tsv,.txt,.xml,.json"
              file={file}
              onFile={chooseFile}
              sample={MERCHANT_FEED_SAMPLE}
            />
          </TabPanel>
          <TabPanel value="csv">
            <Stack gap="compact">
              <FilePick
                label="CSV file"
                accept=".csv,text/csv"
                file={file}
                onFile={chooseFile}
                sample={CATALOG_SAMPLE}
              />
              <p className={textRole('body')}>
                Title and brand are required. A category is a path such as Footwear &gt; Running.
              </p>
            </Stack>
          </TabPanel>
        </Tabs>
        {readError ? <Callout tone="negative">{readError}</Callout> : null}
        {stage.error ? (
          <MutationNotice
            notice={mutationNoticeForError(stage.error, { action: 'read the products' })}
          />
        ) : null}
      </Stack>
    );
    footer = (
      <>
        <Button variant="secondary" onClick={() => close(false)}>
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={!ready || reading || stage.isPending}
          onClick={() => void submit()}
        >
          {reading || stage.isPending ? 'Reading…' : 'Review categories'}
        </Button>
      </>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title="Add products"
      description="Products go live only after you confirm their categories."
      width="wide"
      footer={footer}
    >
      {body}
    </Dialog>
  );
}
